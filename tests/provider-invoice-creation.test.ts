import { describe, expect, mock, test } from 'bun:test';

const calls: Array<{ operation: string; data: any }> = [];
const stripe = {
 customers: { create: async (data: any) => { calls.push({operation:'customer',data}); return {id:'cus_test'}; } },
 invoices: {
  create: async (data: any) => { calls.push({operation:'invoice',data}); return {id:'in_test'}; },
  finalizeInvoice: async () => ({id:'in_test', total:6500, currency:'gbp', hosted_invoice_url:'https://invoice.stripe.com/test',status:'open',number:'TEST'}),
  voidInvoice: async () => {},
 },
 invoiceItems: { create: async (data: any) => {calls.push({operation:'item',data}); return {}; } },
};
mock.module('../src/lib/stripe.server', () => ({createStripeClient: () => stripe}));
const { createProviderInvoice } = await import('../src/lib/provider-invoices.server');

function database(paid = false) {
 let saved: any; const chat: any[] = [];
 const db = {
  rpc: async (name: string) => ({data:name === 'claim_checkout_payment_lock',error:null}),
  from: (table: string) => {
   const chain: any = {
    select: () => chain, eq: () => chain,
    maybeSingle: async () => ({data:null,error:null}),
    single: async () => ({data:{id:'test-order',total_cents:6500,user_id:null,email:null,shipping_name:'Invoice test',status:'pending',paid_at:paid?'2026-10-17T00:00:00Z':null},error:null}),
    insert: async (row: any) => {if(table === 'checkout_chat_messages') chat.push(row); return {error:null};},
    upsert: async (row: any) => {if(table === 'order_invoices') saved = row; return {error:null};},
   };
   return chain;
  },
 };
 return {db, saved:()=>saved, chat};
}

describe('invoice creation instead of inline cards', () => {
 test('a Stripe request creates no Stripe invoice while Stripe is hidden', async () => {
  calls.length=0;
  const prior=process.env.SQUARE_LOCATION_ID; delete process.env.SQUARE_LOCATION_ID;
  try { await expect(createProviderInvoice(database().db,'test-order','stripe','sandbox',null)).rejects.toThrow('Square location'); }
  finally { if(prior!==undefined) process.env.SQUARE_LOCATION_ID=prior; }
  expect(calls.length).toBe(0);
 });
 test('paid orders cannot generate another Stripe invoice', async () => {
  calls.length=0;
  await expect(createProviderInvoice(database(true).db,'test-order','stripe','sandbox',null)).rejects.toThrow('already paid');
  expect(calls.length).toBe(0);
 });
 test('Square creates and publishes a £65 invoice, not an inline payment', async () => {
  const oldFetch=globalThis.fetch;
  const priorToken=process.env.SQUARE_ACCESS_TOKEN;
  const priorLocation=process.env.SQUARE_LOCATION_ID;
  process.env.SQUARE_ACCESS_TOKEN='test-only'; process.env.SQUARE_LOCATION_ID='test-location';
  const squareCalls: Array<{path:string;body:any}> = [];
  globalThis.fetch=mock(async (input: any, init: any) => {
   const path=new URL(String(input)).pathname;
   const body=JSON.parse(init.body);
   squareCalls.push({path,body});
   const value=path==='/v2/customers'?{customer:{id:'customer-test'}}:path==='/v2/orders'?{order:{id:'order-square'}}:path==='/v2/invoices'?{invoice:{id:'invoice-square',version:0}}:{invoice:{id:'invoice-square',version:1,status:'UNPAID',public_url:'https://squareup.com/pay/invoice-test'}};
   return Response.json(value);
  }) as typeof fetch;
  try {
   const fixture=database();
   const result=await createProviderInvoice(fixture.db,'test-order','square','sandbox',null);
   expect(result.public_url).toBe('https://squareup.com/pay/invoice-test');
   expect(squareCalls.find(c=>c.path==='/v2/orders')?.body.order.line_items[0].base_price_money).toEqual({amount:6500,currency:'GBP'});
   expect(squareCalls.find(c=>c.path==='/v2/invoices')?.body.invoice.delivery_method).toBe('SHARE_MANUALLY');
   expect(squareCalls.at(-1)?.path).toBe('/v2/invoices/invoice-square/publish');
   expect(fixture.saved().stripe_invoice_id).toBeNull();
   expect(fixture.chat).toHaveLength(1);
   expect(fixture.chat[0].content).toBe('Here is your Square invoice for £65.00 — tap to pay: https://squareup.com/pay/invoice-test');
  } finally {
   globalThis.fetch=oldFetch;
   if(priorToken===undefined)delete process.env.SQUARE_ACCESS_TOKEN;else process.env.SQUARE_ACCESS_TOKEN=priorToken;
   if(priorLocation===undefined)delete process.env.SQUARE_LOCATION_ID;else process.env.SQUARE_LOCATION_ID=priorLocation;
  }
 });
});