import { useEffect, useState } from "react";
import { Loader2, X, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Nameplate } from "@/components/app/Nameplate";
import { primeNameplates, clearNameplateCache, type NameplateRow } from "@/lib/nameplates";

interface NameplatePickerProps {
  userId: string;
  currentId: string | null;
  onClose: () => void;
  onChange: (newId: string | null) => void;
}

export function NameplatePicker({ userId, currentId, onClose, onChange }: NameplatePickerProps) {
  const [rows, setRows] = useState<NameplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: unlocks } = await supabase
        .from("user_nameplates")
        .select("nameplate_id")
        .eq("user_id", userId);
      const ids = ((unlocks as { nameplate_id: string }[]) ?? []).map((u) => u.nameplate_id);
      if (ids.length === 0) { setRows([]); setLoading(false); return; }
      const { data: nps } = await supabase
        .from("nameplates")
        .select("id,name,description,image_url,gradient_css,is_active,sort_order")
        .in("id", ids)
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      const list = (nps as NameplateRow[]) ?? [];
      setRows(list);
      primeNameplates(list);
      setLoading(false);
    })();
  }, [userId]);

  const equip = async (id: string | null) => {
    setSaving(true);
    const { error } = await supabase.from("profiles").update({ equipped_nameplate_id: id }).eq("id", userId);
    setSaving(false);
    if (error) return toast.error(error.message);
    clearNameplateCache();
    toast.success(id ? "Nameplate equipped" : "Nameplate removed");
    onChange(id);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-surface-1 border border-border overflow-hidden flex flex-col max-h-[85vh]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <div>
            <div className="text-xs text-muted-foreground">Equip a nameplate</div>
            <h2 className="font-display font-bold">Your collection</h2>
          </div>
          <button onClick={onClose}><X className="size-4" /></button>
        </div>
        <div className="p-4 flex-1 overflow-y-auto space-y-3">
          <button
            onClick={() => equip(null)}
            disabled={saving}
            className={`w-full text-left rounded-xl border p-3 flex items-center gap-3 transition ${currentId === null ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"}`}
          >
            <div className="h-12 w-20 rounded-lg bg-surface-2 grid place-items-center text-xs text-muted-foreground shrink-0">None</div>
            <div className="text-sm">No nameplate</div>
            {currentId === null && <Check className="size-4 ml-auto text-primary" />}
          </button>

          {loading ? (
            <div className="py-10 text-center"><Loader2 className="size-5 animate-spin inline text-muted-foreground" /></div>
          ) : rows.length === 0 ? (
            <div className="text-center text-xs text-muted-foreground py-8">
              You don't have any nameplates yet. Ask an admin to grant you access.
            </div>
          ) : (
            rows.map((r) => (
              <button
                key={r.id}
                onClick={() => equip(r.id)}
                disabled={saving}
                className={`w-full text-left rounded-xl border p-3 flex items-center gap-3 transition ${currentId === r.id ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"}`}
              >
                <Nameplate id={r.id} className="h-12 w-20 rounded-lg shrink-0" />
                <div className="min-w-0">
                  <div className="font-medium text-sm truncate">{r.name}</div>
                  {r.description && <div className="text-xs text-muted-foreground truncate">{r.description}</div>}
                </div>
                {currentId === r.id && <Check className="size-4 ml-auto text-primary" />}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}