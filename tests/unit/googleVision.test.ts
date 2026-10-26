// @vitest-environment node
import { createServer, request as httpRequest, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { ViteDevServer } from 'vite';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { googleVisionPlugin } from '../../server/googleVision';
import { createBenchmarkEngineFactory } from '../../src/features/ocr-benchmark/engines';

let server: Server | undefined;
afterEach(async () => {
  if (server) { server.closeAllConnections(); await new Promise<void>((resolve) => server!.close(() => resolve())); server = undefined; }
});

async function start(env: Record<string, string> = {}, send = vi.fn<typeof fetch>()) {
  const plugin = googleVisionPlugin(env, send);
  const configure = plugin.configureServer as (server: ViteDevServer) => void;
  configure({ middlewares: { use: (handler: Parameters<typeof createServer>[1]) => { server = createServer(handler); } } } as unknown as ViteDevServer);
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
  return { url: `http://127.0.0.1:${(server!.address() as AddressInfo).port}/api/dev/ocr-benchmark/vision`, send };
}

const enabled = { OCR_BENCHMARK_GOOGLE_ENABLED: 'true', GOOGLE_CLOUD_VISION_API_KEY: 'server-only-secret' };
const headers = { 'Content-Type': 'image/png', 'X-OCR-Consent': 'vision-online-v1' };

describe('Google比較用の開発プロキシ', () => {
  it('未設定では無効であり、POSTも外部に送信しない', async () => {
    const { url, send } = await start();
    expect(await (await fetch(url)).json()).toEqual({ enabled: false });
    expect((await fetch(url, { method: 'POST', headers, body: 'image' })).status).toBe(503);
    expect(send).not.toHaveBeenCalled();
    expect(googleVisionPlugin(enabled).configurePreviewServer).toBeUndefined();
  });

  it('同意なし・別Origin・不正Host・画像以外・サイズ超過を送信前に拒否する', async () => {
    const { url, send } = await start(enabled);
    expect(await (await fetch(url)).json()).toEqual({ enabled: true });
    for (const [requestHeaders, status] of [
      [{ 'Content-Type': 'image/png' }, 403],
      [{ ...headers, Origin: 'https://evil.example' }, 403],
      [{ ...headers, 'Content-Type': 'text/plain' }, 415],
    ] as const) {
      expect((await fetch(url, { method: 'POST', headers: requestHeaders, body: 'image' })).status).toBe(status);
    }
    expect(await new Promise<number | undefined>((resolve, reject) => {
      const request = httpRequest(url, { method: 'POST', headers: { ...headers, Host: 'evil.example' } }, (response) => {
        response.resume(); resolve(response.statusCode);
      });
      request.on('error', reject); request.end('image');
    })).toBe(403);
    expect((await fetch(url, { method: 'POST', headers, body: new Uint8Array(10 * 1024 * 1024 + 1) })).status).toBe(413);
    expect(send).not.toHaveBeenCalled();
  });

  it('同意時だけオンラインDOCUMENT_TEXT_DETECTIONに原画像とサーバーキーを渡す', async () => {
    const send = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ responses: [{ fullTextAnnotation: { text: '牛乳' } }] }));
    const { url } = await start(enabled, send);
    const response = await fetch(url, { method: 'POST', headers: { ...headers, Origin: new URL(url).origin }, body: 'original bytes' });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.json()).toEqual({ text: '牛乳' });
    const [target, options] = send.mock.calls[0];
    expect(target).toBe('https://vision.googleapis.com/v1/images:annotate');
    expect(options?.headers).toMatchObject({ 'X-Goog-Api-Key': 'server-only-secret' });
    const body = JSON.parse(options!.body as string);
    expect(body.requests[0].image.content).toBe(Buffer.from('original bytes').toString('base64'));
    expect(body.requests[0].features).toEqual([{ type: 'DOCUMENT_TEXT_DETECTION' }]);
  });

  it('Providerのエラー詳細やキーを返さず、失敗後に再試行できる', async () => {
    const send = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ error: 'server-only-secret' }, { status: 400 }))
      .mockResolvedValueOnce(Response.json({ responses: [{}] }));
    const { url } = await start(enabled, send);
    const response = await fetch(url, { method: 'POST', headers, body: 'image' });
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain('server-only-secret');
    expect((await fetch(url, { method: 'POST', headers, body: 'image' })).status).toBe(200);
  });

  it('共通エンジン側でも同意なしではGoogleを生成しない', async () => {
    await expect(createBenchmarkEngineFactory(false)('google')).rejects.toThrow('同意');
    expect(await createBenchmarkEngineFactory(false)('paddle')).toBeDefined();
  });
});
