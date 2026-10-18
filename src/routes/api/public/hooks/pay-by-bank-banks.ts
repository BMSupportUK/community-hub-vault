import { createClient } from '@supabase/supabase-js'
import { createFileRoute } from '@tanstack/react-router'
import { htmlToLines, parseSupportedBanks } from '@/lib/pay-by-bank'

const SOURCE_URL = 'https://www.xero.com/uk/pay-by-bank-learn-more/'

// Daily check of the Stripe-powered Pay by Bank UK bank list. Adds new banks
// and removes dropped ones; leaves the list untouched if the page can't be read.
export const Route = createFileRoute('/api/public/hooks/pay-by-bank-banks')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.CRON_SECRET
        const provided = request.headers.get('x-cron-secret')
        if (!expected || !provided || provided !== expected) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }
        const supabaseUrl = process.env.SUPABASE_URL ?? import.meta.env.VITE_SUPABASE_URL
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
        if (!supabaseUrl || !serviceKey) return Response.json({ error: 'Server misconfigured' }, { status: 500 })

        const res = await fetch(SOURCE_URL, { headers: { 'User-Agent': 'Mozilla/5.0 BM Support bank list check' } })
        if (!res.ok) return Response.json({ error: `Source ${res.status}` }, { status: 502 })
        const banks = parseSupportedBanks(htmlToLines(await res.text()))
        if (!banks) return Response.json({ error: 'Bank list not found; kept existing list' }, { status: 502 })

        const db = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
        const now = new Date().toISOString()
        const { error: upErr } = await db.from('pay_by_bank_banks').upsert(banks.map((name) => ({ name, checked_at: now })))
        if (upErr) return Response.json({ error: upErr.message }, { status: 500 })
        const { error: delErr } = await db.from('pay_by_bank_banks').delete().lt('checked_at', now)
        if (delErr) return Response.json({ error: delErr.message }, { status: 500 })
        return Response.json({ ok: true, banks })
      },
    },
  },
})
