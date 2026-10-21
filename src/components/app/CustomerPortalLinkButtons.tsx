import { useEffect, useState } from "react";
import { DoorOpen, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { canCopyPortal, canResetPortal } from "@/lib/customer-portal";

/** Copy (staff+) and reset (admin/management) a customer's personal portal link. */
export function CustomerPortalLinkButtons({ customerId, name }: { customerId: string; name: string }) {
  const [roles, setRoles] = useState<string[]>([]);
  useEffect(() => { void supabase.auth.getUser().then(async ({ data }) => {
    if (!data.user) return;
    const { data: r } = await supabase.from("user_roles").select("role").eq("user_id", data.user.id);
    setRoles((r ?? []).map((x) => x.role as string));
  }); }, []);
  if (!canCopyPortal(roles)) return null;
  const copy = async () => {
    const { data, error } = await supabase.rpc("admin_customer_portal_code", { p_user_id: customerId });
    if (error || !data) return toast.error("Couldn't get the portal link.");
    await navigator.clipboard.writeText(`${window.location.origin}/portal/${data}`);
    toast.success(`Portal link for ${name} copied`);
  };
  const reset = async () => {
    if (!window.confirm(`Reset ${name}'s portal link? The old link and any unused login links stop working.`)) return;
    const { data, error } = await supabase.rpc("admin_reset_customer_portal", { p_user_id: customerId });
    if (error || !data) return toast.error("Couldn't reset the portal link.");
    await navigator.clipboard.writeText(`${window.location.origin}/portal/${data}`);
    toast.success("New portal link copied");
  };
  return <>
    <Button variant="ghost" size="icon" className="shrink-0" title="Copy portal link" aria-label={`Copy portal link for ${name}`} onClick={() => void copy()}><DoorOpen className="size-4" /></Button>
    {canResetPortal(roles) && <Button variant="ghost" size="icon" className="shrink-0" title="Reset portal link" aria-label={`Reset portal link for ${name}`} onClick={() => void reset()}><RefreshCw className="size-4" /></Button>}
  </>;
}
