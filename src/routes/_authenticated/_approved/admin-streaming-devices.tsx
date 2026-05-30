import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Pencil, Trash2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  upsertStreamingDevice, deleteStreamingDevice, refreshStreamingPrices,
} from "@/lib/streaming-devices.functions";

export const Route = createFileRoute("/_authenticated/_approved/admin-streaming-devices")({
  component: AdminStreamingDevicesPage,
});

type DeviceRow = {
  id: string;
  name: string;
  brand: string | null;
  tier: "high" | "medium";
  image_url: string | null;
  summary: string | null;
  specs: Record<string, string> | null;
  sideload_notes: string | null;
  amazon_url: string;
  sort_order: number;
  is_active: boolean;
};

const SPEC_KEYS = ["cpu", "ram", "storage", "resolution", "hdr", "wifi", "ethernet", "remote", "os"] as const;

function emptyDraft(): Partial<DeviceRow> {
  return {
    name: "",
    brand: "",
    tier: "high",
    image_url: "",
    summary: "",
    specs: {},
    sideload_notes: "",
    amazon_url: "",
    sort_order: 100,
    is_active: true,
  };
}

function AdminStreamingDevicesPage() {
  const { hasAny } = useAuth();
  const isAdmin = hasAny(["admin", "management"]);
  const qc = useQueryClient();
  const upsert = useServerFn(upsertStreamingDevice);
  const remove = useServerFn(deleteStreamingDevice);
  const refresh = useServerFn(refreshStreamingPrices);
  const [draft, setDraft] = useState<Partial<DeviceRow> | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const list = useQuery({
    queryKey: ["admin-streaming-devices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("streaming_devices")
        .select("*")
        .order("tier")
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as DeviceRow[];
    },
    enabled: isAdmin,
  });

  if (!isAdmin) return <Navigate to="/home" />;

  const onSave = async () => {
    if (!draft) return;
    if (!draft.name || !draft.amazon_url || !draft.tier) {
      toast.error("Name, tier and Amazon URL are required");
      return;
    }
    try {
      await upsert({
        data: {
          id: draft.id,
          name: draft.name!,
          brand: draft.brand || null,
          tier: draft.tier as "high" | "medium",
          image_url: draft.image_url || null,
          summary: draft.summary || null,
          specs: draft.specs ?? {},
          sideload_notes: draft.sideload_notes || null,
          amazon_url: draft.amazon_url!,
          sort_order: draft.sort_order ?? 100,
          is_active: draft.is_active ?? true,
        },
      });
      toast.success("Saved");
      setDraft(null);
      qc.invalidateQueries({ queryKey: ["admin-streaming-devices"] });
      qc.invalidateQueries({ queryKey: ["streaming-devices"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    }
  };

  const onDelete = async (id: string) => {
    if (!confirm("Delete this device?")) return;
    try {
      await remove({ data: { id } });
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["admin-streaming-devices"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete");
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      const r = await refresh();
      toast.success(`Refreshed: ${r.updated} updated, ${r.failed} failed`);
      qc.invalidateQueries({ queryKey: ["streaming-device-prices"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Refresh failed");
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        <header className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">Streaming devices admin</h1>
            <p className="text-sm text-muted-foreground">Manage the device catalogue and refresh prices.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onRefresh} disabled={refreshing}>
              <RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} />
              Refresh prices now
            </Button>
            <Button onClick={() => setDraft(emptyDraft())}>
              <Plus className="size-4" /> New device
            </Button>
          </div>
        </header>

        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-left">
              <tr>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Tier</th>
                <th className="px-3 py-2">Sort</th>
                <th className="px-3 py-2">Active</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(list.data ?? []).map((d) => (
                <tr key={d.id} className="border-t border-border">
                  <td className="px-3 py-2">
                    <div className="font-medium">{d.name}</div>
                    <div className="text-xs text-muted-foreground">{d.brand}</div>
                  </td>
                  <td className="px-3 py-2 capitalize">{d.tier}</td>
                  <td className="px-3 py-2">{d.sort_order}</td>
                  <td className="px-3 py-2">{d.is_active ? "Yes" : "No"}</td>
                  <td className="px-3 py-2 text-right">
                    <Button size="sm" variant="ghost" onClick={() => setDraft(d)}>
                      <Pencil className="size-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => onDelete(d.id)}>
                      <Trash2 className="size-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Edit device" : "New device"}</DialogTitle>
          </DialogHeader>
          {draft && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Name</Label>
                  <Input value={draft.name ?? ""} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
                </div>
                <div>
                  <Label>Brand</Label>
                  <Input value={draft.brand ?? ""} onChange={(e) => setDraft({ ...draft, brand: e.target.value })} />
                </div>
                <div>
                  <Label>Tier</Label>
                  <Select value={draft.tier} onValueChange={(v) => setDraft({ ...draft, tier: v as "high" | "medium" })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="high">High spec</SelectItem>
                      <SelectItem value="medium">Medium spec</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Sort order</Label>
                  <Input type="number" value={draft.sort_order ?? 100} onChange={(e) => setDraft({ ...draft, sort_order: Number(e.target.value) })} />
                </div>
              </div>
              <div>
                <Label>Image URL</Label>
                <Input value={draft.image_url ?? ""} onChange={(e) => setDraft({ ...draft, image_url: e.target.value })} />
              </div>
              <div>
                <Label>Amazon URL</Label>
                <Input value={draft.amazon_url ?? ""} onChange={(e) => setDraft({ ...draft, amazon_url: e.target.value })} />
              </div>
              <div>
                <Label>Summary</Label>
                <Textarea rows={2} value={draft.summary ?? ""} onChange={(e) => setDraft({ ...draft, summary: e.target.value })} />
              </div>
              <div>
                <Label>Sideload notes</Label>
                <Textarea rows={2} value={draft.sideload_notes ?? ""} onChange={(e) => setDraft({ ...draft, sideload_notes: e.target.value })} />
              </div>
              <div>
                <Label>Specs</Label>
                <div className="grid grid-cols-2 gap-2">
                  {SPEC_KEYS.map((k) => (
                    <div key={k}>
                      <Label className="text-xs capitalize text-muted-foreground">{k}</Label>
                      <Input
                        value={(draft.specs ?? {})[k] ?? ""}
                        onChange={(e) => setDraft({ ...draft, specs: { ...(draft.specs ?? {}), [k]: e.target.value } })}
                      />
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={draft.is_active ?? true} onCheckedChange={(v) => setDraft({ ...draft, is_active: v })} />
                <Label>Active (visible to users)</Label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>Cancel</Button>
            <Button onClick={onSave}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}