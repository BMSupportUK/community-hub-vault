import React from 'react'
import { Body, Container, Head, Heading, Html, Preview, Text, Section, Hr } from '@react-email/components'
import type { TemplateEntry } from './registry'

const SITE_NAME = 'BM Support'

interface Props {
  userName?: string
  tempCode?: string
  resetByName?: string
  loginUrl?: string
}

const ScreenLockResetEmail = ({ userName, tempCode = '000000', resetByName, loginUrl = 'https://bmsupport.uk' }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your screen lock code has been reset</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>{userName ? `Hi ${userName},` : 'Hi,'}</Heading>
        <Text style={text}>
          Your screen lock code on {SITE_NAME} has been reset{resetByName ? ` by ${resetByName}` : ' by a member of our team'}.
        </Text>
        <Section style={card}>
          <Text style={cardLabel}>Your temporary lock code</Text>
          <Text style={pinStyle}>{tempCode}</Text>
          <Text style={smallText}>
            Enter this on the lock screen. You&apos;ll then be asked to choose a new code straight away.
          </Text>
        </Section>
        <Text style={text}>
          <strong>This temporary code is single use.</strong> You must set a new code before the app unlocks.
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
  component: ScreenLockResetEmail,
  subject: 'Your screen lock code has been reset',
  displayName: 'Screen lock reset',
  previewData: { userName: 'Jane', tempCode: '482913', resetByName: 'Owner' },
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
