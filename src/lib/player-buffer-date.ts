export type BufferPeriod = { year: number; month?: number; day?: number };

/** Calendar ranges are UK dates; the reporting RPC converts midnight with UK DST. */
export function bufferDateRange(period: BufferPeriod): { _from: string; _to: string } {
  const month = period.month ?? 1;
  const day = period.day ?? 1;
  const from = new Date(Date.UTC(period.year, month - 1, day));
  const to = period.day !== undefined
    ? new Date(Date.UTC(period.year, month - 1, day + 1))
    : period.month !== undefined
      ? new Date(Date.UTC(period.year, month, 1))
      : new Date(Date.UTC(period.year + 1, 0, 1));
  return { _from: from.toISOString().slice(0, 10), _to: to.toISOString().slice(0, 10) };
}