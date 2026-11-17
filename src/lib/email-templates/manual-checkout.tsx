import React from 'react';
import { Body, Button, Container, Head, Heading, Html, Link, Preview, Text } from '@react-email/components';
import type { TemplateEntry } from './registry';
import { CustomerFooter } from './customer-footer';

function ManualCheckout({ name, orderRef, checkoutUrl, password }: { name?: string; orderRef?: string; checkoutUrl?: string; password?: string }) {
  const url = checkoutUrl || 'https://bmsupport.uk';
  return <Html lang="en"><Head /><Preview>{`Your BM Support order${orderRef ? ` ${orderRef}` : ''} is ready to complete`}</Preview><Body style={{ backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif', color: '#222222' }}><Container style={{ padding: '32px', maxWidth: '560px' }}>
    <Heading style={{ fontSize: '22px' }}>Your BM Support order is ready</Heading>
    <Text>Hello {name || 'there'},</Text>
    <Text>Thanks for your order{orderRef ? ` (${orderRef})` : ''} with BM Support. We've set it up for you, and you can finish it on our website whenever you're ready.</Text>
    <Text style={{ marginBottom: '4px' }}>Your order code:</Text>
    <Text style={{ fontFamily: 'monospace', fontSize: '20px', marginTop: 0, overflowWrap: 'anywhere' }}>{password || '—'}</Text>
    <Button href={url} style={{ backgroundColor: '#7434b8', color: '#ffffff', padding: '12px 20px', borderRadius: '6px' }}>View my order</Button>
    <Text style={{ fontSize: '13px' }}>Or copy this address into your browser: <Link href={url}>{url}</Link></Text>
    <Text>The order code only opens this order — it isn't your website password. You can create a BM Support account at the end.</Text>
    <CustomerFooter reason="You are receiving this email because BM Support staff created an order for you at your request." />
  </Container></Body></Html>;
}
export const template = { component: ManualCheckout, subject: (d: Record<string, any>) => `Your BM Support order${d?.orderRef ? ` ${d.orderRef}` : ''} is ready`, displayName: 'Manual customer secure checkout', previewData: { name: 'Jane', orderRef: 'BM-1234', password: 'Example order code', checkoutUrl: 'https://bmsupport.uk' } } satisfies TemplateEntry;
