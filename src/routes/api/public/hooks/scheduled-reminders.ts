import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { pushToUser } from "@/lib/fcm.server";
import { broadcastToUser } from "@/lib/push.functions";
import { planBreaks, toMinutes, fromMinutes } from "@/lib/break-plan";
import { reconcileUnpaidOrders } from "@/lib/order-payment-reconcile.server";


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
// Only these accounts are clocked in automatically (Dane J, normanbyred77).
const AUTO_CLOCK_IN_USERS = new Set([
  "73c113ce-ce1b-43f0-af24-c2a36cf0d8e7",
  "7852b1ea-1da6-4fe5-a6e3-01ab1a5c6eee",
]);

type AlertJob = {
  key: string;
  userId: string;
  title: string;
  body: string;
  url: string;
  kind: string;
};

const londonFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

function shiftStartsAt(date: string, time: string): number {
  // shift_slots stores naive Europe/London wall clock + date. Convert that
  // wall clock to a real UTC instant: parse as UTC, measure the London
  // offset at that moment via Intl, then subtract it. Parsing as plain UTC
  // here was the old bug — during BST every shift alert fired an hour late,
  // by which point staff had already clocked out and the "shift has ended"
  // alert never qualified.
  const guess = Date.parse(`${date}T${time}Z`);
  if (isNaN(guess)) return NaN;
  const p = Object.fromEntries(
    londonFmt.formatToParts(new Date(guess)).map((x) => [x.type, x.value]),
  );
  const hour = p.hour === "24" ? "00" : p.hour;
  const londonAsUtc = Date.parse(`${p.year}-${p.month}-${p.day}T${hour}:${p.minute}:${p.second}Z`);
  return guess - (londonAsUtc - guess);
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

        // --- Planned breaks (Break 1 / Main break / Break 2) ------------------
        try {
          const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date(now)).map((x) => [x.type, x.value]));
          const ukDate = `${p.year}-${p.month}-${p.day}`;
          const ukMin = (Number(p.hour) % 24) * 60 + Number(p.minute);
          const db = supabaseAdmin as any;
          const [{ data: daySlots }, { data: roleRows }, { data: stored }] = await Promise.all([
            db.from("shift_slots").select("assigned_to,start_time,end_time").eq("shift_date", ukDate).eq("slot_type", "shift"),
            db.from("user_roles").select("user_id,role").in("role", ["staff", "management", "admin"]),
            db.from("break_plan_times").select("user_id,label,kind,start_min").eq("shift_date", ukDate),
          ]);
          const eligible = new Set(((roleRows ?? []) as { user_id: string }[]).map((r) => r.user_id));
          const allSlots = (daySlots ?? []) as { assigned_to: string | null; start_time: string; end_time: string }[];
          const rows = allSlots
            .filter((s) => s.assigned_to && eligible.has(s.assigned_to))
            .map((s) => ({ userId: s.assigned_to as string, start: toMinutes(s.start_time), end: toMinutes(s.end_time) }));
          // Open (unassigned) slots: any eligible staff member clocked in today
          // with no named slot of their own is treated as covering that slot.
          const openSlots = allSlots.filter((s) => !s.assigned_to);
          if (openSlots.length) {
            const named = new Set(rows.map((r) => r.userId));
            const sinceIso = new Date(now - 20 * 60 * 60 * 1000).toISOString();
            const { data: openShiftsToday } = await db
              .from("shifts").select("user_id").is("clock_out", null).gte("clock_in", sinceIso);
            const covering = new Set(((openShiftsToday ?? []) as { user_id: string }[]).map((s) => s.user_id));
            for (const s of openSlots) {
              const start = toMinutes(s.start_time);
              const end = toMinutes(s.end_time);
              for (const uid of covering) {
                if (!eligible.has(uid) || named.has(uid)) continue;
                rows.push({ userId: uid, start, end });
                named.add(uid);
              }
            }
          }
          const plans = ((stored ?? []) as { user_id: string; label: string; kind: string; start_min: number | null }[]).slice();
          const planned = new Set(plans.map((r) => r.user_id));
          const fresh = rows.filter((r) => !planned.has(r.userId) && ukMin < r.end);
          if (fresh.length) {
            const reserved = plans.filter((r) => r.start_min !== null).map((r) => ({ start: r.start_min as number, end: (r.start_min as number) + (r.kind === "lunch" ? 30 : 15) }));
            const result = planBreaks(rows, 1, ukMin, reserved, planned);
            const inserts: typeof plans = [];
            for (const f of fresh) {
              const up = result.get(f.userId);
              if (!up) continue;
              for (const it of [up.break1, up.lunch, up.break2]) inserts.push({ user_id: f.userId, label: it.label, kind: it.kind, start_min: it.start });
            }
            if (inserts.length) {
              await db.from("break_plan_times").upsert(inserts.map((r) => ({ ...r, shift_date: ukDate })), { onConflict: "user_id,shift_date,label", ignoreDuplicates: true });
              plans.push(...inserts);
            }
          }
          const due = plans.filter((r) => r.start_min !== null && ukMin >= r.start_min && ukMin <= r.start_min + 15);
          if (due.length) {
            const dueUsers = Array.from(new Set(due.map((d) => d.user_id)));
            const { data: openShifts } = await db.from("shifts").select("id,user_id").in("user_id", dueUsers).is("clock_out", null);
            const shiftIds = ((openShifts ?? []) as { id: string }[]).map((s) => s.id);
            const { data: taken } = shiftIds.length ? await db.from("breaks").select("user_id,kind,ended_at").in("shift_id", shiftIds) : { data: [] };
            const shiftByUser = new Map(((openShifts ?? []) as { id: string; user_id: string }[]).map((s) => [s.user_id, s.id]));
            for (const d of due) {
              const shiftId = shiftByUser.get(d.user_id);
              if (!shiftId) continue;
              const mine = ((taken ?? []) as { user_id: string; kind: string; ended_at: string | null }[]).filter((b) => b.user_id === d.user_id);
              // Never prompt for a second break while one is already running.
              if (mine.some((b) => b.ended_at === null)) continue;
              const used = mine.filter((b) => b.kind === d.kind).length;
              const need = d.label === "Break 2" ? 2 : 1;
              if (used >= need) continue;
              // Auto-start accounts get their break started here on the server,
              // so it begins on time even when their browser is closed/asleep.
              if (AUTO_CLOCK_IN_USERS.has(d.user_id)) {
                const { error: bErr } = await db.from("breaks").insert({ shift_id: shiftId, user_id: d.user_id, kind: d.kind });
                if (bErr) { console.error("[scheduled-reminders] auto break failed", bErr); continue; }
                mine.push({ user_id: d.user_id, kind: d.kind, ended_at: null });
                if (Array.isArray(taken)) (taken as any[]).push({ user_id: d.user_id, kind: d.kind, ended_at: null });
                jobs.push({
                  key: `bplan:${d.user_id}:${ukDate}:${d.label}:auto`,
                  userId: d.user_id,
                  title: `${d.label} started`,
                  body: `Your ${d.label.toLowerCase()} has started automatically. It ends on its own.`,
                  url: "/home",
                  kind: "break_warn",
                });
                continue;
              }
              // Everyone else confirms from the Working Status popup so they
              // can pass any open ticket over first. This alert says it's due.
              jobs.push({
                key: `bplan:${d.user_id}:${ukDate}:${d.label}`,
                userId: d.user_id,
                title: `${d.label} is due`,
                body: `Your ${d.label.toLowerCase()} was planned for ${fromMinutes(d.start_min as number)}. Start it from the Working Status box when you're ready — it ends on its own.`,
                url: "/home",
                kind: "break_warn",
              });
            }
          }
        } catch (e) {
          console.error("[scheduled-reminders] break plan failed", e);
        }

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
          // START overdue — nobody clocked in. Only allow-listed accounts are
          // signed in automatically; everyone else must clock in manually and
          // admin/management are alerted to investigate.
          if (!openShift && !alreadyWorked && toStart <= 0 && now < endsAt) {
            autoClockIns.push({ slotId: slot.id as string, userId, startsAt, endsAt });
            const auto = AUTO_CLOCK_IN_USERS.has(userId);
            jobs.push({
              key: `slot:${slot.id}:start:over`,
              userId,
              title: auto ? "Clocked in automatically" : "Your shift has started",
              body: auto
                ? "Your shift has started, so we've clocked you in for you."
                : "Your shift has started and you haven't clocked in. Please clock in now.",
              url: "/clock",
              kind: auto ? "shift_auto_clock_in" : "shift_start_over",
            });
          }
          // END warn — heads-up shortly before the shift finishes.
          if (isOpenForSlot && toEnd > 0 && toEnd <= WARN_MS) {
            jobs.push({
              key: `slot:${slot.id}:end:warn`,
              userId,
              title: "Shift ending soon",
              body: `Your shift ends in ${Math.max(1, Math.round(toEnd / 60000))} min.`,
              url: "/clock",
              kind: "shift_end_warn",
            });
          }
          // END overdue — phone alert at the end of the shift.
          if (isOpenForSlot && toEnd <= 0) {
            jobs.push({
              key: `slot:${slot.id}:end:over`,
              userId,
              title: "Shift has ended",
              body: "Your shift has ended. Open BM Support to confirm if you're still working.",
              url: "/clock",
              kind: "shift_end_over",
            });
          }
        }

        // --- Auto clock-in ----------------------------------------------------
        // Claimed rota slots that have started without a clock-in get an open
        // shift created from the slot's start time, then only that staff
        // member is alerted with when they were signed in. The new shift shows
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

          const needsManagers = todo.some((a) => !AUTO_CLOCK_IN_USERS.has(a.userId));
          let managerIds: string[] = [];
          if (needsManagers) {
            const { data: mgrs } = await supabaseAdmin
              .from("user_roles")
              .select("user_id")
              .in("role", ["admin", "management"] as never);
            managerIds = Array.from(new Set((mgrs ?? []).map((r) => r.user_id as string)));
          }

          for (const a of todo) {
            if (!AUTO_CLOCK_IN_USERS.has(a.userId)) {
              // Not allowed to auto sign in — once they're 1 minute late,
              // alert admin/management (in-app + phone) to investigate.
              if (now < a.startsAt + 60 * 1000) continue;
              const name = names.get(a.userId) ?? "Unknown staff";
              const startAt = new Date(a.startsAt).toLocaleTimeString("en-GB", {
                hour: "2-digit",
                minute: "2-digit",
                timeZone: "Europe/London",
              });
              const title = `${name} hasn't signed in`;
              const body = `${name}'s shift started at ${startAt} but they haven't clocked in. Please investigate.`;
              if (managerIds.length) {
                await supabaseAdmin.from("user_notifications").insert(
                  managerIds.map((uid) => ({
                    user_id: uid,
                    kind: "staff_missed_clock_in",
                    title,
                    body,
                    link_path: "/admin-shifts",
                    source_type: "shift",
                    source_id: a.slotId,
                  })) as never,
                );
                for (const uid of managerIds) {
                  jobs.push({
                    key: `slot:${a.slotId}:missed:${uid}`,
                    userId: uid,
                    title,
                    body,
                    url: "/admin-shifts",
                    kind: "shift_start_over",
                  });
                }
              }
              await (supabaseAdmin as unknown as {
                from: (t: string) => {
                  upsert: (row: unknown, opts: { onConflict: string }) => Promise<unknown>;
                };
              })
                .from("scheduled_alert_log")
                .upsert({ alert_key: `slot:${a.slotId}:autoclock`, user_id: a.userId }, { onConflict: "alert_key" });
              continue;
            }
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
            // Only the staff member who was auto signed in gets this — it
            // must not broadcast to the shared staff feed.
            await supabaseAdmin.from("user_notifications").insert({
              user_id: a.userId,
              kind: "staff_auto_clock_in",
              title: `${name} auto clocked in`,
              body: `${name} hadn't clocked in for their claimed shift, so they were signed in automatically at ${clockedAt} (shift start time).`,
              link_path: "/clock",
              source_type: "shift",
              source_id: a.slotId,
            } as never);

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
          const label = b.kind === "lunch" ? "Main break" : "Break";

          if (remaining <= 0) {
            // Breaks end automatically — close it silently at its limit, no alert.
            await supabaseAdmin
              .from("breaks")
              .update({ ended_at: new Date(new Date(b.started_at as string).getTime() + limit * 1000).toISOString() })
              .eq("id", b.id as string)
              .is("ended_at", null);
          } else if (remaining <= BREAK_WARN_SEC) {
            jobs.push({
              key: `break:${b.id}:warn`,
              userId: b.user_id as string,
              title: `${label} ending soon`,
              body: `Your ${label.toLowerCase()} ends in ${Math.max(1, Math.round(remaining / 60))} min.`,
              url: "/clock",
              kind: b.kind === "lunch" ? "main_break_ending" : "break_ending",
            });
          }
        }

        // --- Payment reconciliation safety net ------------------------------
        // Catches orders whose payment completed at the provider but were
        // never flagged paid locally (customer closed the tab, network error,
        // etc). Repairs settled payment rows and verifies pending Stripe
        // checkout sessions directly with Stripe.
        let reconciledOrders = 0;
        try {
          const rec = await reconcileUnpaidOrders();
          reconciledOrders = rec.repaired;
        } catch (e) {
          console.error("[scheduled-reminders] payment reconcile failed", e);
        }

        if (!jobs.length) {
          return Response.json({ ok: true, evaluated: 0, sent: 0, autoClockedIn, reconciledOrders });
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

        // Expired app transfers are hard-deleted so no record is retained.
        await adminAny
          .from("app_transfers")
          .delete()
          .lt("expires_at", new Date(now).toISOString());

        // Temporary guest logins: wipe all their data and the account itself.
        const { data: expiredTemp } = await (supabaseAdmin as any)
          .from("temporary_accounts")
          .select("user_id")
          .lt("expires_at", new Date(now).toISOString());
        for (const t of (expiredTemp ?? []) as { user_id: string }[]) {
          try {
            await (supabaseAdmin as any).rpc("purge_user_data", { _uid: t.user_id });
            await (supabaseAdmin as any).auth.admin.deleteUser(t.user_id);
            await (supabaseAdmin as any).from("temporary_accounts").delete().eq("user_id", t.user_id);
          } catch (e) {
            console.error("[temp-accounts] delete failed", t.user_id, e);
          }
        }

        return Response.json({
          ok: true,
          evaluated: jobs.length,
          pending: pending.length,
          sent,
          failed,
          autoClockedIn,
          reconciledOrders,
        });

      },
    },
  },
});