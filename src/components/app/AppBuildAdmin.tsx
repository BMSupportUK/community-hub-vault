import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Upload, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import {
  getCurrentAppBuild,
  saveAppBuild,
  updateAppBuild,
} from "@/lib/app-transfer.functions";

export function AppBuildAdmin() {
  const queryClient = useQueryClient();
  const fetchBuild = useServerFn(getCurrentAppBuild);
  const save = useServerFn(saveAppBuild);
  const update = useServerFn(updateAppBuild);

  const { data: build } = useQuery({
    queryKey: ["app-build"],
    queryFn: () => fetchBuild(),
    staleTime: 30_000,
  });

  const [uploading, setUploading] = useState(false);
  const [version, setVersion] = useState<string | null>(null);
  const [notes, setNotes] = useState<string | null>(null);
  const [savingMeta, setSavingMeta] = useState(false);

  const versionValue = version ?? build?.versionName ?? "";
  const notesValue = notes ?? build?.releaseNotes ?? "";

  const onUpload = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".apk")) {
      toast.error("Please choose an .apk file");
      return;
    }
    setUploading(true);
    try {
      const path = `${crypto.randomUUID()}.apk`;
      const { error } = await supabase.storage
        .from("app-builds")
        .upload(path, file, { contentType: "application/vnd.android.package-archive", upsert: false });
      if (error) throw error;
      await save({
        data: {
          filePath: path,
          fileName: file.name,
          fileSize: file.size,
          versionName: versionValue || null,
          releaseNotes: notesValue || null,
          isAvailable: true,
        },
      });
      await queryClient.invalidateQueries({ queryKey: ["app-build"] });
      toast.success("APK uploaded and set as the current build");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const onSaveMeta = async () => {
    if (!build) return;
    setSavingMeta(true);
    try {
      await update({
        data: { id: build.id, versionName: versionValue || null, releaseNotes: notesValue || null },
      });
      await queryClient.invalidateQueries({ queryKey: ["app-build"] });
      toast.success("Build details saved");
    } catch {
      toast.error("Couldn't save build details");
    } finally {
      setSavingMeta(false);
    }
  };

  const onToggle = async (value: boolean) => {
    if (!build) return;
    try {
      await update({ data: { id: build.id, isAvailable: value } });
      await queryClient.invalidateQueries({ queryKey: ["app-build"] });
    } catch {
      toast.error("Couldn't change availability");
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-display text-lg font-semibold text-foreground">Android app (APK)</h3>
            <p className="text-sm text-muted-foreground">
              {build ? `${build.fileName}${build.fileSize ? ` · ${(build.fileSize / 1048576).toFixed(1)} MB` : ""}` : "No APK uploaded yet."}
            </p>
          </div>
          {build && (
            <label className="flex items-center gap-2 text-sm text-foreground">
              <Switch checked={build.isAvailable} onCheckedChange={onToggle} />
              Available to members
            </label>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="apk-version">Version name</Label>
            <Input
              id="apk-version"
              value={versionValue}
              onChange={(e) => setVersion(e.target.value)}
              placeholder="e.g. BM Support 1.4.0"
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="apk-notes">Release notes</Label>
            <Textarea
              id="apk-notes"
              value={notesValue}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="What's new in this build"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button asChild variant="secondary" disabled={uploading}>
            <label className="cursor-pointer">
              {uploading ? <Loader2 className="size-4 mr-1 animate-spin" /> : <Upload className="size-4 mr-1" />}
              {build ? "Replace APK" : "Upload APK"}
              <input
                type="file"
                accept=".apk,application/vnd.android.package-archive"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onUpload(f);
                  e.target.value = "";
                }}
              />
            </label>
          </Button>
          {build && (
            <Button onClick={onSaveMeta} disabled={savingMeta}>
              {savingMeta ? <Loader2 className="size-4 mr-1 animate-spin" /> : <Save className="size-4 mr-1" />}
              Save details
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {uploading
            ? "Uploading — keep this tab open until it finishes."
            : "Choose a .apk file (up to 200 MB). Once uploaded it becomes the current build and members can request a secure 24-hour install link."}
        </p>
      </section>

    </div>
  );
}
