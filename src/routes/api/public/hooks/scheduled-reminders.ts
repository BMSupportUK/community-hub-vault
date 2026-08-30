import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { pushToUser } from "@/lib/fcm.server";
import { broadcastToUser } from "@/lib/push.functions";


// POST /api/public/hooks/scheduled-reminders
// Runs every minute via pg_cron. Sends push notifications for:
//   - Shift starting soon / overdue (assigned but not clocked in)
//   - Shift ending soon / overdue (clocked in past end time)
//   - Break ending soon / over the limit
//
// Both FCM (Android app) and Web Push (browser/PWA) are used so the alert
// reaches the user when the app is in the background or fully closed.
// Web Push subscriptions are handled by the service worker at /sw.js.
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
        const expected = process.env.CRON_SECRET;
        const provided = request.headers.get("x-cron-secret");
        if (!expected || !provided || provided !== expected) {
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

        // Pull recent shifts (open OR closed) for those users so we can tell
        // whether someone has already worked the slot. Without this, a user
        // who has clocked out keeps receiving "Shift has started" pings until
        // the slot's end time, because the open-only query returned nothing.
        const sinceIso = new Date(now - 36 * 60 * 60 * 1000).toISOString();
        const { data: recentShifts } = assignedUserIds.length
          ? await supabaseAdmin
              .from("shifts")
              .select("user_id, clock_in, clock_out")
              .in("user_id", assignedUserIds)
              .gte("clock_in", sinceIso)
          : { data: [] as { user_id: string; clock_in: string; clock_out: string | null }[] };

        type ShiftRow = { clockIn: number; clockOut: number | null };
        const shiftsByUser = new Map<string, ShiftRow[]>();
        for (const sh of recentShifts ?? []) {
          const row: ShiftRow = {
            clockIn: new Date(sh.clock_in).getTime(),
            clockOut: sh.clock_out ? new Date(sh.clock_out).getTime() : null,
          };
          const arr = shiftsByUser.get(sh.user_id) ?? [];
          arr.push(row);
          shiftsByUser.set(sh.user_id, arr);
        }

        // Slots whose start time has passed with nobody clocked in — these get
        // auto clocked in below.
        const autoClockIns: { slotId: string; userId: string; startsAt: number; endsAt: number }[] = [];

        for (const slot of slots ?? []) {
          const userId = slot.assigned_to as string;
          const startsAt = shiftStartsAt(slot.shift_date as string, slot.start_time as string);
          const endsAt = shiftStartsAt(slot.shift_date as string, slot.end_time as string);
          if (isNaN(startsAt) || isNaN(endsAt)) continue;

          const userShifts = shiftsByUser.get(userId) ?? [];
          // A shift "covers" this slot if it was clocked in before the slot's
          // end time AND (still open OR clocked out after the slot started).
          const coveringShift = userShifts.find(
            (s) =>
              s.clockIn <= endsAt &&
              (s.clockOut === null || s.clockOut >= startsAt),
          );
          const openShift = coveringShift && coveringShift.clockOut === null ? coveringShift : null;
          const alreadyWorked = !!coveringShift && coveringShift.clockOut !== null;
          const isOpenForSlot =
            !!openShift && openShift.clockIn <= endsAt && now >= startsAt - WARN_MS;

          const toStart = startsAt - now;
          const toEnd = endsAt - now;

          // START warn
          if (!openShift && !alreadyWorked && toStart > 0 && toStart <= WARN_MS) {
            jobs.push({
              key: `slot:${slot.id}:start:warn`,
              userId,
              title: "Shift starting soon",
              body: `Your shift starts in ${Math.max(1, Math.round(toStart / 60000))} min. Head to the clock to start.`,
              url: "/clock",
              kind: "shift_start_warn",
            });
          }
          // START overdue — nobody clocked in, so sign them in automatically.
          if (!openShift && !alreadyWorked && toStart <= 0 && now < endsAt) {
            autoClockIns.push({ slotId: slot.id as string, userId, startsAt, endsAt });
            jobs.push({
              key: `slot:${slot.id}:start:over`,
              userId,
              title: "Clocked in automatically",
              body: "Your shift has started, so we've clocked you in for you.",
              url: "/clock",
              kind: "shift_auto_clock_in",
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

        // --- Auto clock-in ----------------------------------------------------
        // Claimed rota slots that have started without a clock-in get an open
        // shift created from the slot's start time, then admins/management are
        // alerted with who was signed in and at what time. The new shift shows
        // up in the "on shift right now" list on the clock page instantly.
        let autoClockedIn = 0;
        if (autoClockIns.length) {
          const autoKeys = autoClockIns.map((a) => `slot:${a.slotId}:autoclock`);
          const { data: doneRows } = await (supabaseAdmin as unknown as {
            from: (t: string) => {
              select: (cols: string) => {
                in: (col: string, vals: string[]) => Promise<{ data: { alert_key: string }[] | null }>;
              };
            };
          })
            .from("scheduled_alert_log")
            .select("alert_key")
            .in("alert_key", autoKeys);
          const done = new Set((doneRows ?? []).map((r) => r.alert_key));

          const todo = autoClockIns.filter((a) => !done.has(`slot:${a.slotId}:autoclock`));
          const names = new Map<string, string>();
          if (todo.length) {
            const { data: profs } = await supabaseAdmin
              .from("profiles")
              .select("id, username, display_name")
              .in("id", Array.from(new Set(todo.map((a) => a.userId))));
            for (const p of profs ?? []) {
              names.set(
                p.id as string,
                (p.display_name as string | null) || (p.username as string | null) || "Unknown staff",
              );
            }
          }

          for (const a of todo) {
            // Guard against a race: skip if an open shift appeared meanwhile.
            const { data: stillOpen } = await supabaseAdmin
              .from("shifts")
              .select("id")
              .eq("user_id", a.userId)
              .is("clock_out", null)
              .limit(1)
              .maybeSingle();
            if (stillOpen) continue;

            const { error: insErr } = await supabaseAdmin.from("shifts").insert({
              user_id: a.userId,
              clock_in: new Date(a.startsAt).toISOString(),
            });
            if (insErr) {
              console.error("[scheduled-reminders] auto clock-in failed", a.slotId, insErr.message);
              continue;
            }
            autoClockedIn++;

            const name = names.get(a.userId) ?? "Unknown staff";
            const clockedAt = new Date(a.startsAt).toLocaleTimeString("en-GB", {
              hour: "2-digit",
              minute: "2-digit",
              timeZone: "Europe/London",
            });
            await supabaseAdmin.from("staff_notifications").insert({
              kind: "staff_auto_clock_in",
              title: `${name} auto clocked in`,
              body: `${name} hadn't clocked in for their claimed shift, so they were signed in automatically at ${clockedAt} (shift start time).`,
              link_path: "/clock",
              entity_id: a.userId,
            });

            await (supabaseAdmin as unknown as {
              from: (t: string) => {
                upsert: (row: unknown, opts: { onConflict: string }) => Promise<unknown>;
              };
            })
              .from("scheduled_alert_log")
              .upsert({ alert_key: `slot:${a.slotId}:autoclock`, user_id: a.userId }, { onConflict: "alert_key" });
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
          return Response.json({ ok: true, evaluated: 0, sent: 0, autoClockedIn });
        }


        // Dedup: drop any job we've already logged.
        const keys = jobs.map((j) => j.key);
        const adminAny = supabaseAdmin as unknown as {
          from: (t: string) => {
            select: (cols: string) => {
              in: (col: string, vals: string[]) => Promise<{ data: { alert_key: string }[] | null }>;
            };
            upsert: (row: unknown, opts: { onConflict: string }) => Promise<unknown>;
            delete: () => { lt: (col: string, val: string) => Promise<unknown> };
          };
        };
        const { data: existing } = await adminAny
          .from("scheduled_alert_log")
          .select("alert_key")
          .in("alert_key", keys);
        const sentKeys = new Set((existing ?? []).map((r) => r.alert_key as string));
        const pending = jobs.filter((j) => !sentKeys.has(j.key));

        let sent = 0;
        let failed = 0;
        for (const job of pending) {
          try {
            const [fcmRes, webRes] = await Promise.all([
              pushToUser(job.userId, {
                title: job.title,
                body: job.body,
                data: { kind: job.kind, url: job.url, alertKey: job.key },
              }).catch((e) => ({ sent: 0, failed: 0, skipped: String(e) } as { sent: number; failed: number; skipped?: string })),
              broadcastToUser(job.userId, job.title, job.body, job.url, job.key).catch((e) => ({ sent: 0, error: String(e) } as { sent: number; error?: string })),
            ]);
            if (fcmRes.sent > 0 || webRes.sent > 0) sent++;
            else failed++;
            if ("error" in webRes && webRes.error) {
              console.error("[scheduled-reminders] web push failed", job.key, webRes.error);
            }
          } catch (e) {
            failed++;
            console.error("[scheduled-reminders] push failed", job.key, e);
          }
          // Record regardless so we don't spam if push delivery is flaky.
          await adminAny
            .from("scheduled_alert_log")
            .upsert({ alert_key: job.key, user_id: job.userId }, { onConflict: "alert_key" });
        }

        // GC old rows so the table doesn't grow unbounded.
        await adminAny
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