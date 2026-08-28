import {
  BadgeCheck,
  Check,
  CheckCircle2,
  Clock,
  CreditCard,
  Loader2,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type PayCheckPhase =
  | "awaiting"
  | "checking_stripe"
  | "checking_square"
  | "confirmed"
  | "failed";

export function PaymentStatusTimeline({ phase }: { phase: PayCheckPhase }) {
  const flow = ["awaiting", "checking_stripe", "checking_square"] as const;
  const currentIdx = flow.indexOf(phase as (typeof flow)[number]);
  const failed = phase === "failed";

  const steps: {
    key: string;
    title: string;
    desc: string;
    icon: typeof Clock;
    state: "done" | "active" | "upcoming" | "failed";
  }[] = [
    {
      key: "awaiting",
      title: "Awaiting payment",
      desc: "Order placed — pay via Square, Stripe or USDT.",
      icon: Clock,
      state: phase === "awaiting" ? "active" : "done",
    },
    {
      key: "checking_stripe",
      title: "Checking Stripe",
      desc: "Verifying your card payment with Stripe.",
      icon: CreditCard,
      state:
        phase === "checking_stripe"
          ? "active"
          : currentIdx > 0 || phase === "confirmed" || failed
            ? "done"
            : "upcoming",
    },
    {
      key: "checking_square",
      title: "Checking Square",
      desc: "No Stripe match — checking Square invoices.",
      icon: BadgeCheck,
      state:
        phase === "checking_square"
          ? "active"
          : phase === "confirmed" || failed
            ? "done"
            : "upcoming",
    },
    {
      key: "result",
      title: failed ? "Failed" : "Confirmed",
      desc: failed
        ? "No payment found yet — try again once it clears."
        : "Payment confirmed — order marked as paid.",
      icon: failed ? XCircle : CheckCircle2,
      state: failed ? "failed" : phase === "confirmed" ? "done" : "upcoming",
    },
  ];

  return (
    <div className="rounded-xl border border-border bg-surface-2/40 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-[0.14em] font-bold text-muted-foreground">
          Payment Status
        </span>
        <span
          className={cn(
            "text-[10px] font-bold uppercase tracking-wider",
            failed
              ? "text-destructive"
              : phase === "confirmed"
                ? "text-emerald-400"
                : "text-fuchsia-300",
          )}
        >
          {failed
            ? "Not found"
            : phase === "confirmed"
              ? "Paid"
              : phase === "awaiting"
                ? "Awaiting payment"
                : "Checking…"}
        </span>
      </div>
      <ol className="relative space-y-1.5">
        {steps.map((s, idx) => (
          <li key={s.key} className="relative">
            {idx < steps.length - 1 && (
              <span
                className={cn(
                  "absolute left-[15px] top-8 bottom-[-6px] w-0.5 rounded",
                  s.state === "done" ? "bg-emerald-500/50" : "bg-border",
                )}
              />
            )}
            <div
              className={cn(
                "relative flex items-center gap-2.5 rounded-lg border px-2.5 py-2 transition-all",
                s.state === "failed"
                  ? "border-destructive/50 bg-destructive/10"
                  : s.state === "done"
                    ? "border-emerald-500/40 bg-emerald-500/10"
                    : s.state === "active"
                      ? "border-fuchsia-400/60 bg-fuchsia-500/10 ring-1 ring-fuchsia-400/40"
                      : "border-border bg-surface-2/50 opacity-60",
              )}
            >
              <span
                className={cn(
                  "size-8 rounded-lg grid place-items-center shrink-0",
                  s.state === "failed"
                    ? "bg-destructive/20 text-destructive"
                    : s.state === "done"
                      ? "bg-emerald-500/20 text-emerald-400"
                      : s.state === "active"
                        ? "bg-fuchsia-500/20 text-fuchsia-300"
                        : "bg-surface-2 text-muted-foreground",
                )}
              >
                {s.state === "active" && s.key !== "awaiting" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : s.state === "done" ? (
                  <Check className="size-4" />
                ) : (
                  <s.icon className="size-4" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[12px] font-bold truncate flex items-center gap-1.5">
                  {s.title}
                  {s.state === "active" && (
                    <span className="size-1.5 rounded-full bg-fuchsia-400 animate-pulse" />
                  )}
                </div>
                <div className="text-[10px] text-muted-foreground truncate">{s.desc}</div>
              </div>
              {s.state === "active" && (
                <span className="text-[9px] font-bold uppercase tracking-wider text-fuchsia-300 shrink-0">
                  Now
                </span>
              )}
              {s.state === "failed" && (
                <span className="text-[9px] font-bold uppercase tracking-wider text-destructive shrink-0">
                  Failed
                </span>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
