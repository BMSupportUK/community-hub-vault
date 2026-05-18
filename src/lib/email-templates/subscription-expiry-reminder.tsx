import React from 'react'
import { Body, Button, Container, Head, Heading, Html, Preview, Text, Section, Hr } from '@react-email/components'
import type { TemplateEntry } from './registry'

const SITE_NAME = 'BM Support'

interface Props {
  appLoginName?: string
  expiresAt?: string
  daysRemaining?: number
  profileUrl?: string
}

const SubscriptionExpiryReminderEmail = ({ appLoginName, expiresAt, daysRemaining, profileUrl }: Props) => {
  const isFinal = (daysRemaining ?? 7) <= 1
  const headline = isFinal
    ? 'Final reminder: your subscription expires in 24 hours'
    : 'Your subscription expires in 7 days'
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{headline}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>{headline}</Heading>
          <Text style={text}>
            This is a reminder that your {SITE_NAME} subscription
            {appLoginName ? <> for <strong>{appLoginName}</strong></> : null} is due to expire
            {expiresAt ? <> on <strong>{expiresAt}</strong></> : ' soon'}.
          </Text>
          <Section style={card}>
            <Text style={text}>
              To avoid losing access, please renew before the expiry date. If you have already renewed,
              you can ignore this message.
            </Text>
          </Section>
          {profileUrl ? (
            <Section style={{ textAlign: 'center' as const, margin: '20px 0' }}>
              <Button href={profileUrl} style={btn}>View my subscription</Button>
            </Section>
          ) : null}
          <Hr style={hr} />
          <Text style={footer}>{SITE_NAME}</Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: SubscriptionExpiryReminderEmail,
  subject: (data: Record<string, any>) =>
    (data?.daysRemaining ?? 7) <= 1
      ? 'Final reminder: your subscription expires in 24 hours'
      : 'Your subscription expires in 7 days',
  displayName: 'Subscription expiry reminder',
  previewData: { appLoginName: 'Acme Pro', expiresAt: 'Mon 25 May 2026, 18:00 BST', daysRemaining: 7, profileUrl: 'https://bmsupport.uk/profile' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px', maxWidth: '560px', margin: '0 auto' }
const h1 = { fontSize: '20px', fontWeight: 'bold' as const, color: '#0d0d0d', margin: '0 0 16px' }
const text = { fontSize: '14px', color: '#444', lineHeight: '1.6', margin: '0 0 12px' }
const card = { background: '#f6f6f8', borderRadius: '8px', padding: '14px 18px', margin: '12px 0' }
const btn = { background: '#0d0d0d', color: '#ffffff', padding: '12px 20px', borderRadius: '8px', textDecoration: 'none', fontSize: '14px', fontWeight: 'bold' as const }
const hr = { borderColor: '#eee', margin: '24px 0' }
const footer = { fontSize: '12px', color: '#999', margin: 0 }
