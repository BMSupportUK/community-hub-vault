import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Check, Copy, Loader2, ShieldCheck } from "lucide-react";
import { getCheckoutAppLogin } from "@/lib/checkout.functions";

type AppAccount = {
  loginName: string;
  password: string;
  accountType: string | null;
  expiryAt: string | null;
};

function DetailRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 border-t border-border first:border-t-0">
      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
      <span className="font-mono text-sm ml-auto break-all text-right">{value}</span>
      <button
        type="button"
        onClick={() => { void navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
        className="inline-flex items-center gap-1 text-xs text-primary hover:underline shrink-0"
      >
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

/**
 * The customer's app login details on their secure order page. They are only
 * offered once the team has confirmed account setup; before that the card
 * explains the account is still being prepared.
 */
export function OrderAppLogin({ token, password }: { token: string; password: string }) {
  const fetchLogin = useServerFn(getCheckoutAppLogin);
  const [state, setState] = useState<"hidden" | "loading" | "ready" | "pending">("hidden");
  const [accounts, setAccounts] = useState<AppAccount[]>([]);

  const reveal = async () => {
    setState("loading");
    try {
      const result = await fetchLogin({ data: { token, password } });
      if (result.ok && result.ready && result.accounts.length) {
        setAccounts(result.accounts);
        setState("ready");
      } else {
        setState("pending");
      }
    } catch {
      setState("pending");
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">Use these to sign in to the BM Support app on your device.</p>
      {state === "ready" ? (
        <div className="space-y-3">
          {accounts.map((account, index) => (
            <div key={`${account.loginName}-${index}`} className="rounded-xl border border-border bg-background px-3">
              <DetailRow label="App login name" value={account.loginName} />
              <DetailRow label="Password" value={account.password} />
              {account.accountType ? <DetailRow label="Account type" value={account.accountType} /> : null}
              {account.expiryAt ? (
                <DetailRow
                  label="Expires"
                  value={new Date(account.expiryAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                />
              ) : null}
            </div>
          ))}
          <p className="text-xs text-muted-foreground">Keep these private — anyone who has them can use your subscription.</p>
        </div>
      ) : state === "pending" ? (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Your login details aren't ready yet — the team is still setting your account up. This page updates automatically, so try again in a moment.</p>
          <button type="button" onClick={() => void reveal()} className="w-full h-10 rounded-xl border border-border bg-background text-sm font-semibold hover:bg-muted inline-flex items-center justify-center gap-2">
            Check again
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={state === "loading"}
          onClick={() => void reveal()}
          className="w-full h-11 px-5 rounded-xl bg-primary text-primary-foreground font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {state === "loading" ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
          View app login details
        </button>
      )}
    </div>
  );
}
