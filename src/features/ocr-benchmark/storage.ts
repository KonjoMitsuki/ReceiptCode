import type { BenchmarkRun, BenchmarkSample } from './types';

const DATABASE = 'receiptcode-ocr-benchmark';
const VERSION = 1;

async function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, VERSION);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('samples', { keyPath: 'id' });
      request.result.createObjectStore('runs', { keyPath: 'id' });
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = () => reject(new Error('IndexedDBを開けません。ブラウザの保存設定を確認してください。'));
    request.onblocked = () => reject(new Error('別のタブを閉じてから再試行してください。'));
  });
}

async function transaction<T>(stores: string[], mode: IDBTransactionMode,
  action: (tx: IDBTransaction, setResult: (value: T) => void) => void): Promise<T> {
  const db = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(stores, mode);
      let result: T;
      tx.oncomplete = () => resolve(result);
      tx.onerror = tx.onabort = () => reject(new Error('端末内への保存に失敗しました。空き容量・保存設定を確認してください。'));
      action(tx, (value) => { result = value; });
    });
  } finally {
    db.close();
  }
}

export const benchmarkStorage = {
  async load(): Promise<{ samples: BenchmarkSample[]; runs: BenchmarkRun[] }> {
    return transaction(['samples', 'runs'], 'readonly', (tx, set) => {
      const samples = tx.objectStore('samples').getAll();
      const runs = tx.objectStore('runs').getAll();
      runs.onsuccess = () => set({
        samples: samples.result.sort((a: BenchmarkSample, b: BenchmarkSample) => a.createdAt.localeCompare(b.createdAt)),
        runs: runs.result.sort((a: BenchmarkRun, b: BenchmarkRun) => b.createdAt.localeCompare(a.createdAt)),
      });
    });
  },
  async saveSamples(samples: BenchmarkSample[]): Promise<void> {
    await transaction<void>(['samples'], 'readwrite', (tx) => {
      for (const sample of samples) tx.objectStore('samples').put(sample);
    });
  },
  async saveRun(run: BenchmarkRun): Promise<void> {
    await transaction<void>(['runs'], 'readwrite', (tx) => { tx.objectStore('runs').put(run); });
  },
  async deleteRun(id: string): Promise<void> {
    await transaction<void>(['runs'], 'readwrite', (tx) => { tx.objectStore('runs').delete(id); });
  },
  async deleteSample(id: string): Promise<void> {
    await transaction<void>(['samples', 'runs'], 'readwrite', (tx) => {
      tx.objectStore('samples').delete(id);
      const cursor = tx.objectStore('runs').openCursor();
      cursor.onsuccess = () => {
        const current = cursor.result;
        if (!current) return;
        if ((current.value as BenchmarkRun).results.some((result) => result.sampleId === id)) current.delete();
        current.continue();
      };
    });
  },
};
