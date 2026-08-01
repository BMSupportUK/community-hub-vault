import React from 'react'
import { Body, Button, Container, Head, Heading, Html, Preview, Text, Section, Hr } from '@react-email/components'
import type { TemplateEntry } from './registry'

const SITE_NAME = 'BM Support'

interface Props {
  displayName?: string
  predictionsUrl?: string
}

const BoroPredictorInviteEmail = ({
  displayName,
  predictionsUrl = 'https://bmsupport.uk/boro-predictions',
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>You played the World Cup 2026 Predictor — now take on the MFC 2026/27 Predictor</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>{displayName ? `Hi ${displayName},` : 'Hi,'}</Heading>
        <Text style={text}>
          Thanks for taking part in the <strong>World Cup 2026 Predictor</strong> on {SITE_NAME}.
          Our next competition is now open: the <strong>MFC 2026/27 Predictor</strong>.
        </Text>
        <Section style={card}>
          <Text style={text}>
            Call every Middlesbrough result of the 2026/27 season, climb the leaderboard and
            play for Amazon vouchers. Predictions lock <strong>30 minutes before kick-off</strong>,
            so get signed up before the first game.
          </Text>
        </Section>
        <Section style={{ textAlign: 'center' as const, margin: '20px 0' }}>
          <Button href={predictionsUrl} style={btn}>Join the MFC 2026/27 Predictor</Button>
        </Section>
        <Text style={smallText}>
          Or open this link: <a href={predictionsUrl} style={link}>{predictionsUrl}</a>
        </Text>
        <Text style={text}>Good luck — and up the Boro. 🔴</Text>
        <Hr style={hr} />
        <Text style={footer}>{SITE_NAME} · MFC 2026/27 Predictor</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: BoroPredictorInviteEmail,
  subject: "You're invited: MFC 2026/27 Predictor is now open",
  displayName: 'Boro predictor invite',
  previewData: {
    displayName: 'Alex',
    predictionsUrl: 'https://bmsupport.uk/boro-predictions',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px', maxWidth: '560px', margin: '0 auto' }
const h1 = { fontSize: '20px', fontWeight: 'bold' as const, color: '#0d0d0d', margin: '0 0 16px' }
const text = { fontSize: '14px', color: '#444', lineHeight: '1.6', margin: '0 0 12px' }
const smallText = { fontSize: '12px', color: '#666', lineHeight: '1.5', margin: '0 0 16px', textAlign: 'center' as const }
const card = { background: '#f6f6f8', borderRadius: '8px', padding: '14px 18px', margin: '12px 0' }
const btn = { background: '#c8102e', color: '#ffffff', padding: '12px 22px', borderRadius: '8px', textDecoration: 'none', fontSize: '14px', fontWeight: 'bold' as const }
const link = { color: '#c8102e', textDecoration: 'underline' }
const hr = { borderColor: '#eee', margin: '24px 0' }
const footer = { fontSize: '12px', color: '#999', margin: 0 }