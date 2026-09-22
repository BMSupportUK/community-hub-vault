import { useEffect, useState } from "react";

/**
 * England & Wales public (bank) holidays, straight from the official GOV.UK feed.
 * Office hours treat any of these dates as closed, automatically.
 */
const FEED_URL = "https://www.gov.uk/bank-holidays.json";
const CACHE_KEY = "uk-bank-holidays-cache-v1";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export type BankHolidayMap = Record<string, string>; // "2026-12-25" -> "Christmas Day"

let memoryCache: BankHolidayMap | null = null;
let inFlight: Promise<BankHolidayMap> | null = null;

/** yyyy-mm-dd for a moment, in the given timezone (defaults to UK). */
export function londonDateKey(date: Date, timeZone = "Europe/London") {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function readStored(): BankHolidayMap | null {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at: number; map: BankHolidayMap };
    if (!parsed?.map || Date.now() - parsed.at > CACHE_TTL_MS) return null;
    return parsed.map;
  } catch {
    return null;
  }
}

function store(map: BankHolidayMap) {
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), map }));
  } catch {
    /* private browsing — memory cache still applies */
  }
}

export async function fetchUkBankHolidays(): Promise<BankHolidayMap> {
  if (memoryCache) return memoryCache;
  const stored = readStored();
  if (stored) {
    memoryCache = stored;
    return stored;
  }
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const response = await fetch(FEED_URL, { cache: "no-store" });
      if (!response.ok) throw new Error(`Bank holiday feed ${response.status}`);
      const data = (await response.json()) as {
        "england-and-wales"?: { events?: { date: string; title: string }[] };
      };
      const map: BankHolidayMap = {};
      for (const event of data["england-and-wales"]?.events ?? []) {
        if (event?.date) map[event.date] = event.title ?? "Public holiday";
      }
      memoryCache = map;
      store(map);
      return map;
    } catch {
      return memoryCache ?? {};
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

/** React hook: England & Wales bank holidays, refreshed once a day. */
export function useUkBankHolidays(): BankHolidayMap {
  const [holidays, setHolidays] = useState<BankHolidayMap>(() => memoryCache ?? {});

  useEffect(() => {
    let active = true;
    const load = () => {
      void fetchUkBankHolidays().then((map) => {
        if (active) setHolidays(map);
      });
    };
    load();
    const id = window.setInterval(load, CACHE_TTL_MS);
    return () => {
      active = false;
      window.clearInterval(id);
    };
  }, []);

  return holidays;
}

/** Holiday name if that moment falls on an England & Wales public holiday (UK date). */
export function bankHolidayName(holidays: BankHolidayMap, date: Date) {
  return holidays[londonDateKey(date)] ?? null;
}
