import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const CUSTOMER_ROLES = [
  { role: "member", label: "Member" },
  { role: "subscriber", label: "Subscriber" },
  { role: "nonsubscriber", label: "Non-subscriber" },
] as const;

/** Admin-only: customer roles that apply only while this profile is selected. */
export function ProfileRolesEditor({ ownerId, accountId }: { ownerId: string; accountId: string }) {
  const [roles, setRoles] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void supabase.rpc("admin_profile_roles" as never, { p_owner: ownerId } as never).then(({ data }) => {
      setRoles(((data as { credential_id: string; role: string }[] | null) ?? []).filter((r) => r.credential_id === accountId).map((r) => r.role));
    });
  }, [ownerId, accountId]);
  if (!roles) return null;
  const toggle = async (role: string) => {
    const next = roles.includes(role) ? roles.filter((r) => r !== role) : [...roles, role];
    setBusy(true);
    const { error } = await supabase.rpc("admin_set_profile_roles" as never, { p_credential: accountId, p_roles: next } as never);
    setBusy(false);
    if (error) return toast.error(error.message);
    setRoles(next);
    toast.success("Profile roles saved");
  };
  return (
    <div className="space-y-1">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Profile roles</div>
      <div className="flex flex-wrap gap-1.5">
        {CUSTOMER_ROLES.map((r) => {
          const on = roles.includes(r.role);
          return (
            <button key={r.role} type="button" disabled={busy} onClick={() => void toggle(r.role)} aria-pressed={on}
              className={`rounded-full border px-2 py-0.5 text-[11px] font-medium transition ${on ? "border-primary/50 bg-primary/15 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>
              {r.label}
            </button>
          );
        })}
      </div>
      {!roles.length && <p className="text-[11px] text-muted-foreground">None set — this profile uses the account's own customer roles.</p>}
    </div>
  );
}
