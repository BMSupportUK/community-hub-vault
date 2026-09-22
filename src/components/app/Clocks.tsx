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

function isOfficeOpen(hours: OfficeHour[], now: Date) {
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

export function Clocks() {
  const timezone = useUserTimezone();
  const [open, setOpen] = useState(false);
  const [hours, setHours] = useState<OfficeHour[]>([]);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const tick = () => setNow(new Date());
    const id = window.setInterval(tick, 1000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
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
  const officeOpen = isOfficeOpen(hours, now);
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
      <DialogContent className="max-w-lg">
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
          <div className={cn("max-h-[60vh] overflow-y-auto rounded-lg border border-border/70 text-xs sm:text-sm",
            showUserColumn
              ? "grid grid-cols-[minmax(5.5rem,0.8fr)_minmax(0,1fr)_minmax(0,1fr)]"
              : "grid grid-cols-[minmax(5.5rem,0.8fr)_minmax(0,1fr)]")}>
            <div className="border-b border-border/70 px-3 py-2 font-semibold text-muted-foreground">Office date</div>
            <div className="border-b border-border/70 px-3 py-2 font-semibold">
              <div>UK office</div>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <span className="font-mono text-[11px] font-normal tabular-nums text-foreground">{currentDateTime("Europe/London")}</span>
                {statusPill}
              </div>
            </div>
            {showUserColumn && (
              <div className="border-b border-l border-border/70 px-3 py-2 font-semibold">
                <div>Your time · {timezoneLabel}</div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <span className="font-mono text-[11px] font-normal tabular-nums text-foreground">{currentDateTime(timezone)}</span>
                  {statusPill}
                </div>
              </div>
            )}
            {[...hours].sort((a, b) => ((a.day_of_week + 6) % 7) - ((b.day_of_week + 6) % 7)).map((hour) => {
              const localOpen = hour.is_closed ? null : londonTimeToDate(hour.day_of_week, hour.open_time);
              const localClose = hour.is_closed ? null : londonTimeToDate(hour.day_of_week, hour.close_time);
              const localFormat = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "numeric", minute: "2-digit", hour12: true });
              const officeDate = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short" })
                .format(londonTimeToDate(hour.day_of_week, hour.is_closed ? "00:00" : hour.open_time));
              const userDateFormat = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, day: "numeric", month: "short" });
              const userOpenDate = userDateFormat.format(localOpen ?? londonTimeToDate(hour.day_of_week, "00:00"));
              const userCloseDate = localClose ? userDateFormat.format(localClose) : userOpenDate;
              const userDate = userOpenDate === userCloseDate ? userOpenDate : `${userOpenDate}–${userCloseDate}`;
              return (
                <div key={hour.day_of_week} className="contents">
                  <div className="border-b border-border/50 px-3 py-2 font-medium last:border-b-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span>{OFFICE_DAY_NAMES[hour.day_of_week]}</span>
                      <span className="text-[11px] font-normal text-muted-foreground">{officeDate}</span>
                    </div>
                  </div>
                  <div className="border-b border-l border-border/50 px-3 py-2 text-muted-foreground">
                    {hour.is_closed ? "Closed" : `${formatOfficeTime(hour.open_time)}–${formatOfficeTime(hour.close_time)}`}
                  </div>
                  {showUserColumn && (
                    <div className="border-b border-l border-border/50 px-3 py-2 text-muted-foreground">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[11px] text-muted-foreground">{userDate}</span>
                        <span>{hour.is_closed || !localOpen || !localClose ? "Closed" : `${localFormat.format(localOpen)}–${localFormat.format(localClose)}`}</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
