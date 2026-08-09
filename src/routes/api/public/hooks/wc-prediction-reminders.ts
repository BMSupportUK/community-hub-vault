import * as React from 'react'
import { render } from '@react-email/render'
import { createClient } from '@supabase/supabase-js'
import { createFileRoute } from '@tanstack/react-router'
import { TEMPLATES } from '@/lib/email-templates/registry'
import { canEmailList, EMAIL_LIST_COMPETITIONS } from '@/lib/email-lists'

const SITE_NAME = 'community-hub-vault'
const SENDER_DOMAIN = 'notify.bmsupport.uk'
const FROM_DOMAIN = 'bmsupport.uk'
const PREDICTIONS_URL = 'https://bmsupport.uk/predictions'
const TEMPLATE_NAME = 'wc-prediction-reminder'

function generateToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')
}

function fmtKickoff(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-GB', {
      weekday: 'short', day: 'numeric', month: 'short',
      hour: '2-digit', minute: '2-digit',
      timeZone: 'Europe/London', timeZoneName: 'short',
    })
  } catch { return iso }
}

function londonHour(d: Date): number {
  const h = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit', hour12: false, timeZone: 'Europe/London',
  }).format(d)
  return parseInt(h, 10)
}

function londonDateStr(d: Date): string {
  // YYYY-MM-DD in Europe/London
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Europe/London',
  }).format(d)
  return parts
}

async function ensureUnsubscribeToken(supabase: any, email: string): Promise<string | null> {
  const normalized = email.toLowerCase()
  const { data: existing } = await supabase
    .from('email_unsubscribe_tokens')
    .select('token, used_at')
    .eq('email', normalized)
    .maybeSingle()
  if (existing && !existing.used_at) return existing.token as string
  if (existing && existing.used_at) return null
  const token = generateToken()
  await supabase
    .from('email_unsubscribe_tokens')
    .upsert({ token, email: normalized }, { onConflict: 'email', ignoreDuplicates: true })
  const { data: stored } = await supabase
    .from('email_unsubscribe_tokens')
    .select('token')
    .eq('email', normalized)
    .maybeSingle()
  return stored?.token ?? null
}

type Recipient = {
  entrant_kind: 'user' | 'guest'
  entrant_id: string
  recipient_email: string
  display_name: string | null
  missing_count: number
  next_kickoff_at: string
}

export const Route = createFileRoute('/api/public/hooks/wc-prediction-reminders')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
        if (!supabaseUrl || !serviceKey) {
          return Response.json({ error: 'Server misconfigured' }, { status: 500 })
        }
        const expected = process.env.CRON_SECRET
        const provided = request.headers.get('x-cron-secret')
        if (!expected || !provided || provided !== expected) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }

        // Allow ?force=1 to bypass the noon-London gate (manual testing).
        const url = new URL(request.url)
        const force = url.searchParams.get('force') === '1'
        const now = new Date()
        if (!force && londonHour(now) !== 12) {
          return Response.json({ skipped: true, reason: 'not noon in Europe/London', londonHour: londonHour(now) })
        }

        const supabase = createClient(supabaseUrl, serviceKey, {
          auth: { autoRefreshToken: false, persistSession: false },
        })

        const sentDate = londonDateStr(now)
        const stats = { candidates: 0, sent: 0, skipped: 0, failed: 0 }

        const { data: rows, error } = await supabase.rpc('get_wc_reminder_recipients')
        if (error) {
          console.error('get_wc_reminder_recipients failed', error)
          return Response.json({ error: error.message }, { status: 500 })
        }
        const recipients = (rows ?? []) as Recipient[]
        stats.candidates = recipients.length

        const template = TEMPLATES[TEMPLATE_NAME]
        if (!template) {
          return Response.json({ error: 'Template missing' }, { status: 500 })
        }

        for (const r of recipients) {
          try {
            const recipient = r.recipient_email
            if (!recipient) { stats.skipped++; continue }

            // Competitions list check (separate from BM Support mailings)
            const allowed = await canEmailList(supabase, recipient, EMAIL_LIST_COMPETITIONS)
            if (!allowed) { stats.skipped++; continue }

            // Dedupe — one reminder per entrant per UK day
            const { error: claimErr } = await supabase
              .from('wc_prediction_reminders')
              .insert({
                entrant_kind: r.entrant_kind,
                entrant_id: r.entrant_id,
                sent_date: sentDate,
                recipient_email: recipient,
              })
            if (claimErr) { stats.skipped++; continue }

            const unsubscribeToken = await ensureUnsubscribeToken(supabase, recipient)
            if (!unsubscribeToken) { stats.skipped++; continue }

            const props = {
              displayName: r.display_name ?? undefined,
              missingCount: r.missing_count,
              nextKickoffAt: fmtKickoff(r.next_kickoff_at),
              predictionsUrl: PREDICTIONS_URL,
            }
            const element = React.createElement(template.component, props)
            const html = await render(element)
            const text = await render(element, { plainText: true })
            const subject = typeof template.subject === 'function' ? template.subject(props) : template.subject
            const messageId = crypto.randomUUID()
            const idempotencyKey = `wc-prediction-reminder-${r.entrant_kind}-${r.entrant_id}-${sentDate}`

            await supabase.from('email_send_log').insert({
              message_id: messageId, template_name: TEMPLATE_NAME, recipient_email: recipient, status: 'pending',
            })

            const { error: enqueueErr } = await supabase.rpc('enqueue_email', {
              queue_name: 'transactional_emails',
              payload: {
                message_id: messageId,
                to: recipient,
                from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
                sender_domain: SENDER_DOMAIN,
                subject,
                html,
                text,
                purpose: 'transactional',
                label: TEMPLATE_NAME,
                idempotency_key: idempotencyKey,
                unsubscribe_token: unsubscribeToken,
                queued_at: new Date().toISOString(),
              },
            })
            if (enqueueErr) {
              await supabase.from('email_send_log').insert({
                message_id: messageId, template_name: TEMPLATE_NAME, recipient_email: recipient,
                status: 'failed', error_message: 'Failed to enqueue email',
              })
              stats.failed++
            } else {
              stats.sent++
            }
          } catch (e) {
            console.error('wc reminder send failed', e)
            stats.failed++
          }
        }

        return Response.json({ success: true, londonDate: sentDate, ...stats })
      },
    },
  },
})