import React from 'react'
import { Body, Container, Head, Heading, Html, Preview, Text, Section, Hr, Button } from '@react-email/components'
import type { TemplateEntry } from './registry'

const SITE_NAME = 'BM Support'

interface Props {
  displayName?: string
  email?: string
  password?: string
  loginUrl?: string
}

/**
 * Sent when admin/management manually adds a user: welcome + login details,
 * and they must choose their own password on first sign-in.
 * Editable wording lives in Automated messages & emails under key email:manual-account-login.
 */
const ManualAccountLoginEmail = ({ displayName, email, password, loginUrl = 'https://bmsupport.uk/login' }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your {SITE_NAME} account is ready</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>🎉 Welcome to {SITE_NAME}, {displayName || 'there'}</Heading>
        <Text style={text}>
          Our team has created your <strong>{SITE_NAME}</strong> account. Here are your login details.
        </Text>
        <Section style={card}>
          {email && (<><Text style={cardLabel}>Email</Text><Text style={value}>{email}</Text></>)}
          <Text style={cardLabel}>Temporary password</Text>
          <Text style={pw}>{password || '—'}</Text>
          <Section style={{ textAlign: 'center', margin: '20px 0 4px' }}>
            <Button href={loginUrl} style={btn}>Sign in to {SITE_NAME}</Button>
          </Section>
        </Section>
        <Text style={text}>
          As soon as you sign in you'll be asked to choose your own new password. This temporary one stops working once you do.
        </Text>
        <Text style={text}>
          If you didn't ask for this, contact {SITE_NAME} straight away.
        </Text>
        <Hr style={hr} />
        <Text style={footer}>{SITE_NAME}</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: ManualAccountLoginEmail,
  subject: `🎉 Your ${SITE_NAME} login details`,
  displayName: 'Manually added account login (BM Support)',
  previewData: { displayName: 'Jane', email: 'jane@example.com', password: 'Abc7KmPq92Xz', loginUrl: 'https://bmsupport.uk/login' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px', maxWidth: '560px', margin: '0 auto' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#0d0d0d', margin: '0 0 16px' }
const text = { fontSize: '14px', color: '#444', lineHeight: '1.6', margin: '0 0 12px' }
const card = { background: '#eff6ff', border: '1px solid #93c5fd', borderRadius: '8px', padding: '16px 20px', margin: '16px 0' }
const cardLabel = { fontSize: '12px', color: '#1d4ed8', textTransform: 'uppercase' as const, letterSpacing: '0.5px', margin: '8px 0 4px', fontWeight: 'bold' as const }
const value = { fontSize: '14px', color: '#0d0d0d', margin: '0 0 8px' }
const pw = { fontSize: '22px', fontFamily: 'Courier New, monospace', letterSpacing: '2px', color: '#0d0d0d', fontWeight: 'bold' as const, margin: '0 0 8px' }
const btn = { background: '#2563eb', color: '#ffffff', padding: '12px 22px', borderRadius: '8px', textDecoration: 'none', fontWeight: 'bold' as const, fontSize: '14px' }
const hr = { borderColor: '#eee', margin: '24px 0' }
const footer = { fontSize: '12px', color: '#999', margin: '0 0 6px' }
