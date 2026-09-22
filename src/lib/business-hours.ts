import { supabase } from "@/integrations/supabase/client";
import { bankHolidayName, fetchUkBankHolidays, londonDateKey } from "@/lib/uk-bank-holidays";
import { getAutomatedMessage } from "@/lib/automated-messages";

interface HourRow {
  day_of_week: number;
  open_time: string | null;
  close_time: string | null;
  is_closed: boolean | null;
}

const LONDON = "Europe/London";

function londonParts(date: Date) {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: LONDON,
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
  return parts as Record<string, string>;
}

function londonDayIndex(date: Date) {
  // 0 = Sunday, matching business_hours.day_of_week
  const name = new Intl.DateTimeFormat("en-GB", { timeZone: LONDON, weekday: "short" }).format(date);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(name);
}

/**
 * Human label for the next time the office opens, e.g.
 * "Tuesday 22 September at 09:00" — skips closed days and UK public holidays.
 */
export async function nextOpeningLabel(now = new Date()): Promise<string | null> {
  try {
    const [{ data }, holidays] = await Promise.all([
      supabase.from("business_hours").select("day_of_week, open_time, close_time, is_closed"),
      fetchUkBankHolidays(),
    ]);
    const hours = (data ?? []) as HourRow[];
    if (!hours.length) return null;

    const nowParts = londonParts(now);
    const nowMinutes = Number(nowParts.hour) * 60 + Number(nowParts.minute);

    for (let offset = 0; offset < 30; offset += 1) {
      const day = new Date(now.getTime() + offset * 24 * 60 * 60 * 1000);
      if (bankHolidayName(holidays, day)) continue;
      const row = hours.find((h) => h.day_of_week === londonDayIndex(day));
      if (!row || row.is_closed || !row.open_time) continue;
      const [h, m] = row.open_time.split(":");
      const openMinutes = Number(h) * 60 + Number(m ?? 0);
      if (offset === 0 && nowMinutes >= openMinutes) continue;
      const parts = londonParts(day);
      const time = `${String(h).padStart(2, "0")}:${String(m ?? "00").padStart(2, "0")}`;
      const when =
        londonDateKey(day) === londonDateKey(now)
          ? `today at ${time}`
          : `${parts.weekday} ${parts.day} ${parts.month} at ${time}`;
      return when;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Returns the out-of-hours message to post, or null if currently open.
 * UK public holidays always count as closed and get their own message.
 * Wording comes from the editable automated messages in the admin dashboard.
 */
export async function getOutOfHoursMessage(): Promise<string | null> {
  try {
    const holidays = await fetchUkBankHolidays();
    const holiday = bankHolidayName(holidays, new Date());
    if (holiday) {
      const reopen = (await nextOpeningLabel()) ?? "our next working day";
      return await getAutomatedMessage("ticket_bank_holiday", { holiday, reopen });
    }
    const { data, error } = await supabase.rpc("is_business_open");
    if (error) return null;
    if (data === true) return null;
    const reopen = (await nextOpeningLabel()) ?? "our next working day";
    return await getAutomatedMessage("ticket_out_of_hours", { reopen });
  } catch {
    return null;
  }
}
