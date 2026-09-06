import React from 'react'
import { Body, Container, Head, Heading, Html, Preview, Text, Section, Hr, Link } from '@react-email/components'
import type { TemplateEntry } from './registry'

const ZONE_NAME = 'Boro Fan Zone'
export const FAN_ZONE_APPEAL_EMAIL = 'bmsupport2022@protonmail.com'
const SITE_URL = 'https://bmsupport.uk'

interface Props {
  displayName?: string
  reason?: string
  /** ISO date the ban lifts, or omitted/null for a permanent ban. */
  expiresAt?: string | null
  appealEmail?: string
}

function formatUntil(expiresAt?: string | null) {
  if (!expiresAt) return null
  const d = new Date(expiresAt)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/London',
  })
}

const FanZoneBannedEmail = ({ displayName, reason, expiresAt, appealEmail }: Props) => {
  const until = formatUntil(expiresAt)
  const email = appealEmail || FAN_ZONE_APPEAL_EMAIL
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>You have been banned from the {ZONE_NAME}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>You have been banned from the {ZONE_NAME}</Heading>
          <Text style={text}>
            Hi {displayName || 'there'}, a moderator has banned you from the <strong>{ZONE_NAME}</strong>. You can no
            longer read or post on the boards, match-day threads or Fan Zone messages.
          </Text>
          <Text style={text}>
            This only affects the {ZONE_NAME} — your BM Support account is not affected.
          </Text>
          <Section style={card}>
            <Text style={cardLabel}>Reason given</Text>
            <Text style={reasonText}>{reason || 'Breach of the Fan Zone rules.'}</Text>
          </Section>
          <Section style={infoCard}>
            <Text style={cardLabel}>How long</Text>
            <Text style={text}>{until ? `Your ban lifts on ${until}.` : 'This ban is permanent.'}</Text>
          </Section>
          <Section style={appealCard}>
            <Text style={cardLabel}>Want to appeal?</Text>
            <Text style={text}>
              Log in to the site and open the {ZONE_NAME}. You'll see the ban notice with an{' '}
              <strong>appeal chat box</strong> — write your appeal there and a moderator will reply in the same chat
              box, so keep an eye on it. Replies appear straight away, no need to refresh.
            </Text>
            <Text style={text}>
              <Link href={`${SITE_URL}/fan-zone`} style={button}>Log in and appeal</Link>
            </Text>
            <Text style={text}>Tell us what happened so we can look into it properly.</Text>
            <Text style={smallText}>
              Can't log in? Email us at <Link href={`mailto:${email}`} style={link}>{email}</Link>.
            </Text>
          </Section>
          <Hr style={hr} />
          <Text style={footer}>{ZONE_NAME} — {email}</Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: FanZoneBannedEmail,
  subject: `You have been banned from the ${ZONE_NAME}`,
  displayName: 'Banned from the Boro Fan Zone',
  previewData: {
    displayName: 'Jane',
    reason: 'Repeated abuse of other members after a warning.',
    expiresAt: null,
    appealEmail: FAN_ZONE_APPEAL_EMAIL,
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px', maxWidth: '560px', margin: '0 auto' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#0d0d0d', margin: '0 0 16px' }
const text = { fontSize: '14px', color: '#444', lineHeight: '1.6', margin: '0 0 12px' }
const reasonText = { fontSize: '14px', color: '#7f1d1d', lineHeight: '1.6', margin: '0' }
const card = { background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '16px 20px', margin: '16px 0' }
const infoCard = { background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px 20px', margin: '16px 0' }
const appealCard = { background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '8px', padding: '16px 20px', margin: '16px 0' }
const cardLabel = { fontSize: '12px', color: '#9a3412', textTransform: 'uppercase' as const, letterSpacing: '0.5px', margin: '0 0 6px', fontWeight: 'bold' as const }
const link = { color: '#E11B22', fontWeight: 'bold' as const, textDecoration: 'underline' }
const smallText = { fontSize: '12px', color: '#666', lineHeight: '1.6', margin: '8px 0 0' }
const button = {
  display: 'inline-block',
  background: '#E11B22',
  color: '#ffffff',
  fontWeight: 'bold' as const,
  fontSize: '14px',
  padding: '10px 18px',
  borderRadius: '6px',
  textDecoration: 'none',
}
const hr = { borderColor: '#eee', margin: '24px 0' }
const footer = { fontSize: '12px', color: '#999', margin: '0 0 6px' }
