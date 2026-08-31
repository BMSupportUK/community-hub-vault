import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Landmark, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import {
  getBankTransferAdminData,
  grantBankTransfer,
  revokeBankTransfer,
  saveBankTransferDetails,
  searchUsersForBankTransfer,
} from "@/lib/bank-transfer.functions";

type Grant = {
  id: string;
  user_id: string;
  granted_by: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  note: string | null;
  created_at: string;
};

const blank = {
  account_name: "",
  sort_code: "",
  account_number: "",
  iban: "",
  bic: "",
  reference_prefix: "BM",
  instructions: "",
};

/** Owner-only: bank account details + which customers may pay by bank transfer. */
export function BankTransferAdminCard() {
  const { hasRole } = useAuth();
  const isOwner = hasRole("admin");

  const loadData = useServerFn(getBankTransferAdminData);
  const save = useServerFn(saveBankTransferDetails);
  const search = useServerFn(searchUsersForBankTransfer);
  const grant = useServerFn(grantBankTransfer);
  const revoke = useServerFn(revokeBankTransfer);

  const [form, setForm] = useState(blank);
  const [grants, setGrants] = useState<Grant[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Array<{ id: string; display_name: string | null }>>([]);
  const [expiry, setExpiry] = useState("");

  const load = async () => {
    try {
      const res: any = await loadData({});
      setForm({
        account_name: res?.details?.account_name ?? "",
        sort_code: res?.details?.sort_code ?? "",
        account_number: res?.details?.account_number ?? "",
        iban: res?.details?.iban ?? "",
        bic: res?.details?.bic ?? "",
        reference_prefix: res?.details?.reference_prefix ?? "BM",
        instructions: res?.details?.instructions ?? "",
      });
      setGrants((res?.grants ?? []) as Grant[]);
      setNames((res?.names ?? {}) as Record<string, string>);
    } catch (e: any) {
      toast.error(e?.message ?? "Could not load bank transfer settings");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOwner) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOwner]);

  if (!isOwner) return null;

  const doSave = async () => {
    setBusy(true);
    try {
      await save({
        data: {
          account_name: form.account_name,
          sort_code: form.sort_code,
          account_number: form.account_number,
          iban: form.iban || null,
          bic: form.bic || null,
          reference_prefix: form.reference_prefix || "BM",
          instructions: form.instructions || null,
        },
      });
      toast.success("Bank details saved");
    } catch (e: any) {
      toast.error(e?.message ?? "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const doSearch = async (q: string) => {
    setQuery(q);
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    try {
      const res: any = await search({ data: { query: q.trim() } });
      setResults(res?.users ?? []);
    } catch {
      setResults([]);
    }
  };

  const doGrant = async (userId: string) => {
    setBusy(true);
    try {
      await grant({
        data: { userId, expiresAt: expiry ? new Date(expiry).toISOString() : null, note: null },
      });
      toast.success("Bank transfer enabled for this customer");
      setQuery("");
      setResults([]);
      setExpiry("");
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not grant access");
    } finally {
      setBusy(false);
    }
  };

  const doRevoke = async (userId: string) => {
    setBusy(true);
    try {
      await revoke({ data: { userId } });
      toast.success("Access removed");
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not remove access");
    } finally {
      setBusy(false);
    }
  };

  const input =
    "w-full px-3 py-2 rounded-lg bg-surface-2 border border-border text-sm";

  return (
    <section className="rounded-2xl border border-border bg-surface-1 p-5 space-y-4">
      <div className="flex items-center gap-3">
        <div className="size-10 rounded-xl bg-emerald-500/15 text-emerald-400 grid place-items-center">
          <Landmark className="size-5" />
        </div>
        <div>
          <h2 className="font-display font-bold">Bank transfer</h2>
          <p className="text-xs text-muted-foreground">
            Owner only. Bank details are never shown to staff or members without access.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading…
        </div>
      ) : (
        <>
          <div className="space-y-2">
            <input
              className={input}
              placeholder="Account name"
              value={form.account_name}
              onChange={(e) => setForm({ ...form, account_name: e.target.value })}
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                className={input}
                placeholder="Sort code"
                value={form.sort_code}
                onChange={(e) => setForm({ ...form, sort_code: e.target.value })}
              />
              <input
                className={input}
                placeholder="Account number"
                value={form.account_number}
                onChange={(e) => setForm({ ...form, account_number: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                className={input}
                placeholder="IBAN (optional)"
                value={form.iban}
                onChange={(e) => setForm({ ...form, iban: e.target.value })}
              />
              <input
                className={input}
                placeholder="BIC (optional)"
                value={form.bic}
                onChange={(e) => setForm({ ...form, bic: e.target.value })}
              />
            </div>
            <input
              className={input}
              placeholder="Reference prefix (e.g. BM)"
              value={form.reference_prefix}
              onChange={(e) => setForm({ ...form, reference_prefix: e.target.value })}
            />
            <textarea
              className={`${input} min-h-[70px]`}
              placeholder="Extra instructions shown to the customer (optional)"
              value={form.instructions}
              onChange={(e) => setForm({ ...form, instructions: e.target.value })}
            />
            <button
              onClick={doSave}
              disabled={busy}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-60"
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              Save bank details
            </button>
          </div>

          <div className="pt-2 border-t border-border space-y-2">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Customers allowed to pay by bank transfer
            </div>
            <input
              className={input}
              placeholder="Search member by display name…"
              value={query}
              onChange={(e) => void doSearch(e.target.value)}
            />
            <label className="block text-[11px] text-muted-foreground">
              Optional expiry
              <input
                type="date"
                className={`${input} mt-1`}
                value={expiry}
                onChange={(e) => setExpiry(e.target.value)}
              />
            </label>
            {results.length > 0 && (
              <div className="rounded-lg border border-border divide-y divide-border overflow-hidden">
                {results.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => void doGrant(u.id)}
                    disabled={busy}
                    className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-surface-2 disabled:opacity-60"
                  >
                    <span>{u.display_name ?? "Unknown"}</span>
                    <Plus className="size-4 text-emerald-400" />
                  </button>
                ))}
              </div>
            )}

            {grants.length === 0 ? (
              <p className="text-xs text-muted-foreground">No customers have bank transfer access yet.</p>
            ) : (
              <ul className="space-y-2">
                {grants.map((g) => {
                  const expired = g.expires_at ? new Date(g.expires_at) < new Date() : false;
                  return (
                    <li
                      key={g.id}
                      className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{names[g.user_id] ?? "Unknown"}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {g.expires_at
                            ? `${expired ? "Expired" : "Expires"} ${new Date(g.expires_at).toLocaleDateString("en-GB")}`
                            : "No expiry"}
                        </div>
                      </div>
                      <button
                        onClick={() => void doRevoke(g.user_id)}
                        disabled={busy}
                        className="p-2 rounded-lg text-destructive hover:bg-destructive/10 disabled:opacity-60"
                        aria-label="Remove access"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      )}
    </section>
  );
}
