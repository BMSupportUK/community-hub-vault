import { useEffect, useState } from "react";
import { ArrowUp, ArrowDown, Save, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { RAIL_EDITOR_ITEMS, RAIL_ORDER_CHANGED, railOrderRows, sortRailItems } from "./rail-order";

type EditorItem = { id: string; label: string };
type Scope = "staff" | "member";

export function RailOrderEditor() {
  const { hasRole } = useAuth();
  const [scope, setScope] = useState<Scope>("staff");
  const [lists, setLists] = useState<Record<Scope, EditorItem[]>>({ staff: [...RAIL_EDITOR_ITEMS.staff], member: [...RAIL_EDITOR_ITEMS.member] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState<Record<Scope, boolean>>({ staff: false, member: false });
  const [loadError, setLoadError] = useState(false);
  const admin = hasRole("admin");

  useEffect(() => {
    if (!admin) return;
    let cancelled = false;
    void supabase.from("nav_order").select("key,sort_order").then(({ data, error }) => {
      if (cancelled) return;
      if (error) { setLoadError(true); toast.error("Could not load the saved icon order."); }
      else {
        const order = Object.fromEntries((data ?? []).map(row => [row.key, row.sort_order]));
        setLists({ staff: sortRailItems<EditorItem>(RAIL_EDITOR_ITEMS.staff, order, "staff", i => i.id), member: sortRailItems<EditorItem>(RAIL_EDITOR_ITEMS.member, order, "member", i => i.id) });
      }
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [admin]);

  if (!admin) return null;
  const move = (index: number, direction: number) => {
    const next = [...lists[scope]];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    const [item] = next.splice(index, 1);
    if (!item) return;
    next.splice(target, 0, item);
    setLists(prev => ({ ...prev, [scope]: next }));
    setDirty(prev => ({ ...prev, [scope]: true }));
  };
  const save = async () => {
    setSaving(true);
    const rows = railOrderRows(scope, lists[scope].map(item => item.id));
    const { error } = await supabase.from("nav_order").upsert(rows, { onConflict: "key" });
    if (error) toast.error("Could not save the icon order. Please try again.");
    else {
      setDirty(prev => ({ ...prev, [scope]: false }));
      window.dispatchEvent(new Event(RAIL_ORDER_CHANGED));
      toast.success(`${scope === "staff" ? "Staff" : "Customer"} icon order saved.`);
    }
    setSaving(false);
  };

  return (
    <section className="max-w-2xl space-y-4" aria-label="Side icon rail">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-xl font-bold">Side icon rail</h2>
        <Button onClick={save} disabled={loading || loadError || saving || !dirty[scope]}>
          {saving ? <Loader2 className="animate-spin" /> : <Save />}Save order
        </Button>
      </div>
      <div role="tablist" aria-label="Rail audience" className="flex gap-2">
        <Button role="tab" aria-selected={scope === "staff"} variant={scope === "staff" ? "default" : "outline"} disabled={saving} onClick={() => setScope("staff")}>Staff</Button>
        <Button role="tab" aria-selected={scope === "member"} variant={scope === "member" ? "default" : "outline"} disabled={saving} onClick={() => setScope("member")}>Users</Button>
      </div>
      {loading ? <Loader2 className="size-6 animate-spin text-muted-foreground" aria-label="Loading saved order" /> : loadError ? <p role="alert" className="text-destructive">Saved order unavailable. Refresh to try again.</p> : (
        <ol className="divide-y divide-border border-y border-border">
          {lists[scope].map((item, index) => (
            <li key={item.id} className="flex min-h-14 items-center gap-3 py-2">
              <span className="w-6 shrink-0 text-sm tabular-nums text-muted-foreground">{index + 1}</span>
              <span className="min-w-0 flex-1 font-medium">{item.label}</span>
              <Button size="icon" variant="outline" aria-label={`Move ${item.label} up`} title={`Move ${item.label} up`} disabled={saving || index === 0} onClick={() => move(index, -1)}><ArrowUp /></Button>
              <Button size="icon" variant="outline" aria-label={`Move ${item.label} down`} title={`Move ${item.label} down`} disabled={saving || index === lists[scope].length - 1} onClick={() => move(index, 1)}><ArrowDown /></Button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}