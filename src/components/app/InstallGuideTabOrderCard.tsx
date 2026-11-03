import { useEffect, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowUp, Check, Loader2, Pencil, RotateCcw, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  INSTALL_TABS, INSTALL_TAB_LABELS_KEY, INSTALL_TAB_ORDER_KEY, installTabLabel, moveTab,
  resolveInstallTabLabels, resolveInstallTabOrder, type InstallTabKey, type InstallTabLabels,
} from "@/lib/install-guide-tab-order";

export function InstallGuideTabOrderCard({ onBack }: { onBack: () => void }) {
  const qc = useQueryClient();
  const [order, setOrder] = useState<InstallTabKey[] | null>(null);
  const [labels, setLabels] = useState<InstallTabLabels>({});
  const [editing, setEditing] = useState<InstallTabKey | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void supabase.from("app_settings").select("key, value").in("key", [INSTALL_TAB_ORDER_KEY, INSTALL_TAB_LABELS_KEY])
      .then(({ data }) => {
        setOrder(resolveInstallTabOrder(data?.find((r) => r.key === INSTALL_TAB_ORDER_KEY)?.value));
        setLabels(resolveInstallTabLabels(data?.find((r) => r.key === INSTALL_TAB_LABELS_KEY)?.value));
      });
  }, []);

  const write = async (key: string, value: unknown) => {
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("app_settings").upsert({
      key, value: value as never, updated_by: u.user?.id, updated_at: new Date().toISOString(),
    });
    setSaving(false);
    return !error;
  };

  const saveOrder = async (next: InstallTabKey[]) => {
    const prev = order;
    setOrder(next);
    if (!(await write(INSTALL_TAB_ORDER_KEY, next))) { setOrder(prev); toast.error("Couldn't save the order"); return; }
    void qc.invalidateQueries({ queryKey: ["install-guides-tab-order"] });
  };

  const saveLabel = async (k: InstallTabKey, name: string | null) => {
    const prev = labels;
    const next = { ...labels };
    if (name && name.trim()) next[k] = name.trim().slice(0, 80); else delete next[k];
    setLabels(next);
    setEditing(null);
    if (!(await write(INSTALL_TAB_LABELS_KEY, next))) { setLabels(prev); toast.error("Couldn't save the name"); return; }
    toast.success("Pill name saved");
    void qc.invalidateQueries({ queryKey: ["install-guides-tab-labels"] });
  };

  const defaultLabel = (k: InstallTabKey) => INSTALL_TABS.find((t) => t.key === k)?.label ?? k;

  return (
    <div className="max-w-2xl space-y-4">
      <Button variant="outline" size="sm" onClick={onBack}><ArrowLeft className="size-4" /> Back</Button>
      <div className="rounded-lg border border-border bg-surface/70 p-5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-lg font-bold">Install Guides pills</h2>
          {saving && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">Rename a pill with the pencil, or use the arrows to change the order everyone sees on Install Guides. Saved straight away.</p>
        {!order ? (
          <Loader2 className="mt-4 size-5 animate-spin" />
        ) : (
          <ol className="mt-4 space-y-2">
            {order.map((k, i) => {
              const name = installTabLabel(k, labels);
              return (
                <li key={k} className="flex items-center gap-2 rounded-md border border-border bg-background/60 px-3 py-2">
                  <span className="w-6 text-sm text-muted-foreground">{i + 1}.</span>
                  {editing === k ? (
                    <form className="flex min-w-0 flex-1 items-center gap-1" onSubmit={(e) => { e.preventDefault(); void saveLabel(k, draft); }}>
                      <Input autoFocus value={draft} maxLength={80} onChange={(e) => setDraft(e.target.value)} placeholder={defaultLabel(k)} className="h-8" />
                      <Button type="submit" size="icon" variant="outline" aria-label="Save name"><Check className="size-4" /></Button>
                      <Button type="button" size="icon" variant="ghost" aria-label="Cancel" onClick={() => setEditing(null)}><X className="size-4" /></Button>
                    </form>
                  ) : (
                    <>
                      <span className="min-w-0 flex-1 text-sm font-medium">
                        {name}
                        {labels[k] && <span className="block text-xs font-normal text-muted-foreground">Default: {defaultLabel(k)}</span>}
                      </span>
                      <Button size="icon" variant="outline" aria-label={`Rename ${name}`} disabled={saving} onClick={() => { setEditing(k); setDraft(name); }}><Pencil className="size-4" /></Button>
                      {labels[k] && <Button size="icon" variant="ghost" aria-label={`Reset ${name} name`} disabled={saving} onClick={() => saveLabel(k, null)}><RotateCcw className="size-4" /></Button>}
                    </>
                  )}
                  <Button size="icon" variant="outline" aria-label={`Move ${name} up`} disabled={i === 0 || saving} onClick={() => saveOrder(moveTab(order, i, -1))}><ArrowUp className="size-4" /></Button>
                  <Button size="icon" variant="outline" aria-label={`Move ${name} down`} disabled={i === order.length - 1 || saving} onClick={() => saveOrder(moveTab(order, i, 1))}><ArrowDown className="size-4" /></Button>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}
