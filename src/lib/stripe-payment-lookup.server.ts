import type Stripe from 'stripe';
import { createStripeClient } from './stripe.server';
import { lookupAcrossStripeEnvironments } from './stripe-payment-lookup';
/** Read runtime configuration only when the provider lookup actually runs. */
export function lookupStripePayment<T>(reference: string | null, lookup: (stripe: Stripe) => Promise<T>, found?: (result: T) => boolean): Promise<T> {
  return lookupAcrossStripeEnvironments(reference, process.env.STRIPE_ENVIRONMENT,
    (environment) => lookup(createStripeClient(environment)), found);
}
