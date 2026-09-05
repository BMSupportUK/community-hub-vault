import React from 'react'
import { Body, Container, Head, Heading, Html, Preview, Text, Section, Hr, Button } from '@react-email/components'
import type { TemplateEntry } from './registry'

const ZONE_NAME = 'Boro Fan Zone'

interface Props {
  displayName?: string
  fanZoneUrl?: string
}

const FanZoneApprovedEmail = ({ displayName, fanZoneUrl = 'https://bmsupport.uk/fan-zone' }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Welcome to the {ZONE_NAME} — your access is approved</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>🔴 Welcome to the {ZONE_NAME}, {displayName || 'Boro fan'}!</Heading>
        <Text style={text}>
          Your request to join the <strong>{ZONE_NAME}</strong> has been approved. Up the Boro!
        </Text>
        <Section style={card}>
          <Text style={cardLabel}>Get stuck in</Text>
          <Text style={text}>
            • Post on the fan boards and match day threads<br />
            • Enter the <strong>MFC Score Predictions</strong> game<br />
            • Pick your side in the <strong>Boro Fantasy Manager</strong><br />
            • Set your Fan Zone alias and avatar in your profile
          </Text>
          <Section style={{ textAlign: 'center', margin: '20px 0 4px' }}>
            <Button href={fanZoneUrl} style={btn}>Enter the Fan Zone</Button>
          </Section>
          <Text style={smallText}>
            Or open this link: <a href={fanZoneUrl} style={link}>{fanZoneUrl}</a>
          </Text>
        </Section>
        <Text style={text}>
          Keep it friendly and respectful — our moderators are always about.
        </Text>
        <Hr style={hr} />
        <Text style={footer}>{ZONE_NAME}</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: FanZoneApprovedEmail,
  subject: `🔴 You're in — welcome to the ${ZONE_NAME}`,
  displayName: 'Account approved (Boro Fan Zone)',
  previewData: { displayName: 'Jane', fanZoneUrl: 'https://bmsupport.uk/fan-zone' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px', maxWidth: '560px', margin: '0 auto' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#0d0d0d', margin: '0 0 16px' }
const text = { fontSize: '14px', color: '#444', lineHeight: '1.6', margin: '0 0 12px' }
const smallText = { fontSize: '12px', color: '#666', lineHeight: '1.5', margin: '8px 0 0', textAlign: 'center' as const }
const card = { background: '#fff1f2', border: '1px solid #fca5a5', borderRadius: '8px', padding: '16px 20px', margin: '16px 0' }
const cardLabel = { fontSize: '12px', color: '#9f1239', textTransform: 'uppercase' as const, letterSpacing: '0.5px', margin: '0 0 6px', fontWeight: 'bold' as const }
const btn = { background: '#c8102e', color: '#ffffff', padding: '12px 22px', borderRadius: '8px', textDecoration: 'none', fontWeight: 'bold' as const, fontSize: '14px' }
const link = { color: '#c8102e', textDecoration: 'underline' }
const hr = { borderColor: '#eee', margin: '24px 0' }
const footer = { fontSize: '12px', color: '#999', margin: '0 0 6px' }
