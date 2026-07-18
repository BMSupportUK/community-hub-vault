import React from 'react'
import { Body, Container, Head, Heading, Html, Preview, Text, Section, Hr } from '@react-email/components'
import type { TemplateEntry } from './registry'

const SITE_NAME = 'BM Support'

interface Props {
  userName?: string
  tempPin?: string
  resetByName?: string
  loginUrl?: string
}

const VaultPinResetEmail = ({ userName, tempPin = '0000', resetByName, loginUrl = 'https://bmsupport.uk' }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your credentials vault PIN has been reset</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>{userName ? `Hi ${userName},` : 'Hi,'}</Heading>
        <Text style={text}>
          Your credentials vault PIN on {SITE_NAME} has been reset{resetByName ? ` by ${resetByName}` : ' by an administrator'}.
        </Text>
        <Section style={card}>
          <Text style={cardLabel}>Your temporary PIN</Text>
          <Text style={pinStyle}>{tempPin}</Text>
          <Text style={smallText}>
            You'll be prompted to choose a new PIN the next time you unlock your vault.
          </Text>
        </Section>
        <Text style={text}>
          <strong>For your security, change this PIN as soon as possible.</strong> Sign in and open your credentials vault to set a new one.
        </Text>
        <Text style={text}>
          Sign in at <a href={loginUrl} style={link}>{loginUrl}</a>
        </Text>
        <Hr style={hr} />
        <Text style={footer}>
          If you did <strong>not</strong> request this reset, please reply to this email immediately.
        </Text>
        <Text style={footer}>{SITE_NAME}</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: VaultPinResetEmail,
  subject: 'Your credentials vault PIN has been reset',
  displayName: 'Vault PIN reset',
  previewData: { userName: 'Jane', tempPin: '0000', resetByName: 'Admin' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px', maxWidth: '560px', margin: '0 auto' }
const h1 = { fontSize: '20px', fontWeight: 'bold' as const, color: '#0d0d0d', margin: '0 0 16px' }
const text = { fontSize: '14px', color: '#444', lineHeight: '1.6', margin: '0 0 12px' }
const smallText = { fontSize: '12px', color: '#666', lineHeight: '1.5', margin: '8px 0 0' }
const card = { background: '#f6f6f8', borderRadius: '8px', padding: '16px 20px', margin: '16px 0', textAlign: 'center' as const }
const cardLabel = { fontSize: '12px', color: '#666', textTransform: 'uppercase' as const, letterSpacing: '0.5px', margin: '0 0 6px' }
const pinStyle = { fontSize: '32px', fontWeight: 'bold' as const, color: '#c8102e', letterSpacing: '8px', margin: '0', fontFamily: 'monospace' }
const link = { color: '#c8102e', textDecoration: 'underline' }
const hr = { borderColor: '#eee', margin: '24px 0' }
const footer = { fontSize: '12px', color: '#999', margin: '0 0 6px' }