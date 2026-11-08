export type SquareCard = {
  attach: (selector: string) => Promise<void>;
  destroy: () => Promise<void>;
  tokenize: (details: Record<string, unknown>) => Promise<{ status: string; token?: string; errors?: { message?: string }[] }>;
};
type SquareSdk = { payments: (applicationId: string, locationId: string) => { card: () => Promise<SquareCard> } };
type Environment = 'sandbox' | 'production';
const loads = new Map<Environment, Promise<SquareSdk>>();
const sdkUrl = (environment: Environment) => environment === 'sandbox'
  ? 'https://sandbox.web.squarecdn.com/v1/square.js' : 'https://web.squarecdn.com/v1/square.js';

/** Only fetch the public SDK asset; no card fields or order data before password verification. */
export function warmSquareCardEntry() {
  if (typeof document === 'undefined') return;
  if (document.querySelector('link[data-square-warmup]')) return;
  for (const environment of ['production', 'sandbox'] as const) {
    const connection = document.createElement('link');
    connection.rel = 'preconnect'; connection.href = new URL(sdkUrl(environment)).origin;
    connection.dataset.squareWarmup = 'true'; document.head.appendChild(connection);
  }
  const preload = document.createElement('link');
  preload.rel = 'preload'; preload.as = 'script'; preload.href = sdkUrl('production');
  preload.dataset.squareWarmup = 'true'; document.head.appendChild(preload);
}

export function loadSquareCardSdk(environment: Environment): Promise<SquareSdk> {
  const cached = loads.get(environment);
  if (cached) return cached;
  const promise = new Promise<SquareSdk>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = sdkUrl(environment); script.async = true;
    const fail = (message: string) => { window.clearTimeout(timeout); loads.delete(environment); script.remove(); reject(new Error(message)); };
    const timeout = window.setTimeout(() => fail('Secure card entry took too long to load. Please try again.'), 20000);
    script.onload = () => {
      const square = (window as unknown as { Square?: SquareSdk }).Square;
      if (!square) { fail('Square card entry did not load'); return; }
      window.clearTimeout(timeout); resolve(square);
    };
    script.onerror = () => fail('Could not load secure card entry. Please try again.');
    document.head.appendChild(script);
  });
  loads.set(environment, promise);
  return promise;
}