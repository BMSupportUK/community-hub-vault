/** Shared guard for scheduled/background hook routes: only callers holding CRON_SECRET get through. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Handler = (ctx: any) => any;

export function cronDenied(request: Request): Response | null {
  const expected = process.env.CRON_SECRET;
  const provided = request.headers.get("x-cron-secret");
  if (!expected || !provided || provided !== expected) return new Response("Unauthorized", { status: 401 });
  return null;
}

export function withCron<T extends Record<string, Handler>>(handlers: T): T {
  const out: Record<string, Handler> = {};
  for (const [method, fn] of Object.entries(handlers)) {
    out[method] = (ctx) => cronDenied(ctx.request) ?? fn(ctx);
  }
  return out as T;
}
