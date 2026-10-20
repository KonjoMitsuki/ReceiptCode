import { useEffect, useState } from 'react';

export type WakeLockStatus =
  | 'idle'
  | 'active'
  | 'unsupported'
  | 'unavailable';

export function useWakeLock(enabled: boolean): WakeLockStatus {
  const [status, setStatus] = useState<WakeLockStatus>('idle');
  const supported =
    typeof navigator !== 'undefined' &&
    'wakeLock' in navigator &&
    typeof navigator.wakeLock?.request === 'function';

  useEffect(() => {
    if (!enabled || !supported) return;

    let cancelled = false;
    let sentinel: WakeLockSentinel | null = null;

    const requestLock = async () => {
      if (cancelled || document.visibilityState !== 'visible') return;

      try {
        const next = await navigator.wakeLock.request('screen');
        if (cancelled) {
          void next.release();
          return;
        }
        sentinel = next;
        setStatus('active');
        next.addEventListener('release', () => {
          sentinel = null;
          if (!cancelled) setStatus('unavailable');
        });
      } catch {
        if (!cancelled) setStatus('unavailable');
      }
    };

    void requestLock();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && !sentinel) {
        void requestLock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener(
        'visibilitychange',
        handleVisibilityChange,
      );
      if (sentinel && !sentinel.released) {
        void sentinel.release().catch(() => undefined);
      }
    };
  }, [enabled, supported]);

  if (!enabled) return 'idle';
  if (!supported) return 'unsupported';
  return status;
}
