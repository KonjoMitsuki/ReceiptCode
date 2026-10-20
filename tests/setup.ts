import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
});

if (typeof URL.createObjectURL !== 'function') {
  URL.createObjectURL = () => 'blob:receipt2jan-test';
}

if (typeof URL.revokeObjectURL !== 'function') {
  URL.revokeObjectURL = () => undefined;
}

// M3E reads the OS color mode at mount; jsdom has no matchMedia.
if (typeof window.matchMedia !== 'function') {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

// M3E Progress measures its track with ResizeObserver.
if (typeof globalThis.ResizeObserver !== 'function') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

// M3E's ripple animates with the Web Animations API, which jsdom lacks.
if (typeof Element.prototype.animate !== 'function') {
  Element.prototype.animate = (() =>
    ({
      cancel: () => undefined,
      currentTime: 0,
      finished: Promise.resolve(),
      play: () => undefined,
      pause: () => undefined,
    }) as unknown as Animation) as typeof Element.prototype.animate;
}
