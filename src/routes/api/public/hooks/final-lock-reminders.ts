import { createClient } from '@supabase/supabase-js'
import { createFileRoute } from '@tanstack/react-router'
import { TEMPLATES } from '@/lib/email-templates/registry'
import { sendAndLogEmail } from '@/lib/email-templates/send-and-log'
import { canEmailList, EMAIL_LIST_COMPETITIONS } from '@/lib/email-lists'

const PREDICTIONS_URL = 'https://bmsupport.uk/boro-predictions'
const FANTASY_URL = 'https://bmsupport.uk/boro-fantasy'
const PRED_TEMPLATE = 'boro-prediction-final-reminder'
const FANTASY_TEMPLATE = 'fantasy-squad-final-reminder'

function fmt(iso: string | null): string | undefined {
  if (!iso) return undefined
  try {
    return new Date(iso).toLocaleString('en-GB', {
      weekday: 'short', day: 'numeric', month: 'short',
      hour: '2-digit', minute: '2-digit',
      timeZone: 'Europe/London', timeZoneName: 'short',
    })
  } catch { return iso }
}

type PredRecipient = {
  entrant_kind: 'user' | 'guest'
  entrant_id: string
  recipient_email: string
  display_name: string | null
  fixture_id: string
  fixture_label: string | null
  kickoff_at: string
  lock_at: string
}

type FantasyRecipient = {
  entrant_kind: 'user' | 'guest'
  entrant_id: string
  recipient_email: string
  display_name: string | null
  gameweek_id: string
  gw_number: number | null
  fixture_label: string | null
  kickoff_at: string
  lock_at: string
}

/** Nothing to remind about if a prediction landed since the query ran. */
async function stillMissingPrediction(supabase: any, r: PredRecipient): Promise<boolean> {
  const col = r.entrant_kind === 'guest' ? 'guest_id' : 'user_id'
  const { data } = await supabase
    .from('boro_predictions')
    .select('id')
    .eq('fixture_id', r.fixture_id)
    .eq(col, r.entrant_id)
    .maybeSingle()
  return !data
}

/** Nothing to remind about if a squad with picks landed since the query ran. */
async function stillMissingSquad(supabase: any, r: FantasyRecipient): Promise<boolean> {
  const col = r.entrant_kind === 'guest' ? 'guest_id' : 'user_id'
  const { data } = await supabase
    .from('fantasy_squads')
    .select('id')
    .eq('gameweek_id', r.gameweek_id)
    .eq(col, r.entrant_id)
    .maybeSingle()
  if (!data) return true
  const { count } = await supabase
    .from('fantasy_squad_picks')
    .select('id', { count: 'exact', head: true })
    .eq('squad_id', data.id)
  return (count ?? 0) === 0
}

export const Route = createFileRoute('/api/public/hooks/final-lock-reminders')({
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

        // Runs hourly. Both recipient queries only return entrants whose entry
        // deadline (kick-off minus 30 minutes) is 1-2 hours away, so the email is
        // the final warning while there is still plenty of time to enter. The
        // tracking tables key on the fixture/gameweek, so nobody gets it twice.
        const stats = {
          predictions: { candidates: 0, sent: 0, skipped: 0, failed: 0 },
          fantasy: { candidates: 0, sent: 0, skipped: 0, failed: 0 },
        }

        if (!TEMPLATES[PRED_TEMPLATE] || !TEMPLATES[FANTASY_TEMPLATE]) {
          return Response.json({ error: 'Template missing' }, { status: 500 })
        }

        // ---- MFC score predictions ----
        const { data: predRows, error: predErr } = await supabase.rpc('get_boro_final_reminder_recipients')
        if (predErr) console.error('get_boro_final_reminder_recipients failed', predErr)
        const predRecipients = (predRows ?? []) as PredRecipient[]
        stats.predictions.candidates = predRecipients.length

        for (const r of predRecipients) {
          try {
            const recipient = r.recipient_email
            if (!recipient) { stats.predictions.skipped++; continue }

            const allowed = await canEmailList(supabase, recipient, EMAIL_LIST_COMPETITIONS)
            if (!allowed) { stats.predictions.skipped++; continue }

            if (!(await stillMissingPrediction(supabase, r))) { stats.predictions.skipped++; continue }

            const { error: claimErr } = await supabase
              .from('boro_prediction_final_reminders')
              .insert({
                entrant_kind: r.entrant_kind,
                entrant_id: r.entrant_id,
                fixture_id: r.fixture_id,
                recipient_email: recipient,
              })
            if (claimErr) { stats.predictions.skipped++; continue }

            const result = await sendAndLogEmail(supabase, PRED_TEMPLATE, recipient, {
              templateData: {
                displayName: r.display_name ?? undefined,
                fixtureLabel: r.fixture_label ?? undefined,
                kickoffAt: fmt(r.kickoff_at),
                lockAt: fmt(r.lock_at),
                predictionsUrl: PREDICTIONS_URL,
              },
              idempotencyKey: `boro-prediction-final-${r.entrant_kind}-${r.entrant_id}-${r.fixture_id}`,
            })
            if (result.sent) stats.predictions.sent++
            else stats.predictions.skipped++
          } catch (e) {
            console.error('boro final reminder send failed', e)
            stats.predictions.failed++
          }
        }

        // ---- MFC Fantasy Manager ----
        const { data: fanRows, error: fanErr } = await supabase.rpc('get_fantasy_final_reminder_recipients')
        if (fanErr) console.error('get_fantasy_final_reminder_recipients failed', fanErr)
        const fanRecipients = (fanRows ?? []) as FantasyRecipient[]
        stats.fantasy.candidates = fanRecipients.length

        for (const r of fanRecipients) {
          try {
            const recipient = r.recipient_email
            if (!recipient) { stats.fantasy.skipped++; continue }

            const allowed = await canEmailList(supabase, recipient, EMAIL_LIST_COMPETITIONS)
            if (!allowed) { stats.fantasy.skipped++; continue }

            if (!(await stillMissingSquad(supabase, r))) { stats.fantasy.skipped++; continue }

            const { error: claimErr } = await supabase
              .from('fantasy_squad_final_reminders')
              .insert({
                entrant_kind: r.entrant_kind,
                entrant_id: r.entrant_id,
                gameweek_id: r.gameweek_id,
                recipient_email: recipient,
              })
            if (claimErr) { stats.fantasy.skipped++; continue }

            const result = await sendAndLogEmail(supabase, FANTASY_TEMPLATE, recipient, {
              templateData: {
                displayName: r.display_name ?? undefined,
                gwNumber: r.gw_number ?? undefined,
                fixtureLabel: r.fixture_label ?? undefined,
                kickoffAt: fmt(r.kickoff_at),
                lockAt: fmt(r.lock_at),
                fantasyUrl: FANTASY_URL,
              },
              idempotencyKey: `fantasy-squad-final-${r.entrant_kind}-${r.entrant_id}-${r.gameweek_id}`,
            })
            if (result.sent) stats.fantasy.sent++
            else stats.fantasy.skipped++
          } catch (e) {
            console.error('fantasy final reminder send failed', e)
            stats.fantasy.failed++
          }
        }

        return Response.json({ success: true, ...stats })
      },
    },
  },
})
