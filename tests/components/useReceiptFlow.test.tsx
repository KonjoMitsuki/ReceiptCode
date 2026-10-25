import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  OcrEngine,
  OcrEngineFactory,
  OcrLine,
} from '../../src/lib/ocr';
import type { PreparedImage } from '../../src/lib/imageProcessing';

const mocks = vi.hoisted(() => ({
  prepareImage: vi.fn(),
  createOcrTiles: vi.fn(),
}));

vi.mock('../../src/lib/imageProcessing', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../src/lib/imageProcessing')>();
  return {
    ...actual,
    prepareImage: mocks.prepareImage as typeof actual.prepareImage,
  };
});

vi.mock('../../src/lib/ocrTiles', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../src/lib/ocrTiles')>();
  return {
    ...actual,
    createOcrTiles:
      mocks.createOcrTiles as unknown as typeof actual.createOcrTiles,
  };
});

const { useReceiptFlow } = await import(
  '../../src/features/receipt/useReceiptFlow'
);

function preparedImage(
  overrides: Partial<PreparedImage> = {},
): PreparedImage {
  return {
    blob: new Blob(['preview']),
    previewUrl: 'blob:preview',
    width: 1800,
    height: 2400,
    ocrBlob: new Blob(['ocr']),
    ocrWidth: 3000,
    ocrHeight: 4000,
    fileName: 'receipt.jpg',
    warnings: [],
    ...overrides,
  };
}

function ocrLine(
  text: string,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): OcrLine {
  return { text, bbox: { x0, y0, x1, y1 }, confidence: 90 };
}

function tile(index: number, sourceY: number, lines: OcrLine[]) {
  return {
    blob: new Blob([`tile-${index}`]),
    index,
    total: 2,
    sourceY,
    sourceHeight: 1200,
    transform: {
      cropLeft: 0,
      cropTop: sourceY,
      paddingLeft: 0,
      paddingTop: 0,
      scale: 1,
    },
    lines: lines.map((line) => ({
      ...line,
      bbox: {
        ...line.bbox,
        y0: line.bbox.y0 - sourceY,
        y1: line.bbox.y1 - sourceY,
      },
    })),
  };
}

function fakeEngine(recognize: OcrEngine['recognize']): {
  engine: OcrEngine;
  factory: OcrEngineFactory;
  dispose: ReturnType<typeof vi.fn>;
} {
  const dispose = vi.fn(async () => undefined);
  const engine: OcrEngine = { recognize, dispose };
  return {
    engine,
    factory: vi.fn(async () => engine),
    dispose,
  };
}

describe('useReceiptFlow', () => {
  beforeEach(() => {
    mocks.prepareImage.mockReset();
    mocks.createOcrTiles.mockReset();
  });

  it('生成中のキャンセル後は古いengineの終了を待って再実行する', async () => {
    mocks.prepareImage.mockResolvedValue(preparedImage({
      ocrWidth: 1800, ocrHeight: 2400,
    }));
    const old = fakeEngine(async () => ({ text: '', lines: [] }));
    const next = fakeEngine(async () => ({
      text: '牛乳 \\198\n4901234567894', lines: [],
    }));
    let resolveLoad!: (engine: OcrEngine) => void;
    const pending = new Promise<OcrEngine>((resolve) => { resolveLoad = resolve; });
    const factory = vi.fn<OcrEngineFactory>()
      .mockImplementationOnce(() => pending)
      .mockResolvedValueOnce(next.engine);
    const { result } = renderHook(() => useReceiptFlow(factory));
    await act(async () => {
      await result.current.selectImage(new File(['x'], 'receipt.jpg'));
    });
    let first!: Promise<void>;
    await act(async () => { first = result.current.startOcr(); });
    expect(factory).toHaveBeenCalledTimes(1);
    let second!: Promise<void>;
    await act(async () => {
      result.current.cancelOcr();
      second = result.current.startOcr();
    });
    expect(factory).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolveLoad(old.engine);
      await Promise.all([first, second]);
    });
    expect(old.dispose).toHaveBeenCalled();
    expect(factory).toHaveBeenCalledTimes(2);
    expect(result.current.screen).toBe('review');
    expect(result.current.session?.items[0]?.jan).toBe('4901234567894');
  });

  it('高解像度画像は分割OCRし、統合したテキストを1回パースする', async () => {
    mocks.prepareImage.mockResolvedValue(preparedImage());
    const tile0 = tile(0, 0, [
      ocrLine('牛乳 1L \\198', 20, 100, 300, 120),
      ocrLine('4901234567894', 20, 140, 200, 160),
    ]);
    const tile1 = tile(1, 800, [
      ocrLine('食パン 8枚切 \\298', 20, 900, 320, 920),
      ocrLine('4512345678906', 20, 940, 200, 960),
    ]);
    mocks.createOcrTiles.mockImplementation(async function* () {
      yield tile0;
      yield tile1;
    });

    let call = 0;
    const { factory, dispose } = fakeEngine(async () => {
      const lines = call === 0 ? tile0.lines : tile1.lines;
      call += 1;
      return { text: '', lines };
    });

    const { result } = renderHook(() => useReceiptFlow(factory));
    await act(async () => {
      await result.current.selectImage(
        new File(['x'], 'receipt.jpg', { type: 'image/jpeg' }),
      );
    });
    expect(result.current.screen).toBe('preview');

    await act(async () => {
      await result.current.startOcr();
    });

    await waitFor(() => expect(result.current.screen).toBe('review'));
    expect(mocks.createOcrTiles).toHaveBeenCalledTimes(1);
    expect(result.current.session?.items.map((item) => item.name)).toEqual([
      '牛乳 1L',
      '食パン 8枚切',
    ]);
    expect(dispose).toHaveBeenCalled();
  });

  it('2400px以下の画像は従来の一括OCRを使う', async () => {
    mocks.prepareImage.mockResolvedValue(
      preparedImage({
        ocrWidth: 1800,
        ocrHeight: 2400,
      }),
    );

    const { factory } = fakeEngine(async () => ({
      text: '牛乳 1L \\198\n4901234567894',
      lines: [ocrLine('4901234567894', 20, 140, 200, 160)],
    }));

    const { result } = renderHook(() => useReceiptFlow(factory));
    await act(async () => {
      await result.current.selectImage(
        new File(['x'], 'receipt.jpg', { type: 'image/jpeg' }),
      );
    });
    await act(async () => {
      await result.current.startOcr();
    });

    await waitFor(() => expect(result.current.screen).toBe('review'));
    expect(mocks.createOcrTiles).not.toHaveBeenCalled();
    expect(result.current.session?.items[0]?.name).toBe('牛乳 1L');
  });
});
