import React from 'react'
import { Body, Container, Head, Heading, Html, Preview, Text, Section, Hr } from '@react-email/components'
import type { TemplateEntry } from './registry'

const SITE_NAME = 'BM Support'

interface Props {
  displayName?: string
  reason?: string
}

const AccountBannedEmail = ({
  displayName,
  reason,
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your {SITE_NAME} account has been suspended</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Your {SITE_NAME} account has been suspended</Heading>
        <Text style={text}>
          Hi {displayName || 'there'}, your <strong>{SITE_NAME}</strong> account has been suspended
          and you can no longer sign in.
        </Text>
        <Section style={card}>
          <Text style={cardLabel}>Reason given</Text>
          <Text style={reasonText}>{reason || 'Breach of our community and service rules.'}</Text>
        </Section>
        <Section style={appealCard}>
          <Text style={cardLabel}>Think this is a mistake?</Text>
          <Text style={text}>
            You can appeal this decision. Simply reply to this email, tell us what happened and our team will review your account and come back to you.
          </Text>
          <Text style={text}>
            Please include the email address on your account so we can find it quickly.
          </Text>
        </Section>
        <Hr style={hr} />
        <Text style={footer}>{SITE_NAME}</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: AccountBannedEmail,
  subject: `Your ${SITE_NAME} account has been suspended`,
  displayName: 'Account suspended (BM Support)',
  previewData: {
    displayName: 'Jane',
    reason: 'Repeated breach of our community rules.',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px', maxWidth: '560px', margin: '0 auto' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#0d0d0d', margin: '0 0 16px' }
const text = { fontSize: '14px', color: '#444', lineHeight: '1.6', margin: '0 0 12px' }
const reasonText = { fontSize: '14px', color: '#7f1d1d', lineHeight: '1.6', margin: '0' }
const card = { background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '16px 20px', margin: '16px 0' }
const appealCard = { background: '#f5f3ff', border: '1px solid #c4b5fd', borderRadius: '8px', padding: '16px 20px', margin: '16px 0' }
const cardLabel = { fontSize: '12px', color: '#5b21b6', textTransform: 'uppercase' as const, letterSpacing: '0.5px', margin: '0 0 6px', fontWeight: 'bold' as const }
const hr = { borderColor: '#eee', margin: '24px 0' }
const footer = { fontSize: '12px', color: '#999', margin: '0 0 6px' }
