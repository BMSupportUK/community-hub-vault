import React from 'react'
import { Body, Container, Head, Heading, Html, Preview, Text, Section, Hr, Button } from '@react-email/components'
import type { TemplateEntry } from './registry'

const SITE_NAME = 'BM Support'

interface Props {
  displayName?: string
  loginUrl?: string
}

const AccountApprovedEmail = ({ displayName, loginUrl = 'https://bmsupport.uk/home' }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your {SITE_NAME} account has been approved</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>✅ You're in, {displayName || 'there'}!</Heading>
        <Text style={text}>
          Good news — your <strong>{SITE_NAME}</strong> account has been reviewed and approved by our team.
        </Text>
        <Section style={card}>
          <Text style={cardLabel}>What you can do now</Text>
          <Text style={text}>
            • Browse the knowledge base, install guides and sports guides<br />
            • Open a support ticket with our team<br />
            • Join the community channels and shop the latest packages
          </Text>
          <Section style={{ textAlign: 'center', margin: '20px 0 4px' }}>
            <Button href={loginUrl} style={btn}>Sign in to BM Support</Button>
          </Section>
          <Text style={smallText}>
            Or open this link: <a href={loginUrl} style={link}>{loginUrl}</a>
          </Text>
        </Section>
        <Text style={text}>
          If you didn't request an account, please reply to this email and let us know.
        </Text>
        <Hr style={hr} />
        <Text style={footer}>{SITE_NAME}</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: AccountApprovedEmail,
  subject: `✅ Your ${SITE_NAME} account is approved`,
  displayName: 'Account approved (BM Support)',
  previewData: { displayName: 'Jane', loginUrl: 'https://bmsupport.uk/home' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px', maxWidth: '560px', margin: '0 auto' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#0d0d0d', margin: '0 0 16px' }
const text = { fontSize: '14px', color: '#444', lineHeight: '1.6', margin: '0 0 12px' }
const smallText = { fontSize: '12px', color: '#666', lineHeight: '1.5', margin: '8px 0 0', textAlign: 'center' as const }
const card = { background: '#f5f3ff', border: '1px solid #c4b5fd', borderRadius: '8px', padding: '16px 20px', margin: '16px 0' }
const cardLabel = { fontSize: '12px', color: '#5b21b6', textTransform: 'uppercase' as const, letterSpacing: '0.5px', margin: '0 0 6px', fontWeight: 'bold' as const }
const btn = { background: '#7c3aed', color: '#ffffff', padding: '12px 22px', borderRadius: '8px', textDecoration: 'none', fontWeight: 'bold' as const, fontSize: '14px' }
const link = { color: '#7c3aed', textDecoration: 'underline' }
const hr = { borderColor: '#eee', margin: '24px 0' }
const footer = { fontSize: '12px', color: '#999', margin: '0 0 6px' }
