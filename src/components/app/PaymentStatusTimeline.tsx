import {
  BadgeCheck,
  Bitcoin,
  Check,
  CheckCircle2,
  Clock,
  CreditCard,
  Landmark,
  Loader2,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type PayCheckPhase =
  | "awaiting"
  | "checking_stripe"
  | "checking_square"
  | "awaiting_verification"
  | "confirmed"
  | "failed"
  | "cancelled";

export type PayMethod = "stripe" | "square" | "nowpayments" | "bank_transfer" | null;


type StepDef = {
  key: string;
  title: string;
  desc: string;
  icon: typeof Clock;
  state: "done" | "active" | "upcoming" | "failed";
};

export function PaymentStatusTimeline({
  phase,
  method = null,
  started = false,
}: {
  phase: PayCheckPhase;
  method?: PayMethod;
  started?: boolean;
}) {
  const failed = phase === "failed";
  const confirmed = phase === "confirmed";
  const cancelled = phase === "cancelled";
  const checking =
    !cancelled &&
    (phase === "checking_stripe" || phase === "checking_square" || phase === "awaiting_verification");
  const isBankTransfer = method === "bank_transfer";

  // Only surface the check step for the provider actually used on this order.
  const checkSteps: { key: string; title: string; desc: string; icon: typeof Clock }[] =
    method === "bank_transfer"
      ? [
          {
            key: "transfer_reported",
            title: "Transfer reported",
            desc: "You've told us the bank transfer has been sent.",
            icon: Landmark,
          },
          {
            key: "awaiting_verification",
            title: "Staff verification",
            desc: "We're checking the bank account for your reference.",
            icon: BadgeCheck,
          },
        ]
      : method === "stripe"
      ? [
          {
            key: "checking_stripe",
            title: "Checking Stripe",
            desc: "Verifying your card payment with Stripe.",
            icon: CreditCard,
          },
        ]
      : method === "square"
        ? [
            {
              key: "checking_square",
              title: "Checking invoice",
              desc: "Verifying your invoice payment.",
              icon: BadgeCheck,
            },
          ]
        : method === "nowpayments"
          ? [
              {
                key: "checking_crypto",
                title: "Crypto payment",
                desc: "USDT payment via NOWPayments.",
                icon: Bitcoin,
              },
            ]
          : [
              {
                key: "checking_payment",
                title: "Checking payment",
                desc: "Looking for your payment with our payment providers.",
                icon: CreditCard,
              },
            ];


  const showChecks = started || phase !== "awaiting";

  const bankTransferSteps: StepDef[] = [
    {
      key: "awaiting",
      title: cancelled ? "Order cancelled" : "Awaiting bank transfer",
      desc: cancelled
        ? "This order was cancelled — no payment is required."
        : "Use the bank details and quote your unique payment reference.",
      icon: cancelled ? XCircle : Landmark,
      state: cancelled ? "failed" : phase === "awaiting" ? "active" : "done",
    },
    ...(!cancelled
      ? [
          {
            key: "transfer_reported",
            title: "Transfer reported",
            desc: "The customer has confirmed the bank transfer was sent.",
            icon: CheckCircle2,
            state: (phase === "awaiting_verification" || confirmed || failed ? "done" : "upcoming") as StepDef["state"],
          },
          {
            key: "awaiting_verification",
            title: "Staff verification",
            desc: "Staff will check the bank account using the payment reference.",
            icon: BadgeCheck,
            state: (phase === "awaiting_verification"
              ? "active"
              : confirmed || failed
                ? "done"
                : "upcoming") as StepDef["state"],
          },
        ]
      : []),
    {
      key: "result",
      title: cancelled ? "Cancelled" : failed ? "Not verified" : "Payment confirmed",
      desc: cancelled
        ? "Order cancelled — no payment is required."
        : failed
          ? "The transfer has not been verified yet."
          : "Bank transfer verified — order marked as paid.",
      icon: cancelled || failed ? XCircle : CheckCircle2,
      state: cancelled || failed ? "failed" : confirmed ? "done" : "upcoming",
    },
  ];

  const standardSteps: StepDef[] = [
    {
      key: "awaiting",
      title: cancelled ? "Order cancelled" : "Awaiting payment",
      desc: cancelled
        ? "This order was cancelled — no payment is required."
        : method === "bank_transfer"
          ? "Order placed — send the bank transfer quoting your reference."
          : "Order placed — pay via Square, Stripe or USDT.",
      icon: cancelled ? XCircle : Clock,
      state: cancelled ? "failed" : phase === "awaiting" ? "active" : "done",
    },
    ...(showChecks && !cancelled
      ? checkSteps.map((c) => {
          // Only one check step is ever shown — the provider actually used.
          const state: StepDef["state"] = checking
            ? "active"
            : confirmed || failed
              ? "done"
              : "upcoming";
          return { ...c, state };
        })
      : []),

    {
      key: "result",
      title: cancelled ? "Cancelled" : failed ? "Failed" : "Confirmed",
      desc: cancelled
        ? "Order cancelled — no payment will be taken."
        : failed
          ? "No payment found yet — try again once it clears."
          : "Payment confirmed — order marked as paid.",
      icon: cancelled ? XCircle : failed ? XCircle : CheckCircle2,
      state: cancelled ? "failed" : failed ? "failed" : confirmed ? "done" : "upcoming",
    },
  ];
  const steps = isBankTransfer ? bankTransferSteps : standardSteps;

  return (
    <div className="rounded-xl border border-border bg-surface-2/40 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-[0.14em] font-bold text-muted-foreground">
          Payment Status
        </span>
        <span
          className={cn(
            "text-[10px] font-bold uppercase tracking-wider",
            cancelled || failed
              ? "text-destructive"
              : confirmed
                ? "text-emerald-400"
                : "text-fuchsia-300",
          )}
        >
          {cancelled
            ? "Cancelled"
            : failed
              ? "Not found"
              : confirmed
                ? "Paid"
                  : phase === "awaiting"
                   ? isBankTransfer
                     ? "Awaiting transfer"
                     : "Awaiting payment"
                  : phase === "awaiting_verification"
                    ? "Awaiting verification"
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
                <div className="text-[10px] leading-snug text-muted-foreground break-words">{s.desc}</div>
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
