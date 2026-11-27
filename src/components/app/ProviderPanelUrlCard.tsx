import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { normalisePanelUrl } from "@/lib/provider-panel-url";

export function ProviderPanelUrlCard() {
  const [url, setUrl] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => { void (async () => {
    const { data } = await supabase.from("app_settings").select("value").eq("key", "provider_panel_url").maybeSingle();
    const v = (data?.value as { url?: string } | null)?.url;
    if (v) setUrl(v);
  })(); }, []);
  const save = async () => {
    const clean = normalisePanelUrl(url);
    if (!clean) { toast.error("Enter a full address starting with https://"); return; }
    setSaving(true);
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase.from("app_settings").upsert({ key: "provider_panel_url", value: { url: clean } as never, updated_at: new Date().toISOString(), updated_by: auth.user?.id ?? null });
    setSaving(false);
    if (error) toast.error(error.message); else { setUrl(clean); toast.success("Provider panel address saved"); }
  };
  return (
    <Card className="p-4 space-y-3">
      <div>
        <h3 className="font-semibold">Provider panel address</h3>
        <p className="text-sm text-muted-foreground">Used when creating and renewing accounts on the provider panel.</p>
      </div>
      <div className="flex gap-2">
        <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://footballfantasy26.com" />
        <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
      </div>
    </Card>
  );
}
