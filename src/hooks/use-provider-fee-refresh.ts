import { useEffect, useRef } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { refreshProviderFees } from '@/lib/provider-fees.functions';
import { PROVIDER_FEE_REFRESH_MS } from '@/lib/provider-fee-refresh';
let pending: ReturnType<typeof refreshProviderFees> | null = null;
let offset = 0;
export function useProviderFeeRefresh(enabled: boolean, onUpdated: () => void) {
  const callback = useRef(onUpdated);
  callback.current = onUpdated;
  const refresh = useServerFn(refreshProviderFees);
  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const run = async () => {
      try {
        if (document.visibilityState === 'visible') {
          if (!pending) pending = refresh({ data: { offset } }).then(result => {
            if (!('error' in result)) offset = result.nextOffset;
            return result;
          }).finally(() => { pending = null; });
          const result = await pending;
          if (!stopped && !('error' in result) && result.updated > 0) callback.current();
        }
      } catch { /* Keep confirmed fees during temporary connection failures. */ }
      if (!stopped) timer = setTimeout(run, PROVIDER_FEE_REFRESH_MS);
    };
    void run();
    return () => { stopped = true; clearTimeout(timer); };
  }, [enabled, refresh]);
}
