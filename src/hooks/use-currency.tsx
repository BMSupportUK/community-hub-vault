import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface CurrencySetting {
  code: string;
  symbol: string;
  locale: string;
}

const DEFAULT: CurrencySetting = { code: "GBP", symbol: "£", locale: "en-GB" };

let cache: CurrencySetting | null = null;
const listeners = new Set<(c: CurrencySetting) => void>();
let loaded = false;
let loading: Promise<void> | null = null;

function emit(c: CurrencySetting) {
  cache = c;
  listeners.forEach((l) => l(c));
}

async function load() {
  if (loading) return loading;
  loading = (async () => {
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "currency")
      .maybeSingle();
    const v = (data?.value as Partial<CurrencySetting> | null) ?? null;
    emit({
      code: v?.code || DEFAULT.code,
      symbol: v?.symbol || DEFAULT.symbol,
      locale: v?.locale || DEFAULT.locale,
    });
    loaded = true;
  })();
  return loading;
}

let channelStarted = false;
function startChannel() {
  if (channelStarted) return;
  channelStarted = true;
  supabase
    .channel("app_settings-currency")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "app_settings", filter: "key=eq.currency" },
      (payload) => {
        const v = ((payload.new as { value?: Partial<CurrencySetting> } | null)?.value) ?? null;
        if (!v) return;
        emit({
          code: v.code || DEFAULT.code,
          symbol: v.symbol || DEFAULT.symbol,
          locale: v.locale || DEFAULT.locale,
        });
      },
    )
    .subscribe();
}

export function useCurrency() {
  const [currency, setCurrency] = useState<CurrencySetting>(cache ?? DEFAULT);

  useEffect(() => {
    listeners.add(setCurrency);
    if (!loaded) load();
    startChannel();
    return () => {
      listeners.delete(setCurrency);
    };
  }, []);

  const format = (cents: number) => {
    try {
      return new Intl.NumberFormat(currency.locale, {
        style: "currency",
        currency: currency.code,
      }).format((cents || 0) / 100);
    } catch {
      return `${currency.symbol}${((cents || 0) / 100).toFixed(2)}`;
    }
  };

  return { currency, format, symbol: currency.symbol };
}