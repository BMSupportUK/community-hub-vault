import * as React from 'react'
import { render } from '@react-email/render'
import { createClient } from '@supabase/supabase-js'
import { createFileRoute } from '@tanstack/react-router'
import { TEMPLATES } from '@/lib/email-templates/registry'

const SITE_NAME = 'BM Support'
const SENDER_DOMAIN = 'notify.bmsupport.uk'
const FROM_DOMAIN = 'bmsupport.uk'
const PREDICTIONS_URL = 'https://bmsupport.uk/boro-predictions'
const TEMPLATE_NAME = 'boro-predictor-invite'
const EXCLUDED_NAMES = ['rodders', 'tvzone']

function generateToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')
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

export const Route = createFileRoute('/api/public/hooks/boro-predictor-invite')({
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

        const url = new URL(request.url)
        const dryRun = url.searchParams.get('dryRun') === '1'

        const supabase = createClient(supabaseUrl, serviceKey, {
          auth: { autoRefreshToken: false, persistSession: false },
        })

        // Already in the Boro competition (registered users + guests)
        const [{ data: boroUsers }, { data: boroGuests }] = await Promise.all([
          supabase.from('boro_entrants').select('user_id'),
          supabase.from('boro_guest_entrants').select('email'),
        ])
        const joinedUserIds = new Set((boroUsers ?? []).map((r: any) => r.user_id))
        const joinedEmails = new Set(
          (boroGuests ?? []).map((r: any) => String(r.email).toLowerCase()),
        )

        type Target = { email: string; displayName: string | null; key: string }
        const targets: Target[] = []

        // Registered World Cup entrants
        const { data: wcUsers } = await supabase.from('wc_entrants').select('user_id')
        for (const row of (wcUsers ?? []) as any[]) {
          if (joinedUserIds.has(row.user_id)) continue
          const { data: prof } = await supabase
            .from('profiles')
            .select('display_name, username')
            .eq('id', row.user_id)
            .maybeSingle()
          const name = (prof as any)?.display_name || (prof as any)?.username || null
          if (name && EXCLUDED_NAMES.includes(String(name).toLowerCase())) continue
          const { data: u } = await supabase.auth.admin.getUserById(row.user_id)
          const email = u?.user?.email
          if (!email) continue
          if (joinedEmails.has(email.toLowerCase())) continue
          targets.push({ email, displayName: name, key: `user-${row.user_id}` })
        }

        // Guest World Cup entrants
        const { data: wcGuests } = await supabase
          .from('wc_guest_entrants')
          .select('id, email, display_name')
        for (const row of (wcGuests ?? []) as any[]) {
          const email = String(row.email ?? '')
          if (!email) continue
          if (joinedEmails.has(email.toLowerCase())) continue
          const name = row.display_name ?? null
          if (name && EXCLUDED_NAMES.includes(String(name).toLowerCase())) continue
          targets.push({ email, displayName: name, key: `guest-${row.id}` })
        }

        // Dedupe by email
        const seen = new Set<string>()
        const recipients = targets.filter((t) => {
          const k = t.email.toLowerCase()
          if (seen.has(k)) return false
          seen.add(k)
          return true
        })

        if (dryRun) {
          return Response.json({
            dryRun: true,
            count: recipients.length,
            recipients: recipients.map((r) => ({ email: r.email, name: r.displayName })),
          })
        }

        const template = TEMPLATES[TEMPLATE_NAME]
        if (!template) return Response.json({ error: 'Template missing' }, { status: 500 })

        const stats = { candidates: recipients.length, sent: 0, skipped: 0, failed: 0 }

        for (const r of recipients) {
          try {
            const { data: suppressed } = await supabase
              .from('suppressed_emails')
              .select('id')
              .eq('email', r.email.toLowerCase())
              .maybeSingle()
            if (suppressed) { stats.skipped++; continue }

            const unsubscribeToken = await ensureUnsubscribeToken(supabase, r.email)
            if (!unsubscribeToken) { stats.skipped++; continue }

            const props = {
              displayName: r.displayName ?? undefined,
              predictionsUrl: PREDICTIONS_URL,
            }
            const element = React.createElement(template.component, props)
            const html = await render(element)
            const text = await render(element, { plainText: true })
            const subject =
              typeof template.subject === 'function' ? template.subject(props) : template.subject
            const messageId = crypto.randomUUID()

            await supabase.from('email_send_log').insert({
              message_id: messageId,
              template_name: TEMPLATE_NAME,
              recipient_email: r.email,
              status: 'pending',
            })

            const { error: enqueueErr } = await supabase.rpc('enqueue_email', {
              queue_name: 'transactional_emails',
              payload: {
                message_id: messageId,
                to: r.email,
                from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
                sender_domain: SENDER_DOMAIN,
                subject,
                html,
                text,
                purpose: 'transactional',
                label: TEMPLATE_NAME,
                idempotency_key: `boro-predictor-invite-${r.key}`,
                unsubscribe_token: unsubscribeToken,
                queued_at: new Date().toISOString(),
              },
            })
            if (enqueueErr) {
              await supabase.from('email_send_log').insert({
                message_id: messageId,
                template_name: TEMPLATE_NAME,
                recipient_email: r.email,
                status: 'failed',
                error_message: 'Failed to enqueue email',
              })
              stats.failed++
            } else {
              stats.sent++
            }
          } catch (e) {
            console.error('boro invite send failed', e)
            stats.failed++
          }
        }

        return Response.json({ success: true, ...stats })
      },
    },
  },
})