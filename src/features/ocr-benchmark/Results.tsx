import { useMemo } from 'react';
import { aggregateAccuracy, alignText } from './metrics';
import { ENGINES } from './engines';
import type { Accuracy, BenchmarkResult, BenchmarkRun } from './types';
import ReviewPane from './ReviewPane';

const percentage = (value: number | null) => value === null ? '—' : `${(value * 100).toFixed(2)}%`;
const milliseconds = (value: number | null) => value === null ? '—' : `${value.toFixed(0)} ms`;

function AccuracyValues({ accuracy }: { accuracy?: Accuracy }) {
  return <dl className="benchmark-metrics">
    <div><dt>CER ↓</dt><dd>{percentage(accuracy?.cer ?? null)}</dd></div>
    <div><dt>JAN完全一致 ↑</dt><dd>{percentage(accuracy?.janAccuracy ?? null)}<small>{accuracy ? `${accuracy.janMatches} / ${accuracy.janCount}件` : '—'}</small></dd></div>
    <div><dt>商品名正解率 ↑</dt><dd>{percentage(accuracy?.productAccuracy ?? null)}<small>{accuracy ? `${accuracy.productMatches} / ${accuracy.productCount}件` : '—'}</small></dd></div>
  </dl>;
}

function HighlightedText({ result }: { result: BenchmarkResult }) {
  const edits = useMemo(() => alignText(result.truth.text, result.text), [result.truth.text, result.text]);
  if (!edits) return <><p>長いテキストのためハイライトを省略しています。</p><pre>{result.text}</pre></>;
  return <pre aria-label="差分付き認識結果">{edits.map((edit, index) => edit.kind === 'equal'
    ? <span key={index}>{edit.actual}</span>
    : <mark key={index} className={`benchmark-diff-${edit.kind}`} title={`${edit.kind === 'delete' ? '欠落' : edit.kind === 'insert' ? '挿入' : '置換'}: 正解「${edit.expected || '∅'}」→ 認識「${edit.actual || '∅'}」`}>
      {edit.kind === 'delete' ? <del>{edit.expected}</del> : <><span className="benchmark-sr-only">{edit.kind === 'insert' ? '挿入: ' : `置換（正解 ${edit.expected}）: `}</span>{edit.actual}</>}
    </mark>)}</pre>;
}

export default function Results({ run }: { run: BenchmarkRun }) {
  const sampleIds = [...new Set(run.results.map((result) => result.sampleId))];
  return <div className="benchmark-results">
    <h3>集計</h3>
    <p className="benchmark-muted">時間は成功した全結果の平均。精度は正解を登録した項目のみのマイクロ平均です。エラー・中止は別件数で表示します。</p>
    <div className="benchmark-columns">
      {ENGINES.filter((engine) => run.results.some((result) => result.engine.id === engine.id)).map((engine) => {
        const results = run.results.filter((result) => result.engine.id === engine.id);
        const successful = results.filter((result) => result.status === 'success');
        const scored = successful.filter((result) => result.accuracy);
        const average = (key: keyof BenchmarkResult['timings']) => {
          const values = successful.map((result) => result.timings[key]).filter((value) => value !== null);
          return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
        };
        return <article className="benchmark-result-card" key={engine.id}>
          <h4>{engine.label}</h4>
          <p>成功 {successful.length} / {results.length}件 · エラー {results.filter((r) => r.status === 'error').length} · 中止 {results.filter((r) => r.status === 'cancelled').length}</p>
          {scored.length ? <AccuracyValues accuracy={aggregateAccuracy(scored.map((result) => result.accuracy!))} /> : <p className="benchmark-muted">正解データ未登録のため精度は未計算</p>}
          <dl className="benchmark-timings">
            <div><dt>平均初期化</dt><dd>{milliseconds(average('initializationMs'))}</dd></div>
            <div><dt>平均認識</dt><dd>{milliseconds(average('recognitionMs'))}</dd></div>
            <div><dt>平均総所要</dt><dd>{milliseconds(average('totalMs'))}</dd></div>
          </dl>
        </article>;
      })}
    </div>
    {sampleIds.map((id) => {
      const results = run.results.filter((result) => result.sampleId === id);
      return <section key={id} className="benchmark-sample-results">
        <h3>{results[0].sampleName}</h3>
        {(results[0].truth.text.trim() || results[0].truth.productNames.length || results[0].truth.jans.length) ? <details><summary>この実行の正解データ</summary><pre>{results[0].truth.text}</pre>
          <p>商品名: {results[0].truth.productNames.join(' / ') || '未登録'}</p><p>JAN: {results[0].truth.jans.join(' / ') || '未登録'}</p>
        </details> : null}
        <div className="benchmark-columns">{results.map((result) => <article className="benchmark-result-card" key={result.engine.id}>
          <h4>{result.engine.label}</h4>
          <p className={`benchmark-status-${result.status}`}>{result.status === 'success' ? '完了' : result.status === 'cancelled' ? '中止' : 'エラー'}</p>
          {result.error && <p>{result.error}</p>}
          {result.accuracy && <AccuracyValues accuracy={result.accuracy} />}
          <dl className="benchmark-timings">
            <div><dt>初期化</dt><dd>{milliseconds(result.timings.initializationMs)}</dd></div>
            <div><dt>認識</dt><dd>{milliseconds(result.timings.recognitionMs)}</dd></div>
            <div><dt>総所要</dt><dd>{milliseconds(result.timings.totalMs)}</dd></div>
          </dl>
          {result.status === 'success' && <>
            <ReviewPane key={`${run.id}:${result.sampleId}:${result.engine.id}`} result={result} />
            <details><summary>OCR原文{result.truth.text.trim() ? '・正解との差分' : ''}（詳細）</summary>
              {result.truth.text.trim() ? <><p className="benchmark-muted">下線: 挿入 / 二重下線: 置換 / 取り消し線: 欠落（正解の文字を表示）</p><HighlightedText result={result} /></> : null}
              <pre aria-label={`${result.engine.label}のOCR原文`}>{result.text || '認識された文字はありません。'}</pre>
            </details>
          </>}
          <details><summary>モデル・前処理・入力条件</summary>
            <p>{result.engine.model}</p><p>{result.engine.preprocessing}</p>
            <p>入力: {result.inputBytes.toLocaleString()} bytes</p><p className="benchmark-hash">SHA-256: {result.inputSha256}</p>
          </details>
        </article>)}</div>
      </section>;
    })}
    <details><summary>実行条件</summary><p>日時: {new Date(run.createdAt).toLocaleString('ja-JP')}</p><p>分割: {run.imageStrategy} / エンジン・画像ごとに新規初期化、逐次実行</p><p>{run.userAgent}</p></details>
  </div>;
}
