import { useEffect, useState } from "react";
import { Building2 } from "lucide-react";
import { useUserTimezone } from "@/hooks/use-user-timezone";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  bankHolidayName,
  londonDateKey,
  useUkBankHolidays,
  type BankHolidayMap,
} from "@/lib/uk-bank-holidays";

type OfficeHour = {
  day_of_week: number;
  open_time: string;
  close_time: string;
  is_closed: boolean;
};

const OFFICE_DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function timeZoneOffsetMs(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day), Number(values.hour), Number(values.minute), Number(values.second)) - date.getTime();
}

function londonTimeToDate(dayOfWeek: number, time: string) {
  const now = new Date();
  const londonDay = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", weekday: "short" }).format(now);
  const currentDay = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(londonDay);
  const base = new Date(now.getTime() + ((dayOfWeek - currentDay + 7) % 7) * 86_400_000);
  const dateParts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(base);
  const dateValues = Object.fromEntries(dateParts.map((part) => [part.type, part.value]));
  const [hours, minutes] = time.split(":").map(Number);
  const wallClock = Date.UTC(Number(dateValues.year), Number(dateValues.month) - 1, Number(dateValues.day), hours, minutes);
  const firstPass = new Date(wallClock);
  return new Date(wallClock - timeZoneOffsetMs(firstPass, "Europe/London"));
}

function formatOfficeTime(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return new Intl.DateTimeFormat("en-GB", { hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(2000, 0, 1, hours, minutes));
}

function isOfficeOpen(hours: OfficeHour[], now: Date, holidays: BankHolidayMap = {}) {
  // England & Wales public holidays close the office regardless of the weekly hours.
  if (bankHolidayName(holidays, now)) return false;
  const londonDayName = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", weekday: "short" }).format(now);
  const londonDay = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(londonDayName);
  const londonParts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const value = (type: string) => Number(londonParts.find((part) => part.type === type)?.value ?? 0);
  const currentMinutes = value("hour") * 60 + value("minute") + value("second") / 60;
  const today = hours.find((hour) => hour.day_of_week === londonDay);
  const toMinutes = (time: string) => {
    const [hour = 0, minute = 0] = time.split(":").map(Number);
    return hour * 60 + minute;
  };
  return Boolean(
    today &&
    !today.is_closed &&
    currentMinutes >= toMinutes(today.open_time) &&
    currentMinutes < toMinutes(today.close_time),
  );
}

// Shared opening-hours panel: live summary cards + the full weekly table.
// Used by the header dialog and embedded directly on the tickets page.
export function OfficeHoursSchedule({ channelName = "office-hours-live" }: { channelName?: string }) {
  const timezone = useUserTimezone();
  const holidays = useUkBankHolidays();
  const [hours, setHours] = useState<OfficeHour[]>([]);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const loadHours = () => {
      void supabase
        .from("business_hours")
        .select("day_of_week, open_time, close_time, is_closed")
        .order("day_of_week")
        .then(({ data }) => setHours((data ?? []) as OfficeHour[]));
    };
    loadHours();
    const channel = supabase
      .channel(channelName)
      .on("postgres_changes", { event: "*", schema: "public", table: "business_hours" }, loadHours)
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [channelName]);

  const ukTz = "Europe/London";
  const tzFormatter = (tz: string) => new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const showUserColumn = hours.some((hour) => {
    if (hour.is_closed) return false;
    const uk = tzFormatter(ukTz);
    const local = tzFormatter(timezone);
    const openD = londonTimeToDate(hour.day_of_week, hour.open_time);
    const closeD = londonTimeToDate(hour.day_of_week, hour.close_time);
    return uk.format(openD) !== local.format(openD) || uk.format(closeD) !== local.format(closeD);
  });
  const timezoneLabel = timezone.replaceAll("_", " ").replace("/", " / ");
  const officeOpen = isOfficeOpen(hours, now, holidays);
  const currentDateTime = (tz: string) => new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(now);
  const statusPill = (
    <span className={cn(
      "inline-flex shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ring-1",
      officeOpen
        ? "bg-success/15 text-success ring-success/35"
        : "bg-destructive/15 text-destructive ring-destructive/35",
    )}>
      {officeOpen ? "Open" : "Closed"}
    </span>
  );

  if (hours.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Loading opening hours…</p>;
  }

  return (
    <div className="space-y-3">
      {/* Live "now" summary cards, one per zone. */}
      <div className={cn("grid gap-2", showUserColumn ? "grid-cols-2" : "grid-cols-1")}>
        <div className="rounded-lg border border-border/70 bg-muted/30 px-3 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">UK office</span>
            {statusPill}
          </div>
          <div className="mt-1 font-mono text-sm font-semibold tabular-nums text-foreground">
            {currentDateTime(ukTz)}
          </div>
        </div>
        {showUserColumn && (
          <div className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-[11px] font-semibold uppercase tracking-wide text-muted-foreground" title={timezoneLabel}>
                Your time · {timezoneLabel}
              </span>
              {statusPill}
            </div>
            <div className="mt-1 font-mono text-sm font-semibold tabular-nums text-foreground">
              {currentDateTime(timezone)}
            </div>
          </div>
        )}
      </div>

      {/* Weekly hours table — strict columns so every row lines up. */}
      <div className={cn(
        "rounded-lg border border-border/70 text-xs sm:text-sm",
        showUserColumn
          ? "grid grid-cols-[7.5rem_minmax(0,1fr)_minmax(0,1fr)]"
          : "grid grid-cols-[7.5rem_minmax(0,1fr)]",
      )}>
        <div className="bg-muted/40 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Day</div>
        <div className="border-l border-border/70 bg-muted/40 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">UK office</div>
        {showUserColumn && (
          <div className="border-l border-border/70 bg-muted/40 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Your time</div>
        )}
        {[...hours].sort((a, b) => ((a.day_of_week + 6) % 7) - ((b.day_of_week + 6) % 7)).map((hour) => {
          const rowDate = londonTimeToDate(hour.day_of_week, "12:00");
          const holidayName = holidays[londonDateKey(rowDate)] ?? null;
          const closed = hour.is_closed || Boolean(holidayName);
          const isToday = new Intl.DateTimeFormat("en-GB", { timeZone: ukTz, weekday: "short" }).format(now)
            === ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][hour.day_of_week];
          const localOpen = closed ? null : londonTimeToDate(hour.day_of_week, hour.open_time);
          const localClose = closed ? null : londonTimeToDate(hour.day_of_week, hour.close_time);
          const localFormat = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "numeric", minute: "2-digit", hour12: true });
          const officeDate = new Intl.DateTimeFormat("en-GB", { timeZone: ukTz, day: "numeric", month: "short" })
            .format(londonTimeToDate(hour.day_of_week, closed ? "00:00" : hour.open_time));
          const userDateFormat = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, day: "numeric", month: "short" });
          const userOpenDate = userDateFormat.format(localOpen ?? londonTimeToDate(hour.day_of_week, "00:00"));
          const userCloseDate = localClose ? userDateFormat.format(localClose) : userOpenDate;
          const cell = cn("border-t border-border/50 px-3 py-2.5", isToday && "bg-primary/10");
          return (
            <div key={hour.day_of_week} className="contents">
              <div className={cn(cell, "font-semibold text-foreground")}>
                <div className="flex items-center gap-1.5">
                  <span>{OFFICE_DAY_NAMES[hour.day_of_week]}</span>
                  {isToday && (
                    <span className="rounded-full bg-primary px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-primary-foreground">Today</span>
                  )}
                </div>
                <div className="mt-0.5 text-[11px] font-normal text-muted-foreground">{officeDate}</div>
              </div>
              <div className={cn(cell, "border-l border-border/50")}>
                {closed ? (
                  <span className="font-medium text-destructive">Closed</span>
                ) : (
                  <span className="font-mono tabular-nums text-foreground">{formatOfficeTime(hour.open_time)}–{formatOfficeTime(hour.close_time)}</span>
                )}
                {holidayName && (
                  <div className="mt-0.5 text-[11px] text-muted-foreground">{holidayName} (public holiday)</div>
                )}
              </div>
              {showUserColumn && (
                <div className={cn(cell, "border-l border-border/50")}>
                  {closed || !localOpen || !localClose ? (
                    <span className="font-medium text-destructive">Closed</span>
                  ) : userOpenDate === userCloseDate ? (
                    <>
                      <span className="font-mono tabular-nums text-foreground">{localFormat.format(localOpen)}–{localFormat.format(localClose)}</span>
                      <div className="mt-0.5 text-[11px] text-muted-foreground">{userOpenDate}</div>
                    </>
                  ) : (
                    <div className="space-y-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-mono tabular-nums text-foreground">{localFormat.format(localOpen)}</span>
                        <span className="text-[11px] text-muted-foreground">{userOpenDate}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-primary">
                        <span className="h-px flex-1 bg-primary/30" />
                        <span className="rounded-full bg-primary/15 px-1.5 py-px text-[9px] font-bold uppercase tracking-wide ring-1 ring-primary/30">+1 day</span>
                        <span className="h-px flex-1 bg-primary/30" />
                      </div>
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-mono tabular-nums text-foreground">{localFormat.format(localClose)}</span>
                        <span className="text-[11px] text-muted-foreground">{userCloseDate}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function Clocks() {
  const timezone = useUserTimezone();
  const holidays = useUkBankHolidays();
  const [open, setOpen] = useState(false);
  const [hours, setHours] = useState<OfficeHour[]>([]);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    // Self-correcting tick: schedule each update on the exact next second
    // boundary so browser timer throttling can never leave the clock stale,
    // and re-read the device clock whenever the tab regains focus.
    let timer = 0;
    const tick = () => {
      setNow(new Date());
      const delay = 1000 - (Date.now() % 1000) + 20;
      timer = window.setTimeout(tick, delay);
    };
    tick();
    const onFocus = () => setNow(new Date());
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  // Load opening hours when the dialog opens (and refresh while it stays open).
  useEffect(() => {
    if (!open) return;
    const loadHours = () => {
      void supabase
        .from("business_hours")
        .select("day_of_week, open_time, close_time, is_closed")
        .order("day_of_week")
        .then(({ data }) => setHours((data ?? []) as OfficeHour[]));
    };
    loadHours();
    const channel = supabase
      .channel("header-office-hours-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "business_hours" }, loadHours)
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [open]);

  const ukTz = "Europe/London"; // auto handles BST / GMT
  const tzFormatter = (tz: string) => new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false,
  });
  // Only show the "Your time" column when the customer's timezone gives
  // different dates/times from the UK office for at least one opening window.
  const showUserColumn = hours.some((hour) => {
    if (hour.is_closed) return false;
    const uk = tzFormatter("Europe/London");
    const local = tzFormatter(timezone);
    const openD = londonTimeToDate(hour.day_of_week, hour.open_time);
    const closeD = londonTimeToDate(hour.day_of_week, hour.close_time);
    return uk.format(openD) !== local.format(openD) || uk.format(closeD) !== local.format(closeD);
  });
  const timezoneLabel = timezone.replaceAll("_", " ").replace("/", " / ");
  const officeOpen = isOfficeOpen(hours, now, holidays);
  // Header clock: the visitor's own device time + date, ticking live.
  const headerTime = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).format(now);
  const headerDate = new Intl.DateTimeFormat("en-GB", {
    weekday: "short", day: "numeric", month: "short",
  }).format(now);
  const currentDateTime = (tz: string) => new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(now);
  const statusPill = (
    <span className={cn(
      "inline-flex shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ring-1",
      officeOpen
        ? "bg-success/15 text-success ring-success/35"
        : "bg-destructive/15 text-destructive ring-destructive/35",
    )}>
      {officeOpen ? "Open" : "Closed"}
    </span>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <div className="flex items-center gap-2">
        <DialogTrigger asChild>
          <button
            type="button"
            aria-label="Office opening hours"
            title="Office opening hours"
            className={cn(
              "inline-flex size-9 items-center justify-center rounded-full bg-rail/80 ring-1 shadow-soft transition-colors",
              officeOpen
                ? "ring-success/50 text-success hover:bg-success/15"
                : "ring-destructive/50 text-destructive hover:bg-destructive/15",
            )}
          >
            <Building2 className="size-4" />
          </button>
        </DialogTrigger>
        {/* Live device clock, deliberately positioned after the office icon. */}
        <div className="flex min-w-0 flex-col leading-tight">
          <span className="text-[10px] font-medium text-muted-foreground">Your time</span>
          <span className="font-mono text-sm font-semibold tabular-nums text-foreground">{headerTime}</span>
          <span className="text-[10px] text-muted-foreground">{headerDate}</span>
        </div>
      </div>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <Building2 className="size-4 text-primary" />
            Office opening times
          </DialogTitle>
          <DialogDescription>
            Our UK office hours, with your local times alongside.
          </DialogDescription>
        </DialogHeader>
        {hours.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Loading opening hours…</p>
        ) : (
          <div className="space-y-3">
            {/* Live "now" summary cards, one per zone. */}
            <div className={cn("grid gap-2", showUserColumn ? "grid-cols-2" : "grid-cols-1")}>
              <div className="rounded-lg border border-border/70 bg-muted/30 px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">UK office</span>
                  {statusPill}
                </div>
                <div className="mt-1 font-mono text-sm font-semibold tabular-nums text-foreground">
                  {currentDateTime("Europe/London")}
                </div>
              </div>
              {showUserColumn && (
                <div className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[11px] font-semibold uppercase tracking-wide text-muted-foreground" title={timezoneLabel}>
                      Your time · {timezoneLabel}
                    </span>
                    {statusPill}
                  </div>
                  <div className="mt-1 font-mono text-sm font-semibold tabular-nums text-foreground">
                    {currentDateTime(timezone)}
                  </div>
                </div>
              )}
            </div>

            {/* Weekly hours table — strict columns so every row lines up. */}
            <div className={cn(
              "max-h-[55vh] overflow-y-auto rounded-lg border border-border/70 text-xs sm:text-sm",
              showUserColumn
                ? "grid grid-cols-[7.5rem_minmax(0,1fr)_minmax(0,1fr)]"
                : "grid grid-cols-[7.5rem_minmax(0,1fr)]",
            )}>
              <div className="bg-muted/40 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Day</div>
              <div className="border-l border-border/70 bg-muted/40 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">UK office</div>
              {showUserColumn && (
                <div className="border-l border-border/70 bg-muted/40 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Your time</div>
              )}
              {[...hours].sort((a, b) => ((a.day_of_week + 6) % 7) - ((b.day_of_week + 6) % 7)).map((hour) => {
                const rowDate = londonTimeToDate(hour.day_of_week, "12:00");
                const holidayName = holidays[londonDateKey(rowDate)] ?? null;
                const closed = hour.is_closed || Boolean(holidayName);
                const isToday = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", weekday: "short" }).format(now)
                  === ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][hour.day_of_week];
                const localOpen = closed ? null : londonTimeToDate(hour.day_of_week, hour.open_time);
                const localClose = closed ? null : londonTimeToDate(hour.day_of_week, hour.close_time);
                const localFormat = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "numeric", minute: "2-digit", hour12: true });
                const officeDate = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short" })
                  .format(londonTimeToDate(hour.day_of_week, closed ? "00:00" : hour.open_time));
                const userDateFormat = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, day: "numeric", month: "short" });
                const userOpenDate = userDateFormat.format(localOpen ?? londonTimeToDate(hour.day_of_week, "00:00"));
                const userCloseDate = localClose ? userDateFormat.format(localClose) : userOpenDate;
                const cell = cn("border-t border-border/50 px-3 py-2.5", isToday && "bg-primary/10");
                return (
                  <div key={hour.day_of_week} className="contents">
                    <div className={cn(cell, "font-semibold text-foreground")}>
                      <div className="flex items-center gap-1.5">
                        <span>{OFFICE_DAY_NAMES[hour.day_of_week]}</span>
                        {isToday && (
                          <span className="rounded-full bg-primary px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-primary-foreground">Today</span>
                        )}
                      </div>
                      <div className="mt-0.5 text-[11px] font-normal text-muted-foreground">{officeDate}</div>
                    </div>
                    <div className={cn(cell, "border-l border-border/50")}>
                      {closed ? (
                        <span className="font-medium text-destructive">Closed</span>
                      ) : (
                        <span className="font-mono tabular-nums text-foreground">{formatOfficeTime(hour.open_time)}–{formatOfficeTime(hour.close_time)}</span>
                      )}
                      {holidayName && (
                        <div className="mt-0.5 text-[11px] text-muted-foreground">{holidayName} (public holiday)</div>
                      )}
                    </div>
                    {showUserColumn && (
                      <div className={cn(cell, "border-l border-border/50")}>
                        {closed || !localOpen || !localClose ? (
                          <span className="font-medium text-destructive">Closed</span>
                        ) : userOpenDate === userCloseDate ? (
                          <>
                            <span className="font-mono tabular-nums text-foreground">{localFormat.format(localOpen)}–{localFormat.format(localClose)}</span>
                            <div className="mt-0.5 text-[11px] text-muted-foreground">{userOpenDate}</div>
                          </>
                        ) : (
                          // Crosses midnight: show start and end as two stacked
                          // blocks with a "+1 day" divider so it reads as one
                          // continuous window spanning two dates.
                          <div className="space-y-1">
                            <div className="flex items-baseline justify-between gap-2">
                              <span className="font-mono tabular-nums text-foreground">{localFormat.format(localOpen)}</span>
                              <span className="text-[11px] text-muted-foreground">{userOpenDate}</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-primary">
                              <span className="h-px flex-1 bg-primary/30" />
                              <span className="rounded-full bg-primary/15 px-1.5 py-px text-[9px] font-bold uppercase tracking-wide ring-1 ring-primary/30">+1 day</span>
                              <span className="h-px flex-1 bg-primary/30" />
                            </div>
                            <div className="flex items-baseline justify-between gap-2">
                              <span className="font-mono tabular-nums text-foreground">{localFormat.format(localClose)}</span>
                              <span className="text-[11px] text-muted-foreground">{userCloseDate}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
