import React from 'react'
import { Body, Button, Container, Head, Heading, Html, Preview, Text, Section, Hr } from '@react-email/components'
import type { TemplateEntry } from './registry'

const SITE_NAME = 'BM Support'

interface Props {
  displayName?: string
  missingCount?: number
  nextKickoffAt?: string
  predictionsUrl?: string
}

const WcPredictionReminderEmail = ({ displayName, missingCount, nextKickoffAt, predictionsUrl }: Props) => {
  const count = missingCount ?? 1
  const headline = count > 1
    ? `You have ${count} World Cup matches still to predict`
    : 'You have a World Cup match still to predict'
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{headline} — predictions lock 30 minutes before kick-off</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>{displayName ? `Hi ${displayName},` : 'Hi,'}</Heading>
          <Text style={text}>
            {headline} in the next 24 hours{nextKickoffAt ? <> — the first kicks off at <strong>{nextKickoffAt}</strong></> : null}.
          </Text>
          <Section style={card}>
            <Text style={text}>
              <strong>Heads up:</strong> predictions lock <strong>30 minutes before kick-off</strong>.
              Once a match is locked you can't enter or change your score for it, and you'll score zero on any missed games.
            </Text>
          </Section>
          {predictionsUrl ? (
            <Section style={{ textAlign: 'center' as const, margin: '20px 0' }}>
              <Button href={predictionsUrl} style={btn}>Enter your predictions</Button>
            </Section>
          ) : null}
          <Text style={text}>
            Good luck — and may the best caller win.
          </Text>
          <Hr style={hr} />
          <Text style={footer}>{SITE_NAME} · World Cup Predictor</Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: WcPredictionReminderEmail,
  subject: (data: Record<string, any>) => {
    const c = data?.missingCount ?? 1
    return c > 1
      ? `Reminder: ${c} World Cup matches still to predict`
      : 'Reminder: 1 World Cup match still to predict'
  },
  displayName: 'WC predictions reminder',
  previewData: {
    displayName: 'Alex',
    missingCount: 3,
    nextKickoffAt: 'Today, 17:00 BST',
    predictionsUrl: 'https://bmsupport.uk/predictions',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px', maxWidth: '560px', margin: '0 auto' }
const h1 = { fontSize: '20px', fontWeight: 'bold' as const, color: '#0d0d0d', margin: '0 0 16px' }
const text = { fontSize: '14px', color: '#444', lineHeight: '1.6', margin: '0 0 12px' }
const card = { background: '#f6f6f8', borderRadius: '8px', padding: '14px 18px', margin: '12px 0' }
const btn = { background: '#0d0d0d', color: '#ffffff', padding: '12px 20px', borderRadius: '8px', textDecoration: 'none', fontSize: '14px', fontWeight: 'bold' as const }
const hr = { borderColor: '#eee', margin: '24px 0' }
const footer = { fontSize: '12px', color: '#999', margin: 0 }