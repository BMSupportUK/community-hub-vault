import { createClient } from '@supabase/supabase-js'
import { createFileRoute } from '@tanstack/react-router'
import { TEMPLATES } from '@/lib/email-templates/registry'
import { sendAndLogEmail } from '@/lib/email-templates/send-and-log'
import { canEmailList, EMAIL_LIST_SUPPORT } from '@/lib/email-lists'

const PROFILE_URL = 'https://bmsupport.uk/profile'
const TEMPLATE_NAME = 'subscription-expiry-reminder'

type Kind = '7d' | '24h'

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-GB', {
      weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London', timeZoneName: 'short',
    })
  } catch { return iso }
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
      // BM Support list check — never sends to competition-only guest addresses
      const allowed = await canEmailList(supabase, recipient, EMAIL_LIST_SUPPORT)
      if (!allowed) {
        // Record so we don't keep retrying this credential/expiry
        await supabase.from('subscription_expiry_reminders').insert({
          credential_id: row.credential_id, kind, expiry_at: row.expiry_at, recipient_email: recipient,
        })
        stats.skipped++
        continue
      }
      const daysRemaining = kind === '24h' ? 1 : 7
      const props = {
        appLoginName: row.app_login_name,
        expiresAt: fmtDate(row.expiry_at),
        daysRemaining,
        profileUrl: PROFILE_URL,
      }
      const idempotencyKey = `subscription-expiry-${kind}-${row.credential_id}-${new Date(row.expiry_at).getTime()}`

      // Try to claim this reminder slot first (unique constraint prevents dupes)
      const { error: claimErr } = await supabase.from('subscription_expiry_reminders').insert({
        credential_id: row.credential_id, kind, expiry_at: row.expiry_at, recipient_email: recipient,
      })
      if (claimErr) { stats.skipped++; continue }

      const result = await sendAndLogEmail(supabase, TEMPLATE_NAME, recipient, {
        templateData: props,
        idempotencyKey,
      })
      if (result.sent) stats.sent++
      else stats.skipped++
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
