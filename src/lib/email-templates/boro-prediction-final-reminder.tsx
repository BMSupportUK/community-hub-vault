import React from 'react'
import { Body, Button, Container, Head, Heading, Html, Preview, Text, Section, Hr } from '@react-email/components'
import type { TemplateEntry } from './registry'

const SITE_NAME = 'BM Support'

interface Props {
  displayName?: string
  fixtureLabel?: string
  kickoffAt?: string
  lockAt?: string
  predictionsUrl?: string
}

const BoroPredictionFinalReminderEmail = ({ displayName, fixtureLabel, kickoffAt, lockAt, predictionsUrl }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Final reminder — predictions close in about an hour</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={banner}>
          <Text style={bannerText}>FINAL REMINDER · 1 HOUR TO GO</Text>
        </Section>
        <Heading style={h1}>{displayName ? `Hi ${displayName},` : 'Hi,'}</Heading>
        <Text style={text}>
          You still haven&apos;t put a score in for{' '}
          <strong>{fixtureLabel ?? 'the next Boro match'}</strong>
          {kickoffAt ? <>, kick-off <strong>{kickoffAt}</strong></> : null}.
        </Text>
        <Section style={card}>
          <Text style={cardText}>
            Predictions lock <strong>30 minutes before kick-off</strong>
            {lockAt ? <> — that&apos;s <strong>{lockAt}</strong></> : null}. This is your last
            reminder: no score in means no points from this game.
          </Text>
        </Section>
        {predictionsUrl ? (
          <Section style={{ textAlign: 'center' as const, margin: '20px 0' }}>
            <Button href={predictionsUrl} style={btn}>Put your score in now</Button>
          </Section>
        ) : null}
        <Text style={text}>Up the Boro.</Text>
        <Hr style={hr} />
        <Text style={footer}>{SITE_NAME} · MFC Score Predictions</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: BoroPredictionFinalReminderEmail,
  subject: (data: Record<string, any>) =>
    data?.fixtureLabel
      ? `Last chance: predict ${data.fixtureLabel} — closes in 1 hour`
      : 'Last chance: your Boro score prediction closes in 1 hour',
  displayName: 'Score predictions final reminder',
  previewData: {
    displayName: 'Alex',
    fixtureLabel: 'Middlesbrough v Queens Park Rangers',
    kickoffAt: 'Sat 5 Sep, 15:00 BST',
    lockAt: 'Sat 5 Sep, 14:30 BST',
    predictionsUrl: 'https://bmsupport.uk/boro-predictions',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px', maxWidth: '560px', margin: '0 auto' }
const banner = { background: '#c8102e', borderRadius: '8px', padding: '10px 16px', margin: '0 0 18px' }
const bannerText = { color: '#ffffff', fontSize: '12px', fontWeight: 'bold' as const, letterSpacing: '1px', margin: '0', textAlign: 'center' as const }
const h1 = { fontSize: '20px', fontWeight: 'bold' as const, color: '#0d0d0d', margin: '0 0 16px' }
const text = { fontSize: '14px', color: '#444', lineHeight: '1.6', margin: '0 0 12px' }
const card = { background: '#f6f6f8', borderRadius: '8px', padding: '14px 18px', margin: '12px 0' }
const cardText = { fontSize: '14px', color: '#333', lineHeight: '1.6', margin: '0' }
const btn = { background: '#c8102e', color: '#ffffff', padding: '12px 20px', borderRadius: '8px', textDecoration: 'none', fontSize: '14px', fontWeight: 'bold' as const }
const hr = { borderColor: '#e6e6e6', margin: '20px 0' }
const footer = { fontSize: '12px', color: '#888', margin: '0' }
