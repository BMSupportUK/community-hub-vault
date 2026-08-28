import React from 'react'
import { Body, Button, Container, Head, Heading, Html, Preview, Text, Section, Hr } from '@react-email/components'
import type { TemplateEntry } from './registry'

const SITE_NAME = 'BM Support'

interface Props {
  displayName?: string
  missingCount?: number
  nextKickoffAt?: string
  fantasyUrl?: string
  gwNumber?: number
  fixtureLabel?: string
}

const FantasySquadReminderEmail = ({ displayName, missingCount, nextKickoffAt, fantasyUrl, gwNumber, fixtureLabel }: Props) => {
  const count = missingCount ?? 1
  const gwLabel = gwNumber ? `Gameweek ${gwNumber}` : 'the next gameweek'
  const headline = count > 1
    ? `You haven't picked a squad for your next ${count} fantasy gameweeks yet`
    : `You haven't picked your squad for ${gwLabel} yet`
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{headline} — squads lock 30 minutes before kick-off</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>{displayName ? `Hi ${displayName},` : 'Hi,'}</Heading>
          <Text style={text}>
            {headline}
            {fixtureLabel ? <> — <strong>{fixtureLabel}</strong></> : null}
            {nextKickoffAt ? <>, kick-off <strong>{nextKickoffAt}</strong></> : null}.
          </Text>
          <Section style={card}>
            <Text style={text}>
              <strong>Remember:</strong> squads don't carry over — every gameweek is a fresh pick,
              so last week's team isn't entered for this one. Picks lock <strong>30 minutes before kick-off</strong>,
              and a gameweek with no squad saved scores nothing.
            </Text>
          </Section>
          {fantasyUrl ? (
            <Section style={{ textAlign: 'center' as const, margin: '20px 0' }}>
              <Button href={fantasyUrl} style={btn}>Pick your squad</Button>
            </Section>
          ) : null}
          <Text style={text}>Good luck, gaffer.</Text>
          <Hr style={hr} />
          <Text style={footer}>{SITE_NAME} · MFC Fantasy Manager</Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: FantasySquadReminderEmail,
  subject: (data: Record<string, any>) => {
    const c = data?.missingCount ?? 1
    return c > 1
      ? `Reminder: ${c} fantasy gameweeks still need a squad`
      : 'Reminder: pick your MFC Fantasy squad before kick-off'
  },
  displayName: 'Fantasy squad reminder',
  previewData: {
    displayName: 'Alex',
    missingCount: 1,
    nextKickoffAt: 'Today, 15:00 BST',
    fantasyUrl: 'https://bmsupport.uk/boro-fantasy',
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
