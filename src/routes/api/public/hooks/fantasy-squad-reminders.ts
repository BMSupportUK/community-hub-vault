import { createClient } from '@supabase/supabase-js'
import { createFileRoute } from '@tanstack/react-router'
import { TEMPLATES } from '@/lib/email-templates/registry'
import { sendAndLogEmail } from '@/lib/email-templates/send-and-log'
import { canEmailList, EMAIL_LIST_COMPETITIONS } from '@/lib/email-lists'

const FANTASY_URL = 'https://bmsupport.uk/boro-fantasy'
const TEMPLATE_NAME = 'fantasy-squad-reminder'

function fmtKickoff(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-GB', {
      weekday: 'short', day: 'numeric', month: 'short',
      hour: '2-digit', minute: '2-digit',
      timeZone: 'Europe/London', timeZoneName: 'short',
    })
  } catch { return iso }
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
  gameweek_id: string | null
  gw_number: number | null
  fixture_label: string | null
}

/**
 * Final safety net: the reminder must never claim "no squad" for an entrant who
 * saved one between the recipient query and this send. Re-checks the squad (and
 * that it actually has picks) immediately before enqueueing.
 */
async function stillMissingSquad(supabase: any, r: Recipient): Promise<boolean> {
  if (!r.gameweek_id) return true
  const col = r.entrant_kind === 'guest' ? 'guest_id' : 'user_id'
  const { data, error } = await supabase
    .from('fantasy_squads')
    .select('id')
    .eq('gameweek_id', r.gameweek_id)
    .eq(col, r.entrant_id)
    .maybeSingle()
  if (error || !data) return true
  const { count } = await supabase
    .from('fantasy_squad_picks')
    .select('id', { count: 'exact', head: true })
    .eq('squad_id', data.id)
  return (count ?? 0) === 0
}

export const Route = createFileRoute('/api/public/hooks/fantasy-squad-reminders')({
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

        // Runs hourly. The recipient query only returns entrants whose next
        // fixture kicks off in roughly 24 hours, so the email lands a day ahead.
        const now = new Date()

        const supabase = createClient(supabaseUrl, serviceKey, {
          auth: { autoRefreshToken: false, persistSession: false },
        })

        const sentDate = londonDateStr(now)
        const stats = { candidates: 0, sent: 0, skipped: 0, failed: 0 }

        const { data: rows, error } = await supabase.rpc('get_fantasy_reminder_recipients')
        if (error) {
          console.error('get_fantasy_reminder_recipients failed', error)
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

            // Squad saved since the query ran? Then there's nothing to remind about.
            if (!(await stillMissingSquad(supabase, r))) { stats.skipped++; continue }

            // Dedupe — one reminder per entrant per UK day
            const { error: claimErr } = await supabase
              .from('fantasy_squad_reminders')
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
              gwNumber: r.gw_number ?? undefined,
              fixtureLabel: r.fixture_label ?? undefined,
              fantasyUrl: FANTASY_URL,
            }
            const idempotencyKey = `fantasy-squad-reminder-${r.entrant_kind}-${r.entrant_id}-${sentDate}`

            const result = await sendAndLogEmail(supabase, TEMPLATE_NAME, recipient, {
              templateData: props,
              idempotencyKey,
            })
            if (result.sent) stats.sent++
            else stats.skipped++
          } catch (e) {
            console.error('fantasy squad reminder send failed', e)
            stats.failed++
          }
        }

        return Response.json({ success: true, londonDate: sentDate, ...stats })
      },
    },
  },
})