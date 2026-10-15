import React from 'react'
import { Body, Button, Container, Head, Heading, Html, Preview, Text, Section, Hr } from '@react-email/components'
import type { TemplateEntry } from './registry'

/**
 * Tags (template data) you can place anywhere in this email:
 *   applicantName       – the applicant's full name
 *   positionTitle       – the role they applied for
 *   siteName            – "BM Support" or "Boro Fan Zone"
 *   applicationLink     – their private secure application page
 *   applicationPassword – the password to open that page
 */
interface Props {
  applicantName?: string
  positionTitle?: string
  siteName?: string
  applicationLink?: string
  applicationPassword?: string
}

const JobApplicationReceived = ({ applicantName, positionTitle, siteName = 'BM Support', applicationLink, applicationPassword }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your application{positionTitle ? ` for ${positionTitle}` : ''} has been received</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>{applicantName ? `Hi ${applicantName},` : 'Hi,'}</Heading>
        <Text style={text}>
          Thank you for applying{positionTitle ? <> for <strong>{positionTitle}</strong></> : null} at {siteName}. Our team will review your application and may message you on your private application page.
        </Text>
        <Section style={card}>
          <Text style={label}>Your secure application page</Text>
          <Text style={value}>{applicationLink ?? '{applicationLink}'}</Text>
          <Text style={label}>Password</Text>
          <Text style={code}>{applicationPassword ?? '{applicationPassword}'}</Text>
        </Section>
        {applicationLink ? (
          <Section style={{ textAlign: 'center' as const, margin: '20px 0' }}>
            <Button href={applicationLink} style={btn}>Open my application</Button>
          </Section>
        ) : null}
        <Text style={small}>Keep this link and password private. Anyone with both can view your application.</Text>
        <Hr style={hr} />
        <Text style={footer}>{siteName} · Recruitment</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: JobApplicationReceived,
  subject: (data: Record<string, any>) => (data?.positionTitle ? `Application received: ${data.positionTitle}` : 'Your job application has been received'),
  displayName: 'Job application received',
  previewData: {
    applicantName: 'Alex Smith',
    positionTitle: 'Customer Support Assistant',
    siteName: 'BM Support',
    applicationLink: 'https://bmsupport.uk/job-application/abc123',
    applicationPassword: 'A1B2-C3D4-E5F6',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px', maxWidth: '560px', margin: '0 auto' }
const h1 = { fontSize: '20px', fontWeight: 'bold' as const, color: '#0d0d0d', margin: '0 0 16px' }
const text = { fontSize: '14px', color: '#444', lineHeight: '1.6', margin: '0 0 12px' }
const card = { background: '#f6f6f8', borderRadius: '8px', padding: '14px 18px', margin: '12px 0' }
const label = { fontSize: '12px', color: '#777', margin: '8px 0 2px', textTransform: 'uppercase' as const }
const value = { fontSize: '13px', color: '#0d0d0d', margin: '0 0 8px', wordBreak: 'break-all' as const }
const code = { fontSize: '18px', color: '#0d0d0d', fontWeight: 'bold' as const, letterSpacing: '2px', margin: 0, fontFamily: 'monospace' }
const btn = { background: '#0d0d0d', color: '#ffffff', padding: '12px 20px', borderRadius: '8px', textDecoration: 'none', fontSize: '14px', fontWeight: 'bold' as const }
const small = { fontSize: '12px', color: '#777', margin: '0 0 12px' }
const hr = { borderColor: '#eee', margin: '24px 0' }
const footer = { fontSize: '12px', color: '#999', margin: 0 }
