import React from 'react'
import { Body, Button, Container, Head, Heading, Html, Preview, Text, Section, Hr } from '@react-email/components'
import type { TemplateEntry } from './registry'

interface Props { name?: string; device?: string; approveUrl?: string }

const PlayerLoginApprovalEmail = ({ name, device = 'BM Player', approveUrl = 'https://bmsupport.uk' }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Approve your BM Player login</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Approve your BM Player login</Heading>
        <Text style={text}>Hi {name || 'there'}, a BM Player app ({device}) is asking to open on your account.</Text>
        <Section style={{ textAlign: 'center', margin: '20px 0' }}>
          <Button href={approveUrl} style={button}>Approve or deny</Button>
        </Section>
        <Text style={small}>This link works once and expires after 10 minutes. If this wasn't you, press Deny or ignore this email — the app stays locked.</Text>
        <Hr style={hr} />
        <Text style={footer}>BM Support</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: PlayerLoginApprovalEmail,
  subject: 'Approve your BM Player login',
  displayName: 'BM Player login approval',
  previewData: { name: 'Jane', device: 'firetv', approveUrl: 'https://bmsupport.uk/player-approve/example' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px', maxWidth: '560px', margin: '0 auto' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#0d0d0d', margin: '0 0 16px' }
const text = { fontSize: '14px', color: '#444', lineHeight: '1.6', margin: '0 0 12px' }
const small = { fontSize: '12px', color: '#666', lineHeight: '1.5', margin: '8px 0 0' }
const button = { background: '#7c3aed', color: '#ffffff', borderRadius: '8px', padding: '12px 24px', fontWeight: 'bold' as const, textDecoration: 'none' }
const hr = { borderColor: '#eee', margin: '24px 0' }
const footer = { fontSize: '12px', color: '#999', margin: 0 }
