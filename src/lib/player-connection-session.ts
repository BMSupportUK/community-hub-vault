/** Use the current validated presence, never the previous check-in's channel. */
export function connectionSession(device: { id: string; user_id: string | null; iptv_username: string | null }, presence: { watching_title: string | null; watching_kind: string | null; watching_since: string | null; watching_preview: boolean }, report: { login?: string; ping_ms?: number; speed_kbps?: number }) {
  if (!presence.watching_title || !presence.watching_since || presence.watching_preview) return null;
  return { _device: device.id, _user: device.user_id, _title: presence.watching_title, _kind: presence.watching_kind ?? '', _login: report.login ?? device.iptv_username ?? '', _started: presence.watching_since, _ping: report.ping_ms ?? null, _speed: report.speed_kbps ?? 0 };
}

/** Half-open UK calendar day, including the 23/25-hour DST change days. */
export function connectionDayRange(day: string) {
  const midnight = (date: string) => {
    const utc = Date.parse(`${date}T00:00:00Z`);
    const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', hourCycle: 'h23' }).format(new Date(utc)));
    return new Date(utc - hour * 3600000).toISOString();
  };
  const next = new Date(Date.parse(`${day}T12:00:00Z`) + 86400000).toISOString().slice(0, 10);
  return { from: midnight(day), to: midnight(next) };
}

export const CONNECTION_HISTORY_PAGE_SIZE = 5;