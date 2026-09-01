import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Upload, Loader2, Save, Plus, Trash2, Film, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import {
  listAppBuildsAdmin,
  saveAppBuild,
  updateAppBuild,
  deleteAppBuild,
} from "@/lib/app-transfer.functions";

type Build = Awaited<ReturnType<typeof listAppBuildsAdmin>>[number];

async function uploadApk(file: File) {
  const path = `${crypto.randomUUID()}.apk`;
  const { error } = await supabase.storage
    .from("app-builds")
    .upload(path, file, {
      contentType: "application/vnd.android.package-archive",
      upsert: false,
    });
  if (error) throw error;
  return path;
}

async function uploadVideo(file: File) {
  const ext = file.name.split(".").pop()?.toLowerCase() || "mp4";
  const path = `builds/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from("app-demos")
    .upload(path, file, { contentType: file.type || "video/mp4", upsert: false });
  if (error) throw error;
  return path;
}

/** Editable card for one app in the store. */
function BuildCard({ build, onChanged }: { build: Build; onChanged: () => Promise<void> }) {
  const update = useServerFn(updateAppBuild);
  const remove = useServerFn(deleteAppBuild);
  const [appName, setAppName] = useState(build.appName ?? "");
  const [version, setVersion] = useState(build.versionName ?? "");
  const [notes, setNotes] = useState(build.releaseNotes ?? "");
  const [sortOrder, setSortOrder] = useState(String(build.sortOrder ?? 0));
  const [busy, setBusy] = useState<null | "save" | "apk" | "video" | "delete">(null);

  const patch = async (data: Parameters<typeof update>[0]["data"], msg?: string) => {
    await update({ data });
    await onChanged();
    if (msg) toast.success(msg);
  };

  const onSave = async () => {
    setBusy("save");
    try {
      await patch(
        {
          id: build.id,
          appName: appName || null,
          versionName: version || null,
          releaseNotes: notes || null,
          sortOrder: Number(sortOrder) || 0,
        },
        "App details saved",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save app details");
    } finally {
      setBusy(null);
    }
  };

  const onReplaceApk = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".apk")) {
      toast.error("Please choose an .apk file");
      return;
    }
    setBusy("apk");
    try {
      const path = await uploadApk(file);
      await patch(
        { id: build.id, filePath: path, fileName: file.name, fileSize: file.size },
        "APK replaced",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(null);
    }
  };

  const onSetVideo = async (file: File) => {
    if (!file.type.startsWith("video/")) {
      toast.error("Please choose a video file");
      return;
    }
    setBusy("video");
    try {
      const path = await uploadVideo(file);
      await patch({ id: build.id, videoPath: path }, "Video uploaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Video upload failed");
    } finally {
      setBusy(null);
    }
  };

  const onDelete = async () => {
    if (!window.confirm(`Delete "${build.appName || build.fileName}" from the store?`)) return;
    setBusy("delete");
    try {
      await remove({ data: { id: build.id } });
      await onChanged();
      toast.success("App removed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't remove the app");
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-display text-lg font-semibold text-foreground">
            {build.appName || build.fileName}
          </h3>
          <p className="text-sm text-muted-foreground">
            {build.fileName}
            {build.fileSize ? ` · ${(build.fileSize / 1048576).toFixed(1)} MB` : ""}
            {build.videoPath ? " · video attached" : ""}
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm text-foreground">
          <Switch
            checked={build.isAvailable}
            onCheckedChange={(v) => patch({ id: build.id, isAvailable: v }).catch(() => toast.error("Couldn't change availability"))}
          />
          Available to members
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label>App name</Label>
          <Input value={appName} onChange={(e) => setAppName(e.target.value)} placeholder="e.g. BM Player" />
        </div>
        <div>
          <Label>Version name</Label>
          <Input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="e.g. 1.4.0" />
        </div>
        <div>
          <Label>Order</Label>
          <Input
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
            className="max-w-[120px]"
          />
        </div>
        <div className="sm:col-span-2">
          <Label>Release notes</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="What's new in this build" />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={onSave} disabled={busy === "save"}>
          {busy === "save" ? <Loader2 className="size-4 mr-1 animate-spin" /> : <Save className="size-4 mr-1" />}
          Save details
        </Button>
        <Button asChild variant="secondary" disabled={busy === "apk"}>
          <label className="cursor-pointer">
            {busy === "apk" ? <Loader2 className="size-4 mr-1 animate-spin" /> : <Upload className="size-4 mr-1" />}
            Replace APK
            <input
              type="file"
              accept=".apk,application/vnd.android.package-archive"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onReplaceApk(f);
                e.target.value = "";
              }}
            />
          </label>
        </Button>
        <Button asChild variant="secondary" disabled={busy === "video"}>
          <label className="cursor-pointer">
            {busy === "video" ? <Loader2 className="size-4 mr-1 animate-spin" /> : <Film className="size-4 mr-1" />}
            {build.videoPath ? "Replace video" : "Upload video"}
            <input
              type="file"
              accept="video/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onSetVideo(f);
                e.target.value = "";
              }}
            />
          </label>
        </Button>
        {build.videoPath && (
          <Button
            variant="ghost"
            onClick={() => patch({ id: build.id, videoPath: null }, "Video removed").catch(() => toast.error("Couldn't remove the video"))}
          >
            <X className="size-4 mr-1" /> Remove video
          </Button>
        )}
        <Button variant="ghost" className="text-destructive" onClick={onDelete} disabled={busy === "delete"}>
          {busy === "delete" ? <Loader2 className="size-4 mr-1 animate-spin" /> : <Trash2 className="size-4 mr-1" />}
          Delete app
        </Button>
      </div>
    </section>
  );
}

/** Form for adding another app to the store. */
function NewBuildForm({ onCreated }: { onCreated: () => Promise<void> }) {
  const save = useServerFn(saveAppBuild);
  const [open, setOpen] = useState(false);
  const [appName, setAppName] = useState("");
  const [version, setVersion] = useState("");
  const [notes, setNotes] = useState("");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const onUpload = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".apk")) {
      toast.error("Please choose an .apk file");
      return;
    }
    setUploading(true);
    try {
      const path = await uploadApk(file);
      const videoPath = videoFile ? await uploadVideo(videoFile) : null;
      await save({
        data: {
          filePath: path,
          fileName: file.name,
          fileSize: file.size,
          appName: appName || null,
          versionName: version || null,
          releaseNotes: notes || null,
          videoPath,
          isAvailable: true,
        },
      });
      await onCreated();
      setAppName("");
      setVersion("");
      setNotes("");
      setVideoFile(null);
      setOpen(false);
      toast.success("App added to the store");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} className="bg-gradient-primary text-primary-foreground hover:opacity-90">
        <Plus className="size-4 mr-1" /> Add an app
      </Button>
    );
  }

  return (
    <section className="rounded-2xl border border-primary/40 bg-card p-5 space-y-4">
      <h3 className="font-display text-lg font-semibold text-foreground">Add an app</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="new-app-name">App name</Label>
          <Input id="new-app-name" value={appName} onChange={(e) => setAppName(e.target.value)} placeholder="e.g. BM Player" />
        </div>
        <div>
          <Label htmlFor="new-app-version">Version name</Label>
          <Input id="new-app-version" value={version} onChange={(e) => setVersion(e.target.value)} placeholder="e.g. 1.4.0" />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="new-app-notes">Release notes</Label>
          <Textarea id="new-app-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant="secondary" disabled={uploading}>
          <label className="cursor-pointer">
            <Film className="size-4 mr-1" />
            {videoFile ? "Video selected" : "Choose video (optional)"}
            <input
              type="file"
              accept="video/*"
              className="hidden"
              onChange={(e) => setVideoFile(e.target.files?.[0] ?? null)}
            />
          </label>
        </Button>
        {videoFile && (
          <span className="text-xs text-muted-foreground">
            {videoFile.name} · {(videoFile.size / 1048576).toFixed(1)} MB
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button asChild disabled={uploading} className="bg-gradient-primary text-primary-foreground hover:opacity-90">
          <label className="cursor-pointer">
            {uploading ? <Loader2 className="size-4 mr-1 animate-spin" /> : <Upload className="size-4 mr-1" />}
            Choose APK &amp; publish
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
        <Button variant="ghost" onClick={() => setOpen(false)} disabled={uploading}>
          Cancel
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        {uploading
          ? "Uploading — keep this tab open until it finishes."
          : "Choose a .apk file (up to 200 MB). Members can request a secure 24-hour install link per app."}
      </p>
    </section>
  );
}

export function AppBuildAdmin() {
  const queryClient = useQueryClient();
  const fetchBuilds = useServerFn(listAppBuildsAdmin);

  const { data: builds } = useQuery({
    queryKey: ["app-builds-admin"],
    queryFn: () => fetchBuilds(),
    staleTime: 30_000,
  });

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["app-builds-admin"] });
    await queryClient.invalidateQueries({ queryKey: ["app-builds"] });
    await queryClient.invalidateQueries({ queryKey: ["app-build"] });
  };

  return (
    <div className="space-y-6">
      <NewBuildForm onCreated={refresh} />
      {(builds ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">No apps in the store yet.</p>
      ) : (
        (builds ?? []).map((b) => <BuildCard key={b.id} build={b} onChanged={refresh} />)
      )}
    </div>
  );
}
