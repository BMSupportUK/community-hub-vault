/** Serialize reads so late responses cannot rewind the checkout steps. */
export function startSecureOrderProgressSync(options: {
  refresh: () => Promise<void>;
  subscribe: (refresh: () => void) => () => void;
  isVisible: () => boolean;
  every: (refresh: () => void, milliseconds: number) => () => void;
  onReturn: (refresh: () => void) => () => void;
}) {
  let stopped = false;
  let running = false;
  let queued = false;
  const request = () => {
    if (stopped) return;
    if (running) { queued = true; return; }
    running = true;
    void (async () => {
      try {
        do {
          queued = false;
          try { await options.refresh(); } catch { /* Retry on the next signal. */ }
        } while (queued && !stopped);
      } finally { running = false; }
    })();
  };
  const visibleRequest = () => { if (options.isVisible()) request(); };
  const unsubscribe = options.subscribe(request);
  const stopTimer = options.every(visibleRequest, 5_000);
  const stopReturn = options.onReturn(visibleRequest);
  request();
  return () => { stopped = true; unsubscribe(); stopTimer(); stopReturn(); };
}