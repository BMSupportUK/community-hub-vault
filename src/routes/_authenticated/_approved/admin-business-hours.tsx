import { createFileRoute, Navigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Clock, Loader2, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { isAdminUnlocked } from "@/lib/admin-unlock";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/_approved/admin-business-hours")({
  component: AdminBusinessHours,
});

interface Row {
  day_of_week: number;
  is_closed: boolean;
  open_time: string;
  close_time: string;
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function normTime(t: string) {
  return t.length >= 5 ? t.slice(0, 5) : t;
}

function AdminBusinessHours() {
  const { hasAny, user } = useAuth();
  const isAdmin = hasAny(["admin", "management"]);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("business_hours")
        .select("day_of_week, is_closed, open_time, close_time")
        .order("day_of_week");
      if (error) { toast.error(error.message); return; }
      const map = new Map<number, Row>();
      (data ?? []).forEach((r: any) => map.set(r.day_of_week, { ...r, open_time: normTime(r.open_time), close_time: normTime(r.close_time) }));
      const full: Row[] = [];
      for (let i = 0; i < 7; i++) {
        full.push(map.get(i) ?? { day_of_week: i, is_closed: i === 0 || i === 6, open_time: "09:00", close_time: "17:00" });
      }
      setRows(full);
    })();
  }, []);

  const update = (dow: number, patch: Partial<Row>) => {
    setRows((prev) => prev?.map((r) => (r.day_of_week === dow ? { ...r, ...patch } : r)) ?? null);
  };

  const save = async () => {
    if (!rows || !user) return;
    setSaving(true);
    try {
      const payload = rows.map((r) => ({
        day_of_week: r.day_of_week,
        is_closed: r.is_closed,
        open_time: r.open_time,
        close_time: r.close_time,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      }));
      const { error } = await supabase.from("business_hours").upsert(payload as never, { onConflict: "day_of_week" });
      if (error) throw error;
      toast.success("Business hours saved");
    } catch (e: any) {
      toast.error(e.message ?? "Failed to save");
    } finally { setSaving(false); }
  };

  if (!isAdmin) return <Navigate to="/home" />;
  if (!isAdminUnlocked(user?.id)) {
    return <Navigate to="/admin" search={{ next: "/admin-business-hours" } as never} />;
  }

  return (
    <main className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-8">
        <Link to="/admin" className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground mb-4">
          <ArrowLeft className="size-3.5" /> Back to admin
        </Link>
        <div className="rounded-2xl border border-border bg-surface-1 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="size-10 rounded-xl bg-primary/15 text-primary grid place-items-center">
              <Clock className="size-5" />
            </div>
            <div>
              <h1 className="font-display text-xl font-bold">Business hours</h1>
              <p className="text-xs text-muted-foreground">
                Set the days and times you're open. Orders and tickets created outside these hours
                will receive an automatic out-of-hours reply.
              </p>
            </div>
          </div>

          {!rows ? (
            <div className="grid place-items-center py-10 text-muted-foreground"><Loader2 className="size-5 animate-spin" /></div>
          ) : (
            <div className="space-y-2">
              {rows.map((r) => (
                <div key={r.day_of_week} className="grid grid-cols-1 sm:grid-cols-[120px_auto_1fr_auto_1fr] gap-2 sm:gap-3 items-center rounded-lg border border-border bg-background p-3">
                  <div className="font-medium text-sm">{DAY_NAMES[r.day_of_week]}</div>
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={r.is_closed}
                      onChange={(e) => update(r.day_of_week, { is_closed: e.target.checked })}
                    />
                    Closed
                  </label>
                  <input
                    type="time"
                    value={r.open_time}
                    disabled={r.is_closed}
                    onChange={(e) => update(r.day_of_week, { open_time: e.target.value })}
                    className="px-2 py-1.5 rounded-md bg-surface-2 border border-border text-sm disabled:opacity-50"
                  />
                  <span className="text-xs text-muted-foreground text-center">to</span>
                  <input
                    type="time"
                    value={r.close_time}
                    disabled={r.is_closed}
                    onChange={(e) => update(r.day_of_week, { close_time: e.target.value })}
                    className="px-2 py-1.5 rounded-md bg-surface-2 border border-border text-sm disabled:opacity-50"
                  />
                </div>
              ))}
              <div className="pt-3 flex justify-end">
                <button
                  onClick={save}
                  disabled={saving}
                  className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-60 flex items-center gap-2"
                >
                  {saving ? <Loader2 className="size-4 animate-spin" /> : null}
                  Save business hours
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}