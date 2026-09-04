import React from 'react'
import { Body, Button, Container, Head, Heading, Html, Preview, Text, Section, Hr } from '@react-email/components'
import type { TemplateEntry } from './registry'

const SITE_NAME = 'BM Support'

interface Props {
  displayName?: string
  gwNumber?: number
  fixtureLabel?: string
  kickoffAt?: string
  lockAt?: string
  fantasyUrl?: string
}

const FantasySquadFinalReminderEmail = ({ displayName, gwNumber, fixtureLabel, kickoffAt, lockAt, fantasyUrl }: Props) => {
  const gwLabel = gwNumber ? `Gameweek ${gwNumber}` : 'the next gameweek'
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>Final reminder — squads lock in about an hour</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={banner}>
            <Text style={bannerText}>FINAL REMINDER · 1 HOUR TO GO</Text>
          </Section>
          <Heading style={h1}>{displayName ? `Hi ${displayName},` : 'Hi,'}</Heading>
          <Text style={text}>
            You still haven&apos;t saved a squad for <strong>{gwLabel}</strong>
            {fixtureLabel ? <> — <strong>{fixtureLabel}</strong></> : null}
            {kickoffAt ? <>, kick-off <strong>{kickoffAt}</strong></> : null}.
          </Text>
          <Section style={card}>
            <Text style={cardText}>
              Squads lock <strong>30 minutes before kick-off</strong>
              {lockAt ? <> — that&apos;s <strong>{lockAt}</strong></> : null}. Squads don&apos;t carry
              over from last week, and a gameweek with no squad saved scores nothing.
            </Text>
          </Section>
          {fantasyUrl ? (
            <Section style={{ textAlign: 'center' as const, margin: '20px 0' }}>
              <Button href={fantasyUrl} style={btn}>Pick your squad now</Button>
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
  component: FantasySquadFinalReminderEmail,
  subject: (data: Record<string, any>) =>
    data?.gwNumber
      ? `Last chance: pick your Gameweek ${data.gwNumber} squad — locks in 1 hour`
      : 'Last chance: pick your MFC Fantasy squad — locks in 1 hour',
  displayName: 'Fantasy squad final reminder',
  previewData: {
    displayName: 'Alex',
    gwNumber: 6,
    fixtureLabel: 'Middlesbrough v Queens Park Rangers',
    kickoffAt: 'Sat 5 Sep, 15:00 BST',
    lockAt: 'Sat 5 Sep, 14:30 BST',
    fantasyUrl: 'https://bmsupport.uk/boro-fantasy',
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
