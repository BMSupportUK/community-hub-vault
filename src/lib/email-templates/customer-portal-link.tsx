import React from 'react'
import { Body, Container, Head, Heading, Html, Preview, Text, Section, Hr } from '@react-email/components'
import type { TemplateEntry } from './registry'

interface Props { name?: string; loginCode?: string }

const PortalLinkEmail = ({ name, loginCode = '00000000' }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your BM Support customer portal login code</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Your portal login code</Heading>
        <Text style={text}>Hi {name || 'there'}, enter this code on your BM Support customer portal lock screen.</Text>
        <Section style={card}>
          <Section style={{ textAlign: 'center', margin: '8px 0' }}>
            <Text style={codeStyle}>{loginCode}</Text>
          </Section>
          <Text style={small}>This code lasts 24 hours. The portal locks again one hour after you unlock it. Requesting a new code stops the previous code working. Never share this code.</Text>
        </Section>
        <Text style={text}>If you didn't ask for this, you can ignore this email.</Text>
        <Hr style={hr} />
        <Text style={footer}>BM Support</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: PortalLinkEmail,
  subject: 'Your BM Support portal login code',
  displayName: 'Customer portal login code',
  previewData: { name: 'Jane', loginCode: '12345678' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px', maxWidth: '560px', margin: '0 auto' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#0d0d0d', margin: '0 0 16px' }
const text = { fontSize: '14px', color: '#444', lineHeight: '1.6', margin: '0 0 12px' }
const small = { fontSize: '12px', color: '#666', lineHeight: '1.5', margin: '8px 0 0', textAlign: 'center' as const }
const card = { background: '#f5f3ff', border: '1px solid #c4b5fd', borderRadius: '8px', padding: '16px 20px', margin: '16px 0' }
const codeStyle = { color: '#0d0d0d', fontFamily: 'monospace', fontWeight: 'bold' as const, fontSize: '32px', margin: '12px 0' }
const hr = { borderColor: '#eee', margin: '24px 0' }
const footer = { fontSize: '12px', color: '#999', margin: 0 }
