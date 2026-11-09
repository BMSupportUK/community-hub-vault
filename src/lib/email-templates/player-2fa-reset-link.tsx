import React from 'react'
import { Body, Button, Container, Head, Heading, Html, Preview, Text, Section, Hr } from '@react-email/components'
import type { TemplateEntry } from './registry'

interface Props { name?: string; chatUrl?: string }

const Player2faResetLinkEmail = ({ name, chatUrl = 'https://bmsupport.uk' }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Reset your BM Player 2FA</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={hero}>
          <Text style={badge}>BM PLAYER · 2FA HELP</Text>
          <Heading style={h1}>Lost your authenticator?</Heading>
          <Text style={heroText}>No problem — we'll get your box back up and running in a couple of minutes.</Text>
        </Section>
        <Text style={text}>Hi {name || 'there'}, your BM Player asked us to help you reset 2FA. Open the help chat below, type your 6-digit account number and it will give you a reset code to enter on your box.</Text>
        <Section style={{ textAlign: 'center', margin: '24px 0' }}>
          <Button href={chatUrl} style={button}>Open 2FA help chat</Button>
        </Section>
        <Section style={steps}>
          <Text style={step}>1. Open the chat and type your account number</Text>
          <Text style={step}>2. Type the 8-digit reset code on your box</Text>
          <Text style={step}>3. Scan the new QR code with your authenticator app</Text>
        </Section>
        <Text style={small}>This link is just for you and works for 24 hours. It stops working once you confirm you're back up and running. Didn't ask for this? Ignore this email — nothing changes.</Text>
        <Hr style={hr} />
        <Text style={footer}>BM Support</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Player2faResetLinkEmail,
  subject: 'Reset your BM Player 2FA',
  displayName: 'BM Player 2FA reset link',
  previewData: { name: 'Jane', chatUrl: 'https://bmsupport.uk/2fa-help/example' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px', maxWidth: '560px', margin: '0 auto' }
const hero = { background: '#2a1450', borderRadius: '14px', padding: '28px 24px', textAlign: 'center' as const }
const badge = { fontSize: '11px', letterSpacing: '2px', color: '#f0abfc', fontWeight: 'bold' as const, margin: '0 0 8px' }
const h1 = { fontSize: '24px', fontWeight: 'bold' as const, color: '#ffffff', margin: '0 0 8px' }
const heroText = { fontSize: '14px', color: '#ddd6fe', margin: 0 }
const text = { fontSize: '14px', color: '#444', lineHeight: '1.6', margin: '20px 0 0' }
const steps = { background: '#f5f3ff', borderRadius: '10px', padding: '12px 18px' }
const step = { fontSize: '13px', color: '#3b0764', margin: '6px 0' }
const small = { fontSize: '12px', color: '#666', lineHeight: '1.5', margin: '16px 0 0' }
const button = { background: '#c026d3', color: '#ffffff', borderRadius: '10px', padding: '14px 28px', fontWeight: 'bold' as const, textDecoration: 'none' }
const hr = { borderColor: '#eee', margin: '24px 0' }
const footer = { fontSize: '12px', color: '#999', margin: 0 }
