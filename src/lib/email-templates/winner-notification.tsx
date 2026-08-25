import React from 'react'
import { Body, Container, Head, Heading, Html, Preview, Text, Section, Hr, Button } from '@react-email/components'
import type { TemplateEntry } from './registry'

const SITE_NAME = 'BM Support'

interface Props {
  displayName?: string
  place?: 1 | 2 | 3 | number
  competitionTitle?: string
  winnersUrl?: string
}

const ordinal = (n?: number) => (n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n ?? ''}`)

const WinnerEmail = ({
  displayName,
  place = 1,
  competitionTitle = 'Predictor',
  winnersUrl = 'https://bmsupport.uk',
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Congratulations — you're a {competitionTitle} winner! 🏆</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>🏆 Congratulations {displayName || 'Winner'}!</Heading>
        <Text style={text}>
          You've finished in <strong>{ordinal(place)} place</strong> in the <strong>{competitionTitle}</strong> on {SITE_NAME}.
        </Text>
        <Section style={card}>
          <Text style={cardLabel}>Next step</Text>
          <Text style={text}>
            To claim your Amazon voucher, please head to the Winners page and click
            <strong> "Confirm my email"</strong>. This lets us know which email address to send your voucher to.
          </Text>
          <Section style={{ textAlign: 'center', margin: '20px 0 4px' }}>
            <Button href={winnersUrl} style={btn}>Confirm my email</Button>
          </Section>
          <Text style={smallText}>
            Or open this link: <a href={winnersUrl} style={link}>{winnersUrl}</a>
          </Text>
        </Section>
        <Text style={text}>
          Once you've confirmed, an owner will send your voucher across shortly. 🎉
        </Text>
        <Hr style={hr} />
        <Text style={footer}>{SITE_NAME}</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: WinnerEmail,
  subject: (data: Record<string, any>) => `🏆 You're a winner — ${data.competitionTitle ?? 'Predictor'}!`,
  displayName: 'Predictions winner notification',
  previewData: { displayName: 'Jane', place: 1, competitionTitle: 'World Cup 2026 Predictor', winnersUrl: 'https://bmsupport.uk/predictions?tab=winners' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px', maxWidth: '560px', margin: '0 auto' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#0d0d0d', margin: '0 0 16px' }
const text = { fontSize: '14px', color: '#444', lineHeight: '1.6', margin: '0 0 12px' }
const smallText = { fontSize: '12px', color: '#666', lineHeight: '1.5', margin: '8px 0 0', textAlign: 'center' as const }
const card = { background: '#fff7ed', border: '1px solid #fcd34d', borderRadius: '8px', padding: '16px 20px', margin: '16px 0' }
const cardLabel = { fontSize: '12px', color: '#92400e', textTransform: 'uppercase' as const, letterSpacing: '0.5px', margin: '0 0 6px', fontWeight: 'bold' as const }
const btn = { background: '#c8102e', color: '#ffffff', padding: '12px 22px', borderRadius: '8px', textDecoration: 'none', fontWeight: 'bold' as const, fontSize: '14px' }
const link = { color: '#c8102e', textDecoration: 'underline' }
const hr = { borderColor: '#eee', margin: '24px 0' }
const footer = { fontSize: '12px', color: '#999', margin: '0 0 6px' }