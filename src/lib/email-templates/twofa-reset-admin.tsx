import React from 'react'
import { Body, Container, Head, Heading, Html, Preview, Text, Button, Section, Hr } from '@react-email/components'
import type { TemplateEntry } from './registry'

const SITE_NAME = 'BM Support'

interface Props {
  userEmail?: string
  userName?: string
  reason?: string
  resetUrl?: string
  requestedAt?: string
}

const TwoFaResetAdminEmail = ({ userEmail, userName, reason, resetUrl, requestedAt }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>2FA reset request from {userName || userEmail || 'a user'}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>2FA reset request</Heading>
        <Text style={text}>
          A user has requested a two-factor authentication reset because they lost access to their authenticator device.
        </Text>
        <Section style={card}>
          <Text style={label}>User</Text>
          <Text style={value}>{userName || '—'}</Text>
          <Text style={label}>Email</Text>
          <Text style={value}>{userEmail || '—'}</Text>
          <Text style={label}>Requested at</Text>
          <Text style={value}>{requestedAt || new Date().toISOString()}</Text>
          {reason ? (
            <>
              <Text style={label}>Reason</Text>
              <Text style={value}>{reason}</Text>
            </>
          ) : null}
        </Section>
        {resetUrl ? (
          <Section style={{ textAlign: 'center', margin: '24px 0' }}>
            <Button href={resetUrl} style={button}>Open Admin Roles</Button>
          </Section>
        ) : null}
        <Hr style={hr} />
        <Text style={footer}>
          Verify the user's identity before resetting 2FA. — {SITE_NAME}
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: TwoFaResetAdminEmail,
  subject: (d: Record<string, any>) => `2FA reset requested — ${d?.userEmail || 'user'}`,
  displayName: '2FA reset — admin notice',
  previewData: { userEmail: 'user@example.com', userName: 'Jane Doe', reason: 'Lost phone' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px', maxWidth: '560px', margin: '0 auto' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#0d0d0d', margin: '0 0 16px' }
const text = { fontSize: '14px', color: '#444', lineHeight: '1.6', margin: '0 0 16px' }
const card = { background: '#f6f6f8', borderRadius: '8px', padding: '16px 20px' }
const label = { fontSize: '11px', textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: '#888', margin: '8px 0 2px' }
const value = { fontSize: '14px', color: '#0d0d0d', margin: '0 0 4px' }
const button = { background: '#6d28d9', color: '#fff', padding: '10px 18px', borderRadius: '6px', textDecoration: 'none', fontSize: '14px', fontWeight: 600 }
const hr = { borderColor: '#eee', margin: '24px 0' }
const footer = { fontSize: '12px', color: '#999', margin: 0 }