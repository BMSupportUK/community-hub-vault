import React from 'react'
import { Body, Container, Head, Heading, Html, Preview, Text, Section, Hr, Button } from '@react-email/components'
import type { TemplateEntry } from './registry'

interface Props { name?: string; loginUrl?: string }

const PortalLinkEmail = ({ name, loginUrl = 'https://bmsupport.uk' }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your BM Support customer portal login link</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Your portal login link</Heading>
        <Text style={text}>Hi {name || 'there'}, tap the button below to open your BM Support customer portal.</Text>
        <Section style={card}>
          <Section style={{ textAlign: 'center', margin: '8px 0' }}>
            <Button href={loginUrl} style={btn}>Open my portal</Button>
          </Section>
          <Text style={small}>This link works once and expires after 24 hours. Requesting a new link stops this one working.</Text>
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
  subject: 'Your BM Support portal login link',
  displayName: 'Customer portal login link',
  previewData: { name: 'Jane', loginUrl: 'https://bmsupport.uk/portal/example' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px', maxWidth: '560px', margin: '0 auto' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#0d0d0d', margin: '0 0 16px' }
const text = { fontSize: '14px', color: '#444', lineHeight: '1.6', margin: '0 0 12px' }
const small = { fontSize: '12px', color: '#666', lineHeight: '1.5', margin: '8px 0 0', textAlign: 'center' as const }
const card = { background: '#f5f3ff', border: '1px solid #c4b5fd', borderRadius: '8px', padding: '16px 20px', margin: '16px 0' }
const btn = { background: '#7c3aed', color: '#ffffff', padding: '12px 22px', borderRadius: '8px', textDecoration: 'none', fontWeight: 'bold' as const, fontSize: '14px' }
const hr = { borderColor: '#eee', margin: '24px 0' }
const footer = { fontSize: '12px', color: '#999', margin: 0 }
