export type PaymentLookupEnvironment = 'live' | 'sandbox';
/** Session prefixes are authoritative; otherwise use the configured account first. */
export function stripePaymentEnvironments(reference: string | null, configured?: string): PaymentLookupEnvironment[] {
  const primary = reference?.startsWith('cs_live_') ? 'live'
    : reference?.startsWith('cs_test_') ? 'sandbox'
    : configured === 'live' ? 'live' : 'sandbox';
  return [primary, primary === 'live' ? 'sandbox' : 'live'];
}
function resourceMissing(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const failure = error as { code?: string; raw?: { code?: string } };
  return (failure.code ?? failure.raw?.code) === 'resource_missing';
}
/** Retry missing resources or an empty search, never unrelated API failures. */
export async function lookupAcrossStripeEnvironments<T>(
  reference: string | null, configured: string | undefined,
  lookup: (environment: PaymentLookupEnvironment) => Promise<T>,
  found: (result: T) => boolean = () => true,
): Promise<T> {
  const environments = stripePaymentEnvironments(reference, configured);
  for (const [index, environment] of environments.entries()) {
    try {
      const result = await lookup(environment);
      if (found(result) || index === environments.length - 1) return result;
    } catch (error) {
      if (!resourceMissing(error) || index === environments.length - 1) throw error;
    }
  }
  throw new Error('No Stripe payment account could be checked');
}
