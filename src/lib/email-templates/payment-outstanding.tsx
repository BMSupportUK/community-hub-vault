import React from 'react'
import { Body, Button, Container, Head, Heading, Html, Preview, Text, Section, Hr } from '@react-email/components'
import type { TemplateEntry } from './registry'

const SITE_NAME = 'BM Support'

interface Props {
  customerName?: string
  orderRef?: string
  amount?: string
  paymentMethod?: string
  orderDate?: string
  checkoutUrl?: string
  checkoutPassword?: string
}

const PaymentOutstandingEmail = ({ customerName, orderRef, amount, paymentMethod, orderDate, checkoutUrl, checkoutPassword }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{`Payment is still outstanding${orderRef ? ` for order ${orderRef}` : ''}`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Payment still outstanding</Heading>
        <Text style={text}>{customerName ? `Hi ${customerName},` : 'Hi there,'}</Text>
        <Text style={text}>
          Our records show that payment for your {SITE_NAME} order has not been received yet.
          Please arrange payment as soon as possible so we can complete your order.
        </Text>
        <Section style={card}>
          {orderRef ? <Text style={row}><strong>Order:</strong> {orderRef}</Text> : null}
          {orderDate ? <Text style={row}><strong>Order date:</strong> {orderDate}</Text> : null}
          {amount ? <Text style={row}><strong>Amount due:</strong> {amount}</Text> : null}
          {paymentMethod ? <Text style={row}><strong>Payment method:</strong> {paymentMethod}</Text> : null}
        </Section>
        <Text style={text}>
          If you have already paid, please ignore this message — it can take a little while for payments to show on our side.
        </Text>
        {checkoutUrl ? (
          <Section style={card}>
            <Text style={row}><strong>Your secure order link:</strong></Text>
            <Text style={row}><Link href={checkoutUrl} style={link}>{checkoutUrl}</Link></Text>
            {checkoutPassword ? <Text style={row}><strong>Secure password:</strong> {checkoutPassword}</Text> : null}
            <Text style={row}>Open the link and enter the password to view and pay for your order.</Text>
          </Section>
        ) : null}
        {checkoutUrl ? (
          <Section style={{ textAlign: 'center' as const, margin: '20px 0' }}>
            <Button href={checkoutUrl} style={btn}>View my order</Button>
          </Section>
        ) : null}
        <Hr style={hr} />
        <Text style={footer}>{SITE_NAME}</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: PaymentOutstandingEmail,
  subject: (data: Record<string, any>) =>
    data?.orderRef ? `Payment outstanding for order ${data.orderRef}` : 'Payment outstanding for your order',
  displayName: 'Payment outstanding (manual orders)',
  previewData: { customerName: 'Jane', orderRef: 'BM-1042', amount: '£45.00', paymentMethod: 'Bank transfer', orderDate: '1 Oct 2026', checkoutUrl: 'https://bmsupport.uk/home' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px', maxWidth: '560px', margin: '0 auto' }
const h1 = { fontSize: '20px', fontWeight: 'bold' as const, color: '#0d0d0d', margin: '0 0 16px' }
const text = { fontSize: '14px', color: '#444', lineHeight: '1.6', margin: '0 0 12px' }
const row = { fontSize: '14px', color: '#333', lineHeight: '1.5', margin: '0 0 6px' }
const card = { background: '#f6f6f8', borderRadius: '8px', padding: '14px 18px', margin: '12px 0' }
const btn = { background: '#0d0d0d', color: '#ffffff', padding: '12px 20px', borderRadius: '8px', textDecoration: 'none', fontSize: '14px', fontWeight: 'bold' as const }
const hr = { borderColor: '#eee', margin: '24px 0' }
const footer = { fontSize: '12px', color: '#999', margin: 0 }
