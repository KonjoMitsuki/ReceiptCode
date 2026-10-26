import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';

const ENDPOINT = '/api/dev/ocr-benchmark/vision';
const MAX_BYTES = 10 * 1024 * 1024;
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

function reply(response: ServerResponse, status: number, body: object) {
  response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  response.end(JSON.stringify(body));
}

async function readImage(request: IncomingMessage, signal: AbortSignal): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    const cleanup = () => {
      request.removeListener('data', data);
      request.removeListener('end', end);
      request.removeListener('error', failed);
      request.removeListener('aborted', failed);
      signal.removeEventListener('abort', failed);
    };
    const failed = () => { cleanup(); chunks.length = 0; request.resume(); reject(new Error('read-failed')); };
    const end = () => { cleanup(); resolve(Buffer.concat(chunks)); };
    const data = (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BYTES) {
        cleanup();
        chunks.length = 0;
        request.resume();
        reject(new Error('too-large'));
      } else chunks.push(chunk);
    };
    if (signal.aborted) { failed(); return; }
    request.on('data', data);
    request.on('end', end);
    request.on('error', failed);
    request.on('aborted', failed);
    signal.addEventListener('abort', failed, { once: true });
  });
}

/** 開発サーバー専用。静的ビルド/previewにはAPIも認証情報も含めない。 */
export function googleVisionPlugin(env: Record<string, string | undefined>, send: typeof fetch = fetch): Plugin {
  const enabled = env.OCR_BENCHMARK_GOOGLE_ENABLED === 'true' && Boolean(env.GOOGLE_CLOUD_VISION_API_KEY);
  let busy = false;
  return {
    name: 'dev-ocr-benchmark-google', apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        if (request.url?.split('?')[0] !== ENDPOINT) { next(); return; }
        // 外部公開とDNS rebindingを防止。CORS許可ヘッダーは付与しない。
        const host = request.headers.host ?? '';
        let hostname: string;
        try { hostname = new URL(`http://${host}`).hostname; } catch { reply(response, 403, { error: 'forbidden' }); return; }
        if (!LOOPBACK.has(request.socket.remoteAddress ?? '') ||
          !['localhost', '127.0.0.1', '[::1]'].includes(hostname) ||
          (request.headers.origin && request.headers.origin !== `http://${host}`)) {
          reply(response, 403, { error: 'local-development-only' }); return;
        }
        if (request.method === 'GET') { reply(response, 200, { enabled }); return; }
        if (request.method !== 'POST') { reply(response, 405, { error: 'method-not-allowed' }); return; }
        if (!enabled) { reply(response, 503, { error: 'not-configured' }); return; }
        if (request.headers['x-ocr-consent'] !== 'vision-online-v1') { reply(response, 403, { error: 'consent-required' }); return; }
        const mime = request.headers['content-type'];
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(mime ?? '')) { reply(response, 415, { error: 'unsupported-image' }); return; }
        if (Number(request.headers['content-length']) > MAX_BYTES) { reply(response, 413, { error: 'image-too-large' }); return; }
        if (busy) { reply(response, 429, { error: 'busy' }); return; }
        busy = true;
        const controller = new AbortController();
        const disconnect = () => { if (!response.writableEnded) controller.abort(); };
        response.on('close', disconnect);
        const timeout = setTimeout(() => controller.abort(), 60_000);
        try {
          const image = await readImage(request, controller.signal);
          if (!image.length || image.length > MAX_BYTES) { reply(response, 413, { error: 'invalid-image-size' }); return; }
          const upstream = await send('https://vision.googleapis.com/v1/images:annotate', {
            method: 'POST', signal: controller.signal,
            headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': env.GOOGLE_CLOUD_VISION_API_KEY! },
            body: JSON.stringify({ requests: [{
              image: { content: image.toString('base64') },
              features: [{ type: 'DOCUMENT_TEXT_DETECTION' }], imageContext: { languageHints: ['ja'] },
            }] }),
          });
          if (!upstream.ok) { reply(response, 502, { error: 'vision-failed' }); return; }
          const payload = await upstream.json() as { responses?: { error?: unknown; fullTextAnnotation?: { text?: string } }[] };
          const result = payload.responses?.[0];
          if (!result || result.error) { reply(response, 502, { error: 'vision-failed' }); return; }
          reply(response, 200, { text: result.fullTextAnnotation?.text ?? '' });
        } catch (error) {
          // Providerの応答、キー、画像、OCR結果はログ/エラー本文に含めない。
          if (!response.destroyed) reply(response, error instanceof Error && error.message === 'too-large' ? 413 : 502, { error: 'vision-failed' });
        } finally {
          clearTimeout(timeout);
          response.removeListener('close', disconnect);
          busy = false;
        }
      });
    },
  };
}
