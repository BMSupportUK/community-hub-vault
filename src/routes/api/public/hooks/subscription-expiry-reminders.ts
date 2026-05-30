import * as React from 'react'
import { render } from '@react-email/render'
import { createClient } from '@supabase/supabase-js'
import { createFileRoute } from '@tanstack/react-router'
import { TEMPLATES } from '@/lib/email-templates/registry'

const SITE_NAME = 'community-hub-vault'
const SENDER_DOMAIN = 'notify.bmsupport.uk'
const FROM_DOMAIN = 'bmsupport.uk'
const PROFILE_URL = 'https://bmsupport.uk/profile'
const TEMPLATE_NAME = 'subscription-expiry-reminder'

type Kind = '7d' | '24h'

function generateToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-GB', {
      weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London', timeZoneName: 'short',
    })
  } catch { return iso }
}

async function ensureUnsubscribeToken(supabase: any, email: string): Promise<string | null> {
  const normalized = email.toLowerCase()
  const { data: existing } = await supabase
    .from('email_unsubscribe_tokens')
    .select('token, used_at')
    .eq('email', normalized)
    .maybeSingle()
  if (existing && !existing.used_at) return existing.token as string
  if (existing && existing.used_at) return null // suppressed/used
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

async function processKind(supabase: any, kind: Kind): Promise<{ sent: number; skipped: number; failed: number }> {
  const stats = { sent: 0, skipped: 0, failed: 0 }
  const { data: rows, error } = await supabase.rpc('get_pending_expiry_reminders', { _kind: kind })
  if (error) {
    console.error('get_pending_expiry_reminders failed', { kind, error })
    return stats
  }
  const template = TEMPLATES[TEMPLATE_NAME]
  if (!template) {
    console.error('Template missing in registry', { TEMPLATE_NAME })
    return stats
  }
  for (const row of (rows ?? []) as Array<{
    credential_id: string; owner_id: string; app_login_name: string; expiry_at: string; recipient_email: string;
  }>) {
    try {
      const recipient = row.recipient_email
      // Suppression check
      const { data: suppressed } = await supabase
        .from('suppressed_emails').select('id').eq('email', recipient.toLowerCase()).maybeSingle()
      if (suppressed) {
        // Record so we don't keep retrying this credential/expiry
        await supabase.from('subscription_expiry_reminders').insert({
          credential_id: row.credential_id, kind, expiry_at: row.expiry_at, recipient_email: recipient,
        })
        stats.skipped++
        continue
      }
      const unsubscribeToken = await ensureUnsubscribeToken(supabase, recipient)
      if (!unsubscribeToken) { stats.skipped++; continue }

      const daysRemaining = kind === '24h' ? 1 : 7
      const props = {
        appLoginName: row.app_login_name,
        expiresAt: fmtDate(row.expiry_at),
        daysRemaining,
        profileUrl: PROFILE_URL,
      }
      const element = React.createElement(template.component, props)
      const html = await render(element)
      const text = await render(element, { plainText: true })
      const subject = typeof template.subject === 'function' ? template.subject(props) : template.subject
      const messageId = crypto.randomUUID()
      const idempotencyKey = `subscription-expiry-${kind}-${row.credential_id}-${new Date(row.expiry_at).getTime()}`

      // Try to claim this reminder slot first (unique constraint prevents dupes)
      const { error: claimErr } = await supabase.from('subscription_expiry_reminders').insert({
        credential_id: row.credential_id, kind, expiry_at: row.expiry_at, recipient_email: recipient,
      })
      if (claimErr) { stats.skipped++; continue }

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
      console.error('reminder send failed', e)
      stats.failed++
    }
  }
  return stats
}

export const Route = createFileRoute('/api/public/hooks/subscription-expiry-reminders')({
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
        const supabase = createClient(supabaseUrl, serviceKey, {
          auth: { autoRefreshToken: false, persistSession: false },
        })
        const seven = await processKind(supabase, '7d')
        const day = await processKind(supabase, '24h')
        return Response.json({ success: true, '7d': seven, '24h': day })
      },
    },
  },
})
