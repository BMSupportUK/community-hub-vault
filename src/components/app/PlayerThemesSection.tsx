import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

type Theme = { id: string; name: string; grp: string; image_path: string; enabled: boolean; sort: number };

/** Owner-only list of BM Player home-screen themes: switch off or delete any of them. */
export function PlayerThemesSection() {
  const [items, setItems] = useState<Theme[] | null>(null);
  const load = () => void supabase.from("player_themes").select("id, name, grp, image_path, enabled, sort").order("sort").then(({ data, error }) => {
    if (error) toast.error("Couldn't load themes"); setItems(data ?? []);
  });
  useEffect(load, []);

  const toggle = async (t: Theme, on: boolean) => {
    const { error } = await supabase.from("player_themes").update({ enabled: on }).eq("id", t.id);
    if (error) { toast.error("Couldn't save"); return; }
    setItems((l) => l?.map((x) => x.id === t.id ? { ...x, enabled: on } : x) ?? null);
    toast.success(on ? `${t.name} is offered again` : `${t.name} switched off`);
  };
  const remove = async (t: Theme) => {
    if (!confirm(`Delete the ${t.name} theme? Anyone using it goes back to the normal look.`)) return;
    const { error } = await supabase.from("player_themes").delete().eq("id", t.id);
    if (error) { toast.error("Couldn't delete"); return; }
    setItems((l) => l?.filter((x) => x.id !== t.id) ?? null);
    toast.success(`${t.name} deleted`);
  };

  if (!items) return <p className="text-sm text-muted-foreground">Loading themes…</p>;
  return <section className="space-y-4">
    <p className="text-sm text-muted-foreground">Customers pick these in BM Player › Settings › Theme. Switched-off or deleted themes disappear from the apps within a few minutes, and anyone using one goes back to the normal look.</p>
    {items.length === 0 && <p className="text-sm text-muted-foreground">No themes left.</p>}
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {items.map((t) => <div key={t.id} className="overflow-hidden rounded-xl border border-border bg-surface">
        <img src={`/player-themes/${t.image_path}`} alt={`${t.name} theme picture`} loading="lazy" className={"aspect-video w-full object-cover" + (t.enabled ? "" : " opacity-40 grayscale")} />
        <div className="flex items-center gap-3 p-3">
          <div className="min-w-0 flex-1"><p className="truncate font-semibold">{t.name}</p><p className="text-xs text-muted-foreground">{t.grp} · {t.enabled ? "On" : "Off"}</p></div>
          <Switch aria-label={`Offer ${t.name}`} checked={t.enabled} onCheckedChange={(v) => void toggle(t, v)} />
          <Button size="icon" variant="outline" aria-label={`Delete ${t.name}`} onClick={() => void remove(t)}><Trash2 /></Button>
        </div>
      </div>)}
    </div>
  </section>;
}
