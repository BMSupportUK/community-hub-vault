import { useEffect, useRef, useState } from "react";
import { Loader2, Smartphone, Upload } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ANDROID_RELEASE } from "@/lib/android-release";

type Current = { path: string; version: string; size: number; uploaded_at: string; file_name: string };

export function AndroidApkUploadCard() {
  const { user } = useAuth();
  const [current, setCurrent] = useState<Current | null>(null);
  const [version, setVersion] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    const { data } = await supabase.from("app_settings").select("value").eq("key", "android_apk_upload").maybeSingle();
    setCurrent((data?.value as Current | null) ?? null);
  };
  useEffect(() => { void load(); }, []);

  const upload = async () => {
    if (!file || !user) return;
    if (!file.name.toLowerCase().endsWith(".apk")) { toast.error("Please choose an .apk file"); return; }
    if (!version.trim()) { toast.error("Enter the version number, e.g. 1.1.5"); return; }
    setBusy(true);
    try {
      const path = `releases/BMSupport-${version.trim().replace(/[^\w.-]/g, "")}-${Date.now()}.apk`;
      const { error } = await supabase.storage.from("android-app").upload(path, file, {
        contentType: "application/vnd.android.package-archive",
      });
      if (error) throw error;
      const value: Current = { path, version: version.trim(), size: file.size, uploaded_at: new Date().toISOString(), file_name: file.name };
      const { error: e2 } = await supabase.from("app_settings").upsert({ key: "android_apk_upload", value, updated_by: user.id, updated_at: new Date().toISOString() });
      if (e2) throw e2;
      toast.success("Uploaded — the download barcode now gives this version");
      setFile(null); setVersion("");
      if (fileRef.current) fileRef.current.value = "";
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-surface-1 p-5 space-y-4">
      <div className="flex items-center gap-3">
        <div className="size-10 rounded-xl bg-gradient-primary grid place-items-center text-primary-foreground"><Smartphone className="size-5" /></div>
        <div>
          <h2 className="font-display font-bold">Android app file</h2>
          <p className="text-xs text-muted-foreground">The "Get the Android app" barcode and download button always give the file uploaded here.</p>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-background/40 p-3 text-sm">
        <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Currently served</div>
        {current ? (
          <div>Version <b>{current.version}</b> · {(current.size / 1024 / 1024).toFixed(1)} MB · uploaded {new Date(current.uploaded_at).toLocaleString("en-GB")}</div>
        ) : (
          <div>Built-in version <b>{ANDROID_RELEASE.versionName}</b> (nothing uploaded yet)</div>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
        <div className="space-y-1">
          <Label htmlFor="apk-file">APK file</Label>
          <Input id="apk-file" ref={fileRef} type="file" accept=".apk,application/vnd.android.package-archive" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="apk-version">Version</Label>
          <Input id="apk-version" placeholder="1.1.5" value={version} onChange={(e) => setVersion(e.target.value)} />
        </div>
      </div>
      <Button onClick={upload} disabled={!file || busy} className="w-full">
        {busy ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Upload className="size-4 mr-2" />}
        {busy ? "Uploading…" : "Upload and make live"}
      </Button>
      <p className="text-xs text-muted-foreground">The file is stored privately — people can only get it through the app's download link, never by browsing storage.</p>
    </div>
  );
}
