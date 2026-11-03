import { useEffect, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowUp, Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { INSTALL_TABS, INSTALL_TAB_ORDER_KEY, moveTab, resolveInstallTabOrder, type InstallTabKey } from "@/lib/install-guide-tab-order";

export function InstallGuideTabOrderCard({ onBack }: { onBack: () => void }) {
  const qc = useQueryClient();
  const [order, setOrder] = useState<InstallTabKey[] | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void supabase.from("app_settings").select("value").eq("key", INSTALL_TAB_ORDER_KEY).maybeSingle()
      .then(({ data }) => setOrder(resolveInstallTabOrder(data?.value)));
  }, []);

  const save = async (next: InstallTabKey[]) => {
    const prev = order;
    setOrder(next);
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("app_settings").upsert({
      key: INSTALL_TAB_ORDER_KEY, value: next, updated_by: u.user?.id, updated_at: new Date().toISOString(),
    });
    setSaving(false);
    if (error) { setOrder(prev); toast.error("Couldn't save the order"); return; }
    void qc.invalidateQueries({ queryKey: ["install-guides-tab-order"] });
  };

  const label = (k: InstallTabKey) => INSTALL_TABS.find((t) => t.key === k)?.label ?? k;

  return (
    <div className="max-w-2xl space-y-4">
      <Button variant="outline" size="sm" onClick={onBack}><ArrowLeft className="size-4" /> Back</Button>
      <div className="rounded-lg border border-border bg-surface/70 p-5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-lg font-bold">Install Guides pills</h2>
          {saving && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">Use the arrows to change the order of the pills everyone sees on Install Guides. Saved straight away.</p>
        {!order ? (
          <Loader2 className="mt-4 size-5 animate-spin" />
        ) : (
          <ol className="mt-4 space-y-2">
            {order.map((k, i) => (
              <li key={k} className="flex items-center gap-2 rounded-md border border-border bg-background/60 px-3 py-2">
                <span className="w-6 text-sm text-muted-foreground">{i + 1}.</span>
                <span className="min-w-0 flex-1 text-sm font-medium">{label(k)}</span>
                <Button size="icon" variant="outline" aria-label={`Move ${label(k)} up`} disabled={i === 0 || saving} onClick={() => save(moveTab(order, i, -1))}><ArrowUp className="size-4" /></Button>
                <Button size="icon" variant="outline" aria-label={`Move ${label(k)} down`} disabled={i === order.length - 1 || saving} onClick={() => save(moveTab(order, i, 1))}><ArrowDown className="size-4" /></Button>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
