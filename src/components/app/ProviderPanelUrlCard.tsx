import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { getProviderPanelUrlHint, saveProviderPanelUrl } from "@/lib/provider-panel-url.functions";

/** Owner only. The saved address is scrambled and never sent to the browser; only a masked hint shows. */
export function ProviderPanelUrlCard() {
  const getHint = useServerFn(getProviderPanelUrlHint);
  const saveUrl = useServerFn(saveProviderPanelUrl);
  const [hint, setHint] = useState("");
  const [url, setUrl] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => { getHint().then((r) => setHint(r.hint)).catch(() => setHint("")); }, [getHint]);
  const save = async () => {
    setSaving(true);
    try { const r = await saveUrl({ data: { url } }); setHint(r.hint); setUrl(""); toast.success("Provider panel address saved"); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Could not save the address"); }
    finally { setSaving(false); }
  };
  return (
    <Card className="p-4 space-y-3">
      <div>
        <h3 className="font-semibold">Provider panel address</h3>
        <p className="text-sm text-muted-foreground">Used when creating and renewing accounts. Stored scrambled and hidden — type a new address to replace it.</p>
        {hint && <p className="text-sm mt-1">Current: <span className="font-mono">{hint}</span></p>}
      </div>
      <div className="flex gap-2">
        <Input type="password" autoComplete="off" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="New address (https://…)" />
        <Button onClick={save} disabled={saving || !url.trim()}>{saving ? "Saving…" : "Save"}</Button>
      </div>
    </Card>
  );
}
