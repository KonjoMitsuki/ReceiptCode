import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { createId } from '../../lib/id';
import { createBenchmarkEngineFactory, ENGINES, GOOGLE_ENDPOINT } from './engines';
import Results from './Results';
import { runBenchmark, validateTruth } from './runner';
import { benchmarkStorage } from './storage';
import type { BenchmarkEngineFactory, BenchmarkRun, BenchmarkSample, EngineId, GroundTruth } from './types';
import './benchmark.css';

const lines = (value: string) => value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
const message = (error: unknown) => error instanceof Error ? error.message : '処理に失敗しました。';

function SampleEditor({ sample, selected, disabled, onSelect, onChange, onDelete }: {
  sample: BenchmarkSample; selected: boolean; disabled: boolean;
  onSelect: () => void; onChange: (truth: GroundTruth) => void; onDelete: () => void;
}) {
  const imageRef = useRef<HTMLImageElement>(null);
  const previewRef = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    const next = URL.createObjectURL(sample.image);
    if (imageRef.current) imageRef.current.src = next;
    if (previewRef.current) previewRef.current.href = next;
    return () => URL.revokeObjectURL(next);
  }, [sample.image]);
  return <article className="benchmark-sample">
    <div className="benchmark-sample-heading">
      <label className="benchmark-check"><input type="checkbox" checked={selected} disabled={disabled} onChange={onSelect} />{sample.name}</label>
      <button type="button" className="benchmark-danger" disabled={disabled} onClick={onDelete}>画像と関連履歴を削除</button>
    </div>
    <div className="benchmark-editor-grid">
      <a ref={previewRef} target="_blank" rel="noreferrer" aria-label={`${sample.name}の原画像を開く`}><img ref={imageRef} alt={`${sample.name}のプレビュー`} width="160" height="220" loading="lazy" /></a>
      <div className="benchmark-fields">
        <div className="benchmark-field"><label htmlFor={`benchmark-text-${sample.id}`}>正解テキスト · {sample.name}</label><textarea id={`benchmark-text-${sample.id}`} rows={7} maxLength={10_000} disabled={disabled} value={sample.truth.text} onChange={(event) => onChange({ ...sample.truth, text: event.target.value })} /></div>
        <div className="benchmark-field-pair">
          <div className="benchmark-field"><label htmlFor={`benchmark-products-${sample.id}`}>商品名（1行1件）· {sample.name}</label><textarea id={`benchmark-products-${sample.id}`} rows={4} disabled={disabled} defaultValue={sample.truth.productNames.join('\n')} onChange={(event) => onChange({ ...sample.truth, productNames: lines(event.target.value) })} /></div>
          <div className="benchmark-field"><label htmlFor={`benchmark-jans-${sample.id}`}>JAN（1行1件・8桁/13桁）· {sample.name}</label><textarea id={`benchmark-jans-${sample.id}`} rows={4} inputMode="numeric" disabled={disabled} defaultValue={sample.truth.jans.join('\n')} onChange={(event) => onChange({ ...sample.truth, jans: lines(event.target.value) })} /></div>
        </div>
      </div>
    </div>
  </article>;
}

export default function BenchmarkPage({ createEngine }: { createEngine?: BenchmarkEngineFactory }) {
  const [samples, setSamples] = useState<BenchmarkSample[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [engineIds, setEngineIds] = useState<EngineId[]>(['tesseract', 'paddle']);
  const [runs, setRuns] = useState<BenchmarkRun[]>([]);
  const [currentRun, setCurrentRun] = useState<BenchmarkRun | null>(null);
  const [googleEnabled, setGoogleEnabled] = useState(false);
  const [consent, setConsent] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    void benchmarkStorage.load().then((data) => {
      if (!active) return;
      setSamples(data.samples); setSelectedIds(data.samples.map((sample) => sample.id)); setRuns(data.runs);
    }).catch((cause) => { if (active) setError(message(cause)); }).finally(() => { if (active) setLoaded(true); });
    if (import.meta.env.DEV) void fetch(GOOGLE_ENDPOINT, { cache: 'no-store', signal: controller.signal }).then(async (response) => {
      if (response.ok && response.headers.get('content-type')?.includes('application/json')) {
        const status: { enabled?: boolean } = await response.json();
        if (active) setGoogleEnabled(status.enabled === true);
      }
    }).catch(() => { /* 未設定/静的ホスティングでもローカルエンジンは利用可能。 */ });
    return () => { active = false; controller.abort(); abortRef.current?.abort(); };
  }, []);

  const locked = busy || !loaded;
  const wantsGoogle = engineIds.includes('google');

  async function registerImages(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (!files.length) return;
    setError(''); setNotice(''); setBusy(true); setConsent(false);
    try {
      if (files.some((file) => !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || !file.size || file.size > 10 * 1024 * 1024)) {
        throw new Error('画像はJPEG・PNG・WebP、1枚10MB以内で選んでください。');
      }
      const added = files.map((file) => ({
        id: createId(), name: file.name, image: file, createdAt: new Date().toISOString(),
        truth: { text: '', productNames: [], jans: [] },
      }));
      await benchmarkStorage.saveSamples(added);
      setSamples((previous) => [...previous, ...added]);
      setSelectedIds((previous) => [...previous, ...added.map((sample) => sample.id)]);
      setNotice(`${added.length}枚の原画像をこの端末に保存しました。正解データを入力してください。`);
    } catch (cause) { setError(message(cause)); } finally { setBusy(false); }
  }

  async function saveTruth() {
    setError(''); setNotice(''); setBusy(true);
    try {
      await benchmarkStorage.saveSamples(samples);
      setNotice('正解データをこの端末に保存しました。');
    } catch (cause) { setError(message(cause)); } finally { setBusy(false); }
  }

  async function deleteSample(id: string) {
    if (!window.confirm('この画像・正解データと、この画像を含む比較履歴を端末から削除しますか？')) return;
    setBusy(true); setError(''); setConsent(false);
    try {
      await benchmarkStorage.deleteSample(id);
      setSamples((previous) => previous.filter((sample) => sample.id !== id));
      setSelectedIds((previous) => previous.filter((value) => value !== id));
      setRuns((previous) => previous.filter((run) => !run.results.some((result) => result.sampleId === id)));
      setCurrentRun((previous) => previous?.results.some((result) => result.sampleId === id) ? null : previous);
      setNotice('画像と関連履歴を削除しました。');
    } catch (cause) { setError(message(cause)); } finally { setBusy(false); }
  }

  async function start() {
    setError(''); setNotice('');
    const selected = samples.filter((sample) => selectedIds.includes(sample.id));
    const invalid = selected.map(validateTruth).find(Boolean);
    if (invalid) { setError(invalid); return; }
    if (!selected.length || !engineIds.length) { setError('画像とエンジンを1つ以上選択してください。'); return; }
    if (wantsGoogle && (!googleEnabled || !consent)) { setError('Googleへの送信同意が必要です。'); return; }
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true); setRunning(true); setCurrentRun(null);
    try {
      await benchmarkStorage.saveSamples(samples);
      const defaultFactory = createBenchmarkEngineFactory(wantsGoogle && consent);
      const run = await runBenchmark({
        samples: selected, engineIds,
        createEngine: (id) => id === 'google' || !createEngine ? defaultFactory(id) : createEngine(id),
        signal: controller.signal, onProgress: setProgress, onResult: setCurrentRun,
      });
      if (run.results.length) {
        setCurrentRun(run);
        // 保存失敗でも画面の結果は維持する。
        await benchmarkStorage.saveRun(run);
        setRuns((previous) => [run, ...previous]);
      }
      setNotice(controller.signal.aborted ? '比較を中止しました。実行済みの結果は保存しました。' : '比較が完了しました。結果を端末に保存しました。');
    } catch (cause) { setError(message(cause)); } finally {
      setBusy(false); setRunning(false); setProgress(''); setConsent(false); abortRef.current = null;
    }
  }

  async function deleteRun(id: string) {
    if (!window.confirm('この比較履歴を端末から削除しますか？')) return;
    setBusy(true); setError('');
    try {
      await benchmarkStorage.deleteRun(id);
      setRuns((previous) => previous.filter((run) => run.id !== id));
      setCurrentRun((previous) => previous?.id === id ? null : previous);
    } catch (cause) { setError(message(cause)); } finally { setBusy(false); }
  }

  return <main className="benchmark">
    <header className="benchmark-header">
      <a href={location.pathname.replace(/dev\/ocr-benchmark(?:\/|\/index\.html)?$/, '') || '/'}>← 通常の読み取りへ</a>
      <p className="benchmark-eyebrow">DEVELOPER TOOLS · LOCAL FIRST</p>
      <h1>OCR Benchmark</h1>
      <p>日本語レシートの認識精度と処理時間を、同じ原画像で比較します。</p>
    </header>
    <aside className="benchmark-privacy" aria-label="プライバシー方針">
      <strong>本番OCRはローカルファーストを維持します。</strong>
      <p>Tesseract.js・PaddleOCR.jsは端末内で実行します。画像・認識結果は外部送信しません。初回はモデル・実行資材のみダウンロードします。</p>
      <p>この画面の画像・正解・結果はIndexedDBに保存されます。共有端末での利用に注意し、不要な画像と履歴は削除してください。通常の読み取りフローには保存・Google送信を追加しません。</p>
    </aside>
    {error && <p className="benchmark-error" role="alert">{error}</p>}
    <p role="status" className="benchmark-live">{!loaded ? '端末内のデータを読み込んでいます…' : progress || notice}</p>
    <section className="benchmark-panel" aria-labelledby="benchmark-samples">
      <div className="benchmark-section-heading"><h2 id="benchmark-samples">1. 画像と正解データ <span>{samples.length}枚</span></h2>
        <button type="button" disabled={locked || !samples.length} onClick={() => void saveTruth()}>正解データを保存</button></div>
      <label className="benchmark-upload">レシート画像を追加（複数選択可）<input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={locked} onChange={(event) => void registerImages(event)} /></label>
      <p className="benchmark-muted">JPEG / PNG / WebP・1枚10MB以内。変換・圧縮・分割せず原画像を使います。比較を開始すると正解データも保存します。</p>
      {!samples.length && <p className="benchmark-empty">まだ画像がありません。画像を追加し、OCRと照合する正解を入力してください。</p>}
      {samples.map((sample) => <SampleEditor key={sample.id} sample={sample} selected={selectedIds.includes(sample.id)} disabled={locked}
        onSelect={() => { setConsent(false); setSelectedIds((previous) => previous.includes(sample.id) ? previous.filter((id) => id !== sample.id) : [...previous, sample.id]); }}
        onChange={(truth) => { setConsent(false); setSamples((previous) => previous.map((value) => value.id === sample.id ? { ...value, truth } : value)); }}
        onDelete={() => void deleteSample(sample.id)} />)}
    </section>
    <section className="benchmark-panel" aria-labelledby="benchmark-config">
      <h2 id="benchmark-config">2. 比較条件</h2>
      <label className="benchmark-strategy">画像処理<select value="none" disabled><option value="none">none — 分割なし・原画像</option></select></label>
      <fieldset disabled={locked}><legend>比較するエンジン</legend><div className="benchmark-columns">{ENGINES.map((engine) => <div className="benchmark-engine" key={engine.id}>
        <label className="benchmark-check"><input type="checkbox" checked={engineIds.includes(engine.id)} disabled={engine.remote && !googleEnabled} onChange={() => {
          setConsent(false); setEngineIds((previous) => previous.includes(engine.id) ? previous.filter((id) => id !== engine.id) : [...previous, engine.id]);
        }} />{engine.label}</label><p>{engine.remote ? googleEnabled ? '外部送信 · 開発用途のみ' : '無効（ローカル開発サーバーの設定が必要）' : '端末内処理'}</p>
        <details><summary>モデル・必須前処理</summary><p>{engine.model}</p><p>{engine.preprocessing}</p></details>
      </div>)}</div></fieldset>
      <aside className="benchmark-cloud"><h3>Google Cloud Visionについて</h3>
        <p>任意選択・初期状態は無効です。有効化しても、下の同意なしでは送信しません。選択した{selectedIds.length}枚の原画像を開発サーバー経由でGoogleへ送信します。料金が発生する場合があります。</p>
        <p>オンラインのDOCUMENT_TEXT_DETECTIONのみ利用し、アプリのサーバーに画像・OCR結果を永続保存しません。Googleの説明では画像はメモリ内で処理され、コンテンツはモデル学習に使用されませんが、リクエストの時刻・サイズ等のメタデータは一時記録されます。</p>
        <p><a href="https://cloud.google.com/vision/docs/data-usage" target="_blank" rel="noreferrer">Googleのデータ利用条件</a> · <a href="https://cloud.google.com/terms/data-processing-addendum" target="_blank" rel="noreferrer">Cloudデータ処理追加条項</a>（確認日: 2026-10-26）</p>
        <label className="benchmark-check"><input type="checkbox" disabled={locked || !googleEnabled || !wantsGoogle} checked={consent} onChange={(event) => setConsent(event.target.checked)} />条件を確認し、この比較で選択中の画像をGoogleに送信することに同意します</label>
      </aside>
      <details className="benchmark-method"><summary>評価指標・計測方法</summary>
        <p>CER = Unicodeコードポイント単位の編集距離 ÷ 正解文字数。改行コード以外は正規化しません。挿入が多い場合は100%を超えます。</p>
        <p>JAN・商品名は全エンジンで既存のレシート解析を共用し、正解リストと完全一致した件数 ÷ 正解件数です。重複は件数ごとに照合します。商品名はJANとの関連付けを含む解析精度にも依存します。未登録の指標は「—」です。</p>
        <p>各画像・各エンジンを新規初期化して逐次実行し、リソース競合を避けます。結果は横並び表示します。初期化はモデル/資材取得と設定、認識は内部前処理を含む実測、総所要は起動から終了処理までです。Googleの認識時間は通信を含みます。取得キャッシュ・回線・端末の状態で時間が変わるため、必要に応じて同じ条件で繰り返してください。画像ハッシュ計算と指標計算は時間に含みません。</p>
      </details>
      <div className="benchmark-actions"><button type="button" className="benchmark-primary" disabled={locked || !selectedIds.length || !engineIds.length || (wantsGoogle && !consent)} onClick={() => void start()}>選択した画像を一括比較</button>
        {running && <button type="button" onClick={() => abortRef.current?.abort()}>比較を中止</button>}</div>
    </section>
    <section className="benchmark-panel" aria-labelledby="benchmark-history"><h2 id="benchmark-history">3. 比較結果・履歴 <span>{runs.length}回</span></h2>
      <div className="benchmark-history">{runs.map((run) => <div className="benchmark-history-row" key={run.id}>
        <button type="button" disabled={busy} aria-pressed={currentRun?.id === run.id} onClick={() => setCurrentRun(run)}>{new Date(run.createdAt).toLocaleString('ja-JP')} · {run.results.length}結果</button>
        <button type="button" className="benchmark-danger" disabled={busy} aria-label={`${new Date(run.createdAt).toLocaleString('ja-JP')}の履歴を削除`} onClick={() => void deleteRun(run.id)}>削除</button>
      </div>)}</div>
      {currentRun ? <Results run={currentRun} /> : <p className="benchmark-empty">比較を実行するか、保存済みの履歴を選択してください。</p>}
    </section>
  </main>;
}
