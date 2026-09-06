import React from 'react'
import { Body, Container, Head, Heading, Html, Preview, Text, Section, Hr, Button } from '@react-email/components'
import type { TemplateEntry } from './registry'

const ZONE_NAME = 'Boro Fan Zone'
const APPEAL_URL = 'https://bmsupport.uk/fan-zone'

interface Props {
  displayName?: string
  /** The moderator's reply. */
  reply?: string
  /** What the member wrote, for context. */
  appealText?: string
  moderator?: string
}

const FanZoneAppealReplyEmail = ({ displayName, reply, appealText, moderator }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>A moderator has replied to your {ZONE_NAME} appeal</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>A moderator has replied to your appeal</Heading>
        <Text style={text}>
          Hi {displayName || 'there'}, {moderator ? `${moderator} has` : 'a moderator has'} replied to the appeal you
          sent about your <strong>{ZONE_NAME}</strong> ban.
        </Text>
        <Section style={replyCard}>
          <Text style={cardLabel}>Reply</Text>
          <Text style={text}>{reply || 'Your appeal has been reviewed.'}</Text>
        </Section>
        {appealText ? (
          <Section style={infoCard}>
            <Text style={cardLabel}>Your appeal</Text>
            <Text style={quote}>{appealText}</Text>
          </Section>
        ) : null}
        <Section style={{ margin: '20px 0' }}>
          <Button href={APPEAL_URL} style={button}>
            Open your appeal
          </Button>
        </Section>
        <Text style={text}>
          You can read the full conversation and add another message from the {ZONE_NAME} ban notice in the app.
        </Text>
        <Hr style={hr} />
        <Text style={footer}>{ZONE_NAME}</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: FanZoneAppealReplyEmail,
  subject: `A moderator has replied to your ${ZONE_NAME} appeal`,
  displayName: 'Fan Zone appeal reply',
  previewData: {
    displayName: 'Jane',
    reply: "We've shortened your ban to 24 hours. Please keep it civil from now on.",
    appealText: 'I lost my temper in the match thread and I am sorry.',
    moderator: 'Dane',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px', maxWidth: '560px', margin: '0 auto' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#0d0d0d', margin: '0 0 16px' }
const text = { fontSize: '14px', color: '#444', lineHeight: '1.6', margin: '0 0 12px' }
const quote = { fontSize: '14px', color: '#666', lineHeight: '1.6', margin: '0', fontStyle: 'italic' as const }
const replyCard = { background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '16px 20px', margin: '16px 0' }
const infoCard = { background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px 20px', margin: '16px 0' }
const cardLabel = { fontSize: '12px', color: '#166534', textTransform: 'uppercase' as const, letterSpacing: '0.5px', margin: '0 0 6px', fontWeight: 'bold' as const }
const button = { backgroundColor: '#E11B22', color: '#ffffff', fontSize: '14px', fontWeight: 'bold' as const, padding: '12px 20px', borderRadius: '8px', textDecoration: 'none' }
const hr = { borderColor: '#eee', margin: '24px 0' }
const footer = { fontSize: '12px', color: '#999', margin: '0 0 6px' }
