import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, Plus, Save, Trash2, Package, ArrowUp, ArrowDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/_approved/admin-packages")({
  component: AdminPackagesPage,
});

interface Tier {
  id: string;
  name: string;
  tagline: string;
  features: string[];
  featured: boolean;
  sort_order: number;
}

function AdminPackagesPage() {
  const { hasAny } = useAuth();
  const isAdmin = hasAny(["admin", "management"]);
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("packages_tiers")
      .select("id, name, tagline, features, featured, sort_order")
      .order("sort_order");
    if (error) toast.error(error.message);
    setTiers((data ?? []) as Tier[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  if (!isAdmin) return <Navigate to="/home" />;

  const addTier = async () => {
    const { error } = await supabase.from("packages_tiers").insert({
      name: "New package",
      tagline: "",
      features: [],
      featured: false,
      sort_order: (tiers.at(-1)?.sort_order ?? 0) + 1,
    });
    if (error) return toast.error(error.message);
    toast.success("Package added");
    load();
  };

  const move = async (index: number, dir: -1 | 1) => {
    const a = tiers[index];
    const b = tiers[index + dir];
    if (!a || !b) return;
    await supabase.from("packages_tiers").update({ sort_order: b.sort_order }).eq("id", a.id);
    await supabase.from("packages_tiers").update({ sort_order: a.sort_order }).eq("id", b.id);
    load();
  };

  return (
    <main className="flex-1 overflow-y-auto">
      <div className="w-full px-6 py-8">
        <header className="flex items-center gap-3 mb-6">
          <div className="size-12 rounded-2xl bg-gradient-primary grid place-items-center shadow-glow">
            <Package className="size-6 text-primary-foreground" />
          </div>
          <div className="flex-1">
            <h1 className="font-display text-2xl font-bold">Support packages</h1>
            <p className="text-sm text-muted-foreground">Edit the price boxes shown on the public packages page.</p>
          </div>
          <button
            onClick={addTier}
            className="inline-flex items-center gap-2 text-sm px-3 py-2 rounded-md border border-border hover:bg-muted"
          >
            <Plus className="size-4" /> Add package
          </button>
        </header>

        {loading ? (
          <div className="grid place-items-center py-16 text-muted-foreground"><Loader2 className="size-5 animate-spin" /></div>
        ) : tiers.length === 0 ? (
          <p className="text-sm text-muted-foreground py-12 text-center">No packages yet — add your first one.</p>
        ) : (
          <div className="space-y-4">
            {tiers.map((t, i) => (
              <TierEditor key={t.id} tier={t} index={i} total={tiers.length} onSaved={load} onMove={move} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

function TierEditor({ tier, index, total, onSaved, onMove }: { tier: Tier; index: number; total: number; onSaved: () => void; onMove: (index: number, dir: -1 | 1) => void }) {
  const [name, setName] = useState(tier.name);
  const [tagline, setTagline] = useState(tier.tagline ?? "");
  const [features, setFeatures] = useState<string[]>(tier.features ?? []);
  const [featured, setFeatured] = useState(tier.featured);
  const [busy, setBusy] = useState(false);

  const save = async (patch?: Partial<Tier>) => {
    setBusy(true);
    const { error } = await supabase
      .from("packages_tiers")
      .update({
        name,
        tagline,
        features: features.filter((f) => f.trim().length > 0),
        featured,
        ...patch,
      })
      .eq("id", tier.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Saved");
    onSaved();
  };

  const remove = async () => {
    if (!confirm(`Delete "${tier.name}"?`)) return;
    const { error } = await supabase.from("packages_tiers").delete().eq("id", tier.id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    onSaved();
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Package name"
          className="flex-1 px-3 py-2 rounded-md bg-background border border-border font-semibold"
        />
        <button disabled={index === 0} onClick={() => onMove(index, -1)} className="p-2 rounded-md border border-border hover:bg-muted disabled:opacity-30" title="Move up">
          <ArrowUp className="size-4" />
        </button>
        <button disabled={index === total - 1} onClick={() => onMove(index, 1)} className="p-2 rounded-md border border-border hover:bg-muted disabled:opacity-30" title="Move down">
          <ArrowDown className="size-4" />
        </button>
        <button onClick={remove} className="p-2 rounded-md border border-border hover:bg-muted text-destructive" title="Delete">
          <Trash2 className="size-4" />
        </button>
      </div>

      <input
        value={tagline}
        onChange={(e) => setTagline(e.target.value)}
        placeholder="Tagline (e.g. For individuals trying our support out)"
        className="w-full px-3 py-2 rounded-md bg-background border border-border text-sm"
      />

      <div className="space-y-2">
        <div className="text-xs font-medium text-muted-foreground">Features</div>
        {features.map((f, i) => (
          <div key={i} className="flex gap-2">
            <input
              value={f}
              onChange={(e) => setFeatures(features.map((x, idx) => (idx === i ? e.target.value : x)))}
              className="flex-1 px-3 py-2 rounded-md bg-background border border-border text-sm"
            />
            <button
              onClick={() => setFeatures(features.filter((_, idx) => idx !== i))}
              className="p-2 rounded-md border border-border hover:bg-muted text-destructive"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        ))}
        <button
          onClick={() => setFeatures([...features, ""])}
          className="text-xs inline-flex items-center gap-1 px-2 py-1 rounded border border-border hover:bg-muted"
        >
          <Plus className="size-3" /> Add feature
        </button>
      </div>

      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={featured} onChange={(e) => setFeatured(e.target.checked)} />
          Featured (most popular)
        </label>
        <button
          onClick={() => save()}
          disabled={busy}
          className="ml-auto inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Save
        </button>
      </div>
    </div>
  );
}
