import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// POST /api/public/hooks/rota-autofill
// Runs every Monday (and as a daily safety net) via pg_cron. Creates the block
// shifts for the current Monday–Sunday week and the following week so the rota
// never runs empty and Claim buttons are always available.
//
// Idempotent: existing slots for the same date/time/role are counted first and
// only the shortfall is inserted.

const ROLE_QUOTA: Record<string, number> = { admin: 2, management: 1, staff: 3 };
const MIDWEEK = { start: "09:00", end: "19:00", label: "Midweek 09:00–19:00", days: [1, 2, 3, 4, 5] };
const WEEKEND = { start: "10:00", end: "18:00", label: "Weekend 10:00–18:00", days: [0, 6] };
const ROLE_LABEL: Record<string, string> = { admin: "Owner", management: "Management", staff: "Staff" };

function fmt(d: Date) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** Monday of the week containing `d` (UTC). */
function mondayOf(d: Date) {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const shift = (x.getUTCDay() + 6) % 7;
  x.setUTCDate(x.getUTCDate() - shift);
  return x;
}

type Row = {
  shift_date: string;
  start_time: string;
  end_time: string;
  slot_type: "shift" | "hourly";
  required_role: "admin" | "management" | "staff" | "moderator";
  notes: string;
  created_by: null;
};

export const Route = createFileRoute("/api/public/hooks/rota-autofill")({
  server: {
    handlers: {
      POST: async () => {
        const start = mondayOf(new Date());
        const dates: Date[] = [];
        for (let i = 0; i < 14; i++) {
          const d = new Date(start);
          d.setUTCDate(start.getUTCDate() + i);
          dates.push(d);
        }

        // Business hours give the moderator hourly cover slot for each day.
        const { data: bhRows } = await supabaseAdmin
          .from("business_hours")
          .select("day_of_week, open_time, close_time, is_closed");
        const bh = new Map<number, { open: string; close: string; closed: boolean }>();
        for (const r of bhRows ?? []) {
          bh.set(r.day_of_week as number, {
            open: String(r.open_time ?? "09:00").slice(0, 5),
            close: String(r.close_time ?? "19:00").slice(0, 5),
            closed: !!r.is_closed,
          });
        }

        const wanted: Row[] = [];
        for (const d of dates) {
          const dow = d.getUTCDay();
          const preset = MIDWEEK.days.includes(dow) ? MIDWEEK : WEEKEND.days.includes(dow) ? WEEKEND : null;
          if (!preset) continue;
          const date = fmt(d);
          for (const role of ["admin", "management", "staff"] as const) {
            for (let n = 0; n < (ROLE_QUOTA[role] ?? 0); n++) {
              wanted.push({
                shift_date: date,
                start_time: preset.start,
                end_time: preset.end,
                slot_type: "shift",
                required_role: role,
                notes: `${preset.label} — ${ROLE_LABEL[role]}`,
                created_by: null,
              });
            }
          }
          const hours = bh.get(dow);
          if (hours && !hours.closed) {
            wanted.push({
              shift_date: date,
              start_time: hours.open,
              end_time: hours.close,
              slot_type: "hourly",
              required_role: "moderator",
              notes: "Moderator cover",
              created_by: null,
            });
          }
        }

        const { data: existing, error: readErr } = await supabaseAdmin
          .from("shift_slots")
          .select("shift_date, start_time, end_time, required_role")
          .gte("shift_date", fmt(dates[0]!))
          .lte("shift_date", fmt(dates[dates.length - 1]!));
        if (readErr) {
          return new Response(JSON.stringify({ ok: false, error: readErr.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        const have = new Map<string, number>();
        const key = (r: { shift_date: string; start_time: string; end_time: string; required_role: string | null }) =>
          `${r.shift_date}|${String(r.start_time).slice(0, 5)}|${String(r.end_time).slice(0, 5)}|${r.required_role ?? ""}`;
        for (const r of existing ?? []) have.set(key(r as never), (have.get(key(r as never)) ?? 0) + 1);

        const toInsert = wanted.filter((row) => {
          const left = have.get(key(row)) ?? 0;
          if (left > 0) {
            have.set(key(row), left - 1);
            return false;
          }
          return true;
        });

        let added = 0;
        for (const row of toInsert) {
          const { error } = await supabaseAdmin.from("shift_slots").insert(row);
          if (!error) added++;
          else if ((error as { code?: string }).code !== "23505") {
            console.error("rota-autofill insert failed", error.message);
          }
        }

        return new Response(
          JSON.stringify({ ok: true, weekStart: fmt(dates[0]!), considered: wanted.length, added }),
          { headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});
