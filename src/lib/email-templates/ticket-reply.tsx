import React from 'react'
import { Body, Button, Container, Head, Heading, Html, Preview, Text, Section, Hr } from '@react-email/components'
import type { TemplateEntry } from './registry'

const SITE_NAME = 'BM Support'

interface Props {
  displayName?: string
  ticketSubject?: string
  staffName?: string
  ticketsUrl?: string
}

const TicketReplyEmail = ({ displayName, ticketSubject, staffName, ticketsUrl }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{staffName ? `${staffName} replied to your support ticket` : 'A staff member replied to your support ticket'}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>{displayName ? `Hi ${displayName},` : 'Hi,'}</Heading>
        <Text style={text}>
          {staffName ? <><strong>{staffName}</strong> has</> : 'A staff member has'} replied to your support ticket{ticketSubject ? <> — <strong>{ticketSubject}</strong></> : null}.
        </Text>
        <Section style={card}>
          <Text style={text}>
            Please log in to {SITE_NAME} to view the reply and continue the conversation.
          </Text>
        </Section>
        {ticketsUrl ? (
          <Section style={{ textAlign: 'center' as const, margin: '20px 0' }}>
            <Button href={ticketsUrl} style={btn}>View your ticket</Button>
          </Section>
        ) : null}
        <Hr style={hr} />
        <Text style={footer}>{SITE_NAME} · Support</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: TicketReplyEmail,
  subject: (data: Record<string, any>) => {
    const s = (data?.ticketSubject || '').toString().trim()
    return s ? `New reply to your ticket: ${s}` : 'New reply to your support ticket'
  },
  displayName: 'Ticket reply notification',
  previewData: {
    displayName: 'Alex',
    ticketSubject: 'Cannot log in to my app',
    staffName: 'Sam',
    ticketsUrl: 'https://bmsupport.uk/tickets',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px', maxWidth: '560px', margin: '0 auto' }
const h1 = { fontSize: '20px', fontWeight: 'bold' as const, color: '#0d0d0d', margin: '0 0 16px' }
const text = { fontSize: '14px', color: '#444', lineHeight: '1.6', margin: '0 0 12px' }
const card = { background: '#f6f6f8', borderRadius: '8px', padding: '14px 18px', margin: '12px 0' }
const btn = { background: '#0d0d0d', color: '#ffffff', padding: '12px 20px', borderRadius: '8px', textDecoration: 'none', fontSize: '14px', fontWeight: 'bold' as const }
const hr = { borderColor: '#eee', margin: '24px 0' }
const footer = { fontSize: '12px', color: '#999', margin: 0 }