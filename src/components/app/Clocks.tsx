import { useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

type BusinessHourRow = {
  day_of_week: number;
  is_closed: boolean;
  open_time: string;
  close_time: string;
};

const DEFAULT_HOURS: BusinessHourRow[] = [
  { day_of_week: 0, is_closed: true, open_time: "09:00", close_time: "17:00" },
  { day_of_week: 1, is_closed: false, open_time: "09:00", close_time: "17:00" },
  { day_of_week: 2, is_closed: false, open_time: "09:00", close_time: "17:00" },
  { day_of_week: 3, is_closed: false, open_time: "09:00", close_time: "17:00" },
  { day_of_week: 4, is_closed: false, open_time: "09:00", close_time: "17:00" },
  { day_of_week: 5, is_closed: false, open_time: "09:00", close_time: "17:00" },
  { day_of_week: 6, is_closed: true, open_time: "09:00", close_time: "17:00" },
];

function parseTimeToMinutes(value: string) {
  const [hour = "0", minute = "0"] = value.split(":");
  return Number(hour) * 60 + Number(minute);
}

function zonedParts(date: Date, tz: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

function localMinutes(date: Date, tz: string) {
  const p = zonedParts(date, tz);
  return p.hour * 60 + p.minute + p.second / 60;
}

function dayOfWeek(date: Date, tz: string) {
  const short = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    weekday: "short",
  }).format(date);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(short);
}

function addDaysToZonedDate(parts: ReturnType<typeof zonedParts>, days: number) {
  const shifted = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days, 12, 0, 0));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

function zonedDateTimeToDate(
  dateParts: { year: number; month: number; day: number },
  time: string,
  tz: string,
) {
  const [hour = 0, minute = 0] = time.split(":").map((part) => Number(part));
  let utc = Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day, hour, minute, 0);

  for (let i = 0; i < 3; i += 1) {
    const actual = zonedParts(new Date(utc), tz);
    const expected = Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day, hour, minute, 0);
    const actualAsUtc = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      actual.second,
    );
    utc += expected - actualAsUtc;
  }

  return new Date(utc);
}

function formatCountdown(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
}

function formatLocalOpening(date: Date, tz: string) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: tz,
    timeZoneName: "short",
  }).format(date);
}

function getOfficeStatus(rows: BusinessHourRow[], now: Date, officeTz: string, userTz: string) {
  const today = dayOfWeek(now, officeTz);
  const current = rows.find((row) => row.day_of_week === today);
  const nowMinutes = localMinutes(now, officeTz);
  const open = current
    ? !current.is_closed && nowMinutes >= parseTimeToMinutes(current.open_time) && nowMinutes < parseTimeToMinutes(current.close_time)
    : true;

  if (open) {
    return { open, nextOpening: null as Date | null, countdown: "", userOpening: "" };
  }

  const officeToday = zonedParts(now, officeTz);
  for (let offset = 0; offset < 8; offset += 1) {
    const row = rows.find((candidate) => candidate.day_of_week === (today + offset) % 7);
    if (!row || row.is_closed) continue;
    if (offset === 0 && parseTimeToMinutes(row.open_time) <= nowMinutes) continue;

    const dateParts = addDaysToZonedDate(officeToday, offset);
    const nextOpening = zonedDateTimeToDate(dateParts, row.open_time, officeTz);
    if (nextOpening.getTime() <= now.getTime()) continue;

    return {
      open,
      nextOpening,
      countdown: formatCountdown(nextOpening.getTime() - now.getTime()),
      userOpening: formatLocalOpening(nextOpening, userTz),
    };
  }

  return { open, nextOpening: null as Date | null, countdown: "", userOpening: "" };
}

function format(tz: string, date = new Date()) {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: tz,
  }).format(date);
}

function abbrev(tz: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    timeZoneName: "short",
  }).formatToParts(new Date());
  return parts.find((p) => p.type === "timeZoneName")?.value ?? tz;
}

export function Clocks() {
  const [now, setNow] = useState(() => new Date());
  const [hours, setHours] = useState<BusinessHourRow[]>(DEFAULT_HOURS);
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadHours = async () => {
      const { data } = await supabase
        .from("business_hours")
        .select("day_of_week,is_closed,open_time,close_time")
        .order("day_of_week");
      if (!cancelled && data && data.length > 0) {
        setHours(data as BusinessHourRow[]);
      }
    };

    loadHours();
    const channel = supabase
      .channel(`header-business-hours-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "business_hours" }, () => {
        void loadHours();
      })
      .subscribe();
    const id = setInterval(loadHours, 60_000);

    return () => {
      cancelled = true;
      clearInterval(id);
      supabase.removeChannel(channel);
    };
  }, []);

  const userTz =
    Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const ukTz = "Europe/London"; // auto handles BST / GMT
  const officeStatus = getOfficeStatus(hours, now, ukTz, userTz);

  return (
    <div className="flex items-center gap-3">
      <ClockPill
        sideLabel="Office time"
        time={format(ukTz, now)}
        label={abbrev(ukTz)}
        ring="ring-amber-400/60"
        text="text-amber-300"
        labelBg="bg-amber-500/20 text-amber-200"
        title={
          officeStatus.open || !officeStatus.nextOpening
            ? `UK office time (${ukTz})`
            : `Office closed. Opens ${formatLocalOpening(officeStatus.nextOpening, ukTz)}; your local time ${officeStatus.userOpening}.`
        }
        status={
          officeStatus.open ? null : (
            <span className="inline-flex items-center gap-1 rounded-full bg-destructive/15 px-1.5 py-0.5 text-[10px] font-bold uppercase text-destructive ring-1 ring-destructive/35">
              Closed
              {officeStatus.countdown && (
                <span className="normal-case text-destructive/85">opens in {officeStatus.countdown}</span>
              )}
            </span>
          )
        }
      />
      <ClockPill
        sideLabel="Customer local time"
        time={format(userTz, now)}
        label={abbrev(userTz)}
        ring="ring-sky-400/60"
        text="text-sky-300"
        labelBg="bg-sky-500/20 text-sky-200"
        title={`Customer local time (${userTz})`}
      />
    </div>
  );
}

function ClockPill({
  sideLabel,
  time,
  label,
  ring,
  text,
  labelBg,
  title,
  status,
}: {
  sideLabel: string;
  time: string;
  label: string;
  ring: string;
  text: string;
  labelBg: string;
  title?: string;
  status?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2" title={title}>
      <span className="hidden text-[10px] uppercase tracking-wide text-muted-foreground sm:inline">
        {sideLabel}
      </span>
      <div
        className={`flex items-center gap-2 rounded-full bg-rail/80 ring-1 ${ring} px-3 py-1 font-mono text-sm tabular-nums shadow-soft`}
      >
        <span className={text}>{time}</span>
        <span
          className={`text-[10px] uppercase tracking-wider rounded-full px-1.5 py-0.5 ${labelBg}`}
        >
          {label}
        </span>
        {status}
      </div>
    </div>
  );
}