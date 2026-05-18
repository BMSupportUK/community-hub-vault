import { useEffect, useState } from "react";
import { Loader2, X, Check, Sparkles } from "lucide-react";
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
      const { data: nps } = await supabase
        .from("nameplates")
        .select("id,name,description,image_url,gradient_css,animation_class,is_active,sort_order")
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
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/75 backdrop-blur-md p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-2xl bg-surface-1 border border-border/80 shadow-2xl shadow-black/40 overflow-hidden flex flex-col max-h-[88vh] animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="relative flex items-center justify-between px-6 py-4 border-b border-border bg-gradient-to-r from-primary/15 via-surface-1 to-surface-1">
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-lg bg-primary/20 text-primary grid place-items-center ring-1 ring-primary/30">
              <Sparkles className="size-4" />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-medium">
                Equip a nameplate
              </div>
              <h2 className="font-display font-bold text-lg leading-tight">Your collection</h2>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="size-8 grid place-items-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface-2 transition"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 flex-1 overflow-y-auto bg-surface-1">
          {/* No nameplate row */}
          <button
            onClick={() => equip(null)}
            disabled={saving}
            className={`w-full text-left rounded-xl border p-3 flex items-center gap-3 mb-4 transition ${
              currentId === null
                ? "border-primary ring-2 ring-primary/40 bg-primary/10"
                : "border-border hover:border-primary/50 hover:bg-surface-2"
            }`}
          >
            <div className="h-14 w-24 rounded-lg bg-gradient-to-br from-surface-2 to-surface-1 border border-dashed border-border grid place-items-center text-[10px] uppercase tracking-wider text-muted-foreground shrink-0">
              None
            </div>
            <div className="min-w-0">
              <div className="font-semibold text-sm">No nameplate</div>
              <div className="text-xs text-muted-foreground">Use a plain avatar with no decoration</div>
            </div>
            {currentId === null && (
              <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-primary bg-primary/15 px-2 py-1 rounded-full">
                <Check className="size-3" /> Equipped
              </span>
            )}
          </button>

          {loading ? (
            <div className="py-16 text-center">
              <Loader2 className="size-6 animate-spin inline text-muted-foreground" />
            </div>
          ) : rows.length === 0 ? (
            <div className="text-center text-xs text-muted-foreground py-12">
              No nameplates are available yet.
            </div>
          ) : (
            <>
              <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-medium mb-2 px-1">
                Available ({rows.length})
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {rows.map((r) => {
                  const selected = currentId === r.id;
                  return (
                    <button
                      key={r.id}
                      onClick={() => equip(r.id)}
                      disabled={saving}
                      className={`relative text-left rounded-xl border p-3 flex flex-col gap-2.5 transition group ${
                        selected
                          ? "border-primary ring-2 ring-primary/40 bg-primary/5"
                          : "border-border hover:border-primary/50 hover:bg-surface-2 hover:-translate-y-0.5"
                      }`}
                    >
                      <Nameplate
                        id={r.id}
                        className="h-16 w-full rounded-lg shadow-sm ring-1 ring-black/20"
                      />
                      <div className="min-w-0 flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-sm truncate">{r.name}</div>
                          {r.description && (
                            <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                              {r.description}
                            </div>
                          )}
                        </div>
                        {selected && (
                          <span className="shrink-0 size-5 rounded-full bg-primary text-primary-foreground grid place-items-center">
                            <Check className="size-3" />
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}