import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

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
  const missing = CUSTOMER_ROLES.filter((r) => !roles.includes(r.role));
  return (
    <div className="space-y-1">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Profile roles</div>
      <div className="flex flex-wrap items-center gap-1.5">
        {roles.map((role) => (
          <span key={role} className="inline-flex items-center gap-1 rounded-full border border-primary/50 bg-primary/15 px-2 py-0.5 text-[11px] font-medium text-primary">
            {CUSTOMER_ROLES.find((r) => r.role === role)?.label ?? role}
            <button type="button" disabled={busy} onClick={() => void toggle(role)} aria-label={`Remove ${role} role`} className="rounded-full hover:text-destructive"><X className="size-3" /></button>
          </span>
        ))}
        {!!missing.length && (
          <Popover>
            <PopoverTrigger asChild>
              <button type="button" disabled={busy} aria-label="Add a role to this profile" className="inline-flex size-6 items-center justify-center rounded-full border border-dashed border-border text-muted-foreground hover:text-foreground"><Plus className="size-3.5" /></button>
            </PopoverTrigger>
            <PopoverContent className="w-44 p-1" align="start">
              {missing.map((r) => (
                <button key={r.role} type="button" onClick={() => void toggle(r.role)} className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-accent">{r.label}</button>
              ))}
            </PopoverContent>
          </Popover>
        )}
      </div>
      {!roles.length && <p className="text-[11px] text-muted-foreground">No roles yet — press + to add one.</p>}
    </div>
  );
}
