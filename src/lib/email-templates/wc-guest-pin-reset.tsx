import React from 'react'
import { Body, Container, Head, Heading, Html, Preview, Text, Section, Hr } from '@react-email/components'
import type { TemplateEntry } from './registry'

const SITE_NAME = 'BM Support'

interface Props {
  displayName?: string
  code: string
  expiresMinutes: number
}

const WcGuestPinResetEmail = ({ displayName, code, expiresMinutes }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your World Cup predictor PIN reset code</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>{displayName ? `Hi ${displayName},` : 'Hi,'}</Heading>
        <Text style={text}>
          We received a request to reset the PIN for your World Cup 2026 predictor guest account on {SITE_NAME}.
        </Text>
        <Section style={card}>
          <Text style={codeLabel}>Your reset code</Text>
          <Text style={codeText}>{code}</Text>
          <Text style={text}>
            Enter this code on the predictions page along with your new 4-digit PIN. It expires in {expiresMinutes} minutes.
          </Text>
        </Section>
        <Text style={text}>
          If you did <strong>not</strong> request this, you can safely ignore this email — your PIN will not change.
        </Text>
        <Hr style={hr} />
        <Text style={footer}>{SITE_NAME}</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: WcGuestPinResetEmail,
  subject: 'World Cup predictor — PIN reset code',
  displayName: 'WC predictor PIN reset',
  previewData: { displayName: 'Sarah', code: '482913', expiresMinutes: 30 },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px', maxWidth: '560px', margin: '0 auto' }
const h1 = { fontSize: '20px', fontWeight: 'bold' as const, color: '#0d0d0d', margin: '0 0 16px' }
const text = { fontSize: '14px', color: '#444', lineHeight: '1.6', margin: '0 0 12px' }
const card = { background: '#f6f6f8', borderRadius: '8px', padding: '14px 18px', margin: '12px 0' }
const codeLabel = { fontSize: '11px', color: '#666', textTransform: 'uppercase' as const, letterSpacing: '1px', margin: '0 0 6px' }
const codeText = { fontSize: '28px', fontWeight: 'bold' as const, letterSpacing: '6px', color: '#0d0d0d', margin: '0 0 8px', fontFamily: 'monospace' }
const hr = { borderColor: '#eee', margin: '24px 0' }
const footer = { fontSize: '12px', color: '#999', margin: 0 }