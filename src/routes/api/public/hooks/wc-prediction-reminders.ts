import { createClient } from '@supabase/supabase-js'
import { createFileRoute } from '@tanstack/react-router'
import { TEMPLATES } from '@/lib/email-templates/registry'
import { sendAndLogEmail } from '@/lib/email-templates/send-and-log'
import { canEmailList, EMAIL_LIST_COMPETITIONS } from '@/lib/email-lists'

const PREDICTIONS_URL = 'https://bmsupport.uk/predictions'
const TEMPLATE_NAME = 'wc-prediction-reminder'

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

            const props = {
              displayName: r.display_name ?? undefined,
              missingCount: r.missing_count,
              nextKickoffAt: fmtKickoff(r.next_kickoff_at),
              predictionsUrl: PREDICTIONS_URL,
            }
            const idempotencyKey = `wc-prediction-reminder-${r.entrant_kind}-${r.entrant_id}-${sentDate}`

            const result = await sendAndLogEmail(supabase, TEMPLATE_NAME, recipient, {
              templateData: props,
              idempotencyKey,
            })
            if (result.sent) stats.sent++
            else stats.skipped++
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