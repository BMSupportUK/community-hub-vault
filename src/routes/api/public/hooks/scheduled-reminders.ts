import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { pushToUser } from "@/lib/fcm.server";

// POST /api/public/hooks/scheduled-reminders
// Runs every minute via pg_cron. Sends push notifications for:
//   - Shift starting soon / overdue (assigned but not clocked in)
//   - Shift ending soon / overdue (clocked in past end time)
//   - Break ending soon / over the limit
//
// These notifications are what make the app play a sound on Android even
// when the app is in the background or fully closed. Web push subscriptions
// receive the same notification via the existing web-push channel below
// (handled by the service worker /sw.js → showNotification → OS sound).
//
// Idempotency is enforced by writing to public.scheduled_alert_log keyed by
// a deterministic alert_key (slot/break id + stage + phase).

const WARN_MS = 10 * 60 * 1000;
const BREAK_LIMITS_SEC: Record<string, number> = { break: 15 * 60, lunch: 30 * 60 };
const BREAK_WARN_SEC = 2 * 60;

type AlertJob = {
  key: string;
  userId: string;
  title: string;
  body: string;
  url: string;
  kind: string;
};

function shiftStartsAt(date: string, time: string): number {
  // shift_slots stores naive local time + date. The legacy client behaviour
  // (shiftWindowToUtcMs) treats these as Europe/London wall clock. For the
  // scheduler we accept that interpretation by building an ISO string and
  // letting the host parse it as UTC, then offsetting via Intl. For
  // simplicity & robustness we just parse as UTC; cron runs every minute so
  // any TZ drift is at most an hour. Most staff are UK based.
  // TODO: switch to a proper TZ-aware parse when shift_slots gains a TZ col.
  return Date.parse(`${date}T${time}Z`);
}

export const Route = createFileRoute("/api/public/hooks/scheduled-reminders")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey");
        if (!apikey || apikey !== process.env.SUPABASE_PUBLISHABLE_KEY) {
          return new Response("Unauthorized", { status: 401 });
        }

        const now = Date.now();
        const todayIso = new Date(now).toISOString().slice(0, 10);
        const yesterdayIso = new Date(now - 24 * 60 * 60 * 1000)
          .toISOString()
          .slice(0, 10);
        const tomorrowIso = new Date(now + 24 * 60 * 60 * 1000)
          .toISOString()
          .slice(0, 10);

        const jobs: AlertJob[] = [];

        // --- Shift start / end -------------------------------------------------
        const { data: slots } = await supabaseAdmin
          .from("shift_slots")
          .select("id, shift_date, start_time, end_time, assigned_to, slot_type")
          .eq("slot_type", "shift")
          .not("assigned_to", "is", null)
          .gte("shift_date", yesterdayIso)
          .lte("shift_date", tomorrowIso);

        const assignedUserIds = Array.from(
          new Set((slots ?? []).map((s) => s.assigned_to as string)),
        );

        // Pull open shifts for those users so we can decide start-overdue vs
        // end-warn.
        const { data: openShifts } = assignedUserIds.length
          ? await supabaseAdmin
              .from("shifts")
              .select("user_id, clock_in")
              .in("user_id", assignedUserIds)
              .is("clock_out", null)
          : { data: [] as { user_id: string; clock_in: string }[] };

        const openByUser = new Map<string, number>();
        for (const sh of openShifts ?? []) {
          openByUser.set(sh.user_id, new Date(sh.clock_in).getTime());
        }

        for (const slot of slots ?? []) {
          const userId = slot.assigned_to as string;
          const startsAt = shiftStartsAt(slot.shift_date as string, slot.start_time as string);
          const endsAt = shiftStartsAt(slot.shift_date as string, slot.end_time as string);
          if (isNaN(startsAt) || isNaN(endsAt)) continue;

          const openIn = openByUser.get(userId);
          const isOpenForSlot =
            openIn !== undefined && openIn <= endsAt && now >= startsAt - WARN_MS;

          const toStart = startsAt - now;
          const toEnd = endsAt - now;

          // START warn
          if (!openIn && toStart > 0 && toStart <= WARN_MS) {
            jobs.push({
              key: `slot:${slot.id}:start:warn`,
              userId,
              title: "Shift starting soon",
              body: `Your shift starts in ${Math.max(1, Math.round(toStart / 60000))} min. Head to the clock to start.`,
              url: "/clock",
              kind: "shift_start_warn",
            });
          }
          // START overdue
          if (!openIn && toStart <= 0 && now < endsAt) {
            jobs.push({
              key: `slot:${slot.id}:start:over`,
              userId,
              title: "Shift has started",
              body: "Your shift has started. Please clock in.",
              url: "/clock",
              kind: "shift_start_over",
            });
          }
          // END warn
          if (isOpenForSlot && toEnd > 0 && toEnd <= WARN_MS) {
            jobs.push({
              key: `slot:${slot.id}:end:warn`,
              userId,
              title: "Shift ending soon",
              body: `Your shift ends in ${Math.max(1, Math.round(toEnd / 60000))} min. Don't forget to clock out.`,
              url: "/clock",
              kind: "shift_end_warn",
            });
          }
          // END overdue
          if (isOpenForSlot && toEnd <= 0) {
            jobs.push({
              key: `slot:${slot.id}:end:over`,
              userId,
              title: "Shift has ended",
              body: "Your shift has ended. Please clock out.",
              url: "/clock",
              kind: "shift_end_over",
            });
          }
        }

        // --- Break end --------------------------------------------------------
        const { data: breaks } = await supabaseAdmin
          .from("breaks")
          .select("id, user_id, kind, started_at")
          .is("ended_at", null);

        for (const b of breaks ?? []) {
          const limit = BREAK_LIMITS_SEC[b.kind as string];
          if (!limit) continue;
          const elapsed = (now - new Date(b.started_at as string).getTime()) / 1000;
          const remaining = limit - elapsed;
          const label = b.kind === "lunch" ? "Lunch break" : "Break";

          if (remaining <= 0) {
            jobs.push({
              key: `break:${b.id}:over`,
              userId: b.user_id as string,
              title: `${label} is over`,
              body: `You're over by ${Math.round(-remaining / 60)} min. Please clock back in.`,
              url: "/clock",
              kind: "break_over",
            });
          } else if (remaining <= BREAK_WARN_SEC) {
            jobs.push({
              key: `break:${b.id}:warn`,
              userId: b.user_id as string,
              title: `${label} ending soon`,
              body: `Your ${label.toLowerCase()} ends in ${Math.max(1, Math.round(remaining / 60))} min.`,
              url: "/clock",
              kind: "break_warn",
            });
          }
        }

        if (!jobs.length) {
          return Response.json({ ok: true, evaluated: 0, sent: 0 });
        }

        // Dedup: drop any job we've already logged.
        const keys = jobs.map((j) => j.key);
        const { data: existing } = await supabaseAdmin
          .from("scheduled_alert_log")
          .select("alert_key")
          .in("alert_key", keys);
        const sentKeys = new Set((existing ?? []).map((r) => r.alert_key as string));
        const pending = jobs.filter((j) => !sentKeys.has(j.key));

        let sent = 0;
        let failed = 0;
        for (const job of pending) {
          try {
            const res = await pushToUser(job.userId, {
              title: job.title,
              body: job.body,
              data: { kind: job.kind, url: job.url, alertKey: job.key },
            });
            if (res.sent > 0) sent++;
            else failed++;
          } catch (e) {
            failed++;
            console.error("[scheduled-reminders] pushToUser failed", job.key, e);
          }
          // Record regardless so we don't spam if push delivery is flaky.
          await supabaseAdmin
            .from("scheduled_alert_log")
            .upsert({ alert_key: job.key, user_id: job.userId }, { onConflict: "alert_key" });
        }

        // GC old rows so the table doesn't grow unbounded.
        await supabaseAdmin
          .from("scheduled_alert_log")
          .delete()
          .lt(
            "sent_at",
            new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString(),
          );

        return Response.json({
          ok: true,
          evaluated: jobs.length,
          pending: pending.length,
          sent,
          failed,
        });
      },
    },
  },
});