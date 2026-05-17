import React from 'react'
import { Body, Container, Head, Heading, Html, Preview, Text, Section, Hr } from '@react-email/components'
import type { TemplateEntry } from './registry'

const SITE_NAME = 'BM Support'

interface Props {
  userName?: string
}

const TwoFaResetUserEmail = ({ userName }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>We received your 2FA reset request</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>{userName ? `Hi ${userName},` : 'Hi,'}</Heading>
        <Text style={text}>
          We received your request to reset two-factor authentication on your {SITE_NAME} account.
        </Text>
        <Section style={card}>
          <Text style={text}>
            An admin will review the request and contact you shortly. For security, we may ask you to verify your identity before resetting 2FA.
          </Text>
        </Section>
        <Text style={text}>
          If you did <strong>not</strong> request this, please reply to this email immediately — your account may be at risk.
        </Text>
        <Hr style={hr} />
        <Text style={footer}>{SITE_NAME}</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: TwoFaResetUserEmail,
  subject: '2FA reset request received',
  displayName: '2FA reset — user confirmation',
  previewData: { userName: 'Jane' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px', maxWidth: '560px', margin: '0 auto' }
const h1 = { fontSize: '20px', fontWeight: 'bold' as const, color: '#0d0d0d', margin: '0 0 16px' }
const text = { fontSize: '14px', color: '#444', lineHeight: '1.6', margin: '0 0 12px' }
const card = { background: '#f6f6f8', borderRadius: '8px', padding: '14px 18px', margin: '12px 0' }
const hr = { borderColor: '#eee', margin: '24px 0' }
const footer = { fontSize: '12px', color: '#999', margin: 0 }