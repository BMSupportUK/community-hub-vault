import { createClient } from '@supabase/supabase-js'
import { createFileRoute } from '@tanstack/react-router'
import { TEMPLATES } from '@/lib/email-templates/registry'
import { sendAndLogEmail } from '@/lib/email-templates/send-and-log'
import { canEmailList, EMAIL_LIST_COMPETITIONS } from '@/lib/email-lists'

const PREDICTIONS_URL = 'https://bmsupport.uk/boro-predictions'
const TEMPLATE_NAME = 'boro-predictor-invite'
const EXCLUDED_NAMES = ['rodders', 'tvzone']

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
            const allowed = await canEmailList(supabase, r.email, EMAIL_LIST_COMPETITIONS)
            if (!allowed) { stats.skipped++; continue }

            const props = {
              displayName: r.displayName ?? undefined,
              predictionsUrl: PREDICTIONS_URL,
            }

            const result = await sendAndLogEmail(supabase, TEMPLATE_NAME, r.email, {
              templateData: props,
              idempotencyKey: `boro-predictor-invite-${r.key}`,
            })
            if (result.sent) stats.sent++
            else stats.skipped++
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