import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { X, Upload, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { HtmlEditor } from "@/components/ui/html-editor";
import { toast } from "sonner";

type Category = { id: string; name: string };
type Blog = {
  id: string;
  category_id: string;
  title: string;
  excerpt: string | null;
  body: string | null;
  image_url: string | null;
  badge: string | null;
  published: boolean;
};

export function SportsGuideEditor({ blogId }: { blogId?: string }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [editing, setEditing] = useState<Blog | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const uploadCover = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be under 5MB");
      return;
    }
    setUploading(true);
    const ext = file.name.split(".").pop()?.toLowerCase() || "png";
    const path = `${user?.id ?? "anon"}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage
      .from("sports-guide-covers")
      .upload(path, file, { cacheControl: "3600", upsert: false, contentType: file.type });
    if (error) {
      setUploading(false);
      return toast.error(error.message);
    }
    const { data } = supabase.storage.from("sports-guide-covers").getPublicUrl(path);
    setEditing((e) => (e ? { ...e, image_url: data.publicUrl } : e));
    setUploading(false);
    toast.success("Cover uploaded");
  };

  useEffect(() => {
    (async () => {
      const { data: cats } = await supabase
        .from("sports_categories")
        .select("id, name")
        .order("sort_order");
      setCategories((cats ?? []) as Category[]);
      if (blogId) {
        const { data, error } = await supabase
          .from("sports_blogs")
          .select("*")
          .eq("id", blogId)
          .maybeSingle();
        if (error || !data) {
          toast.error(error?.message ?? "Blog not found");
          navigate({ to: "/sports-guides" });
          return;
        }
        setEditing(data as Blog);
      } else {
        setEditing({
          id: "",
          category_id: cats?.[0]?.id ?? "",
          title: "",
          excerpt: "",
          body: "",
          image_url: "",
          badge: "",
          published: true,
        });
      }
      setLoading(false);
    })();
  }, [blogId, navigate]);

  const close = () =>
    navigate({
      to: "/sports-guides",
      search: { cat: editing?.category_id || undefined },
    });

  const save = async () => {
    if (!editing) return;
    if (!editing.title.trim() || !editing.category_id) {
      toast.error("Title and category are required");
      return;
    }
    setSaving(true);
    const payload: {
      category_id: string;
      title: string;
      excerpt: string | null;
      body: string | null;
      image_url: string | null;
      badge: string | null;
      published: boolean;
      sort_order?: number;
    } = {
      category_id: editing.category_id,
      title: editing.title.trim(),
      excerpt: editing.excerpt?.trim() || null,
      body: editing.body?.trim() || null,
      image_url: editing.image_url?.trim() || null,
      badge: editing.badge?.trim() || null,
      published: editing.published,
    };
    if (!editing.id) {
      // Append to the end of the chosen category so the admin-defined order is preserved.
      const { data: maxRow } = await supabase
        .from("sports_blogs")
        .select("sort_order")
        .eq("category_id", editing.category_id)
        .order("sort_order", { ascending: false })
        .limit(1)
        .maybeSingle();
      payload.sort_order = ((maxRow?.sort_order ?? 0) as number) + 10;
    }
    const { error } = editing.id
      ? await supabase.from("sports_blogs").update(payload).eq("id", editing.id)
      : await supabase.from("sports_blogs").insert({ ...payload, created_by: user?.id ?? null });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(editing.id ? "Blog updated" : "Blog added");
    close();
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-gradient-to-br from-[#1a0b2e] via-[#2d1b4e] to-[#1a0b2e]">
      <header className="flex items-center justify-between gap-4 px-8 py-5 border-b border-purple-500/30 bg-purple-950/60 backdrop-blur shrink-0">
        <h1 className="font-display text-2xl font-bold bg-gradient-to-r from-violet-400 via-fuchsia-400 to-blue-400 bg-clip-text text-transparent">
          {blogId ? "Edit blog" : "Add blog"}
        </h1>
        <div className="flex items-center gap-2">
          <Button variant="ghost" className="text-purple-200 hover:text-white hover:bg-purple-800/60" onClick={close}>
            <X className="size-4 mr-1" /> Cancel
          </Button>
          <Button onClick={save} disabled={saving || loading} className="bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 text-white border-0">
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </header>
      <div className="flex-1 overflow-y-auto">
        {loading || !editing ? (
          <div className="px-6 py-12 text-center text-purple-200/70">Loading…</div>
        ) : (
          <div className="max-w-3xl mx-auto px-6 py-8 space-y-4">
            <div>
              <Label className="text-purple-100">Category</Label>
              <select
                className="mt-1 w-full bg-purple-950/50 border border-purple-500/30 text-purple-50 rounded-md px-3 py-2 text-sm"
                value={editing.category_id}
                onChange={(e) => setEditing({ ...editing, category_id: e.target.value })}
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-purple-100">Title</Label>
              <Input value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} className="bg-purple-950/50 border-purple-500/30 text-purple-50" />
            </div>
            <div>
              <Label className="text-purple-100">Cover image</Label>
              <div className="mt-1 flex flex-col sm:flex-row gap-3">
                <div className="w-full sm:w-48 aspect-[16/10] rounded-md border border-purple-500/30 bg-purple-950/50 overflow-hidden grid place-items-center text-purple-300/60 shrink-0">
                  {editing.image_url ? (
                    <img src={editing.image_url} alt="Cover preview" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-xs">No cover</span>
                  )}
                </div>
                <div className="flex-1 space-y-2">
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) uploadCover(f);
                      e.target.value = "";
                    }}
                  />
                  <Button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                    className="bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 text-white border-0"
                  >
                    {uploading ? <Loader2 className="size-4 mr-1 animate-spin" /> : <Upload className="size-4 mr-1" />}
                    {uploading ? "Uploading…" : "Upload image"}
                  </Button>
                  <Input
                    value={editing.image_url ?? ""}
                    onChange={(e) => setEditing({ ...editing, image_url: e.target.value })}
                    placeholder="…or paste an image URL"
                    className="bg-purple-950/50 border-purple-500/30 text-purple-50 placeholder:text-purple-300/50"
                  />
                </div>
              </div>
            </div>
            <div>
              <Label className="text-purple-100">Badge (optional)</Label>
              <Input value={editing.badge ?? ""} onChange={(e) => setEditing({ ...editing, badge: e.target.value })} placeholder="e.g. Updated with New Listings" className="bg-purple-950/50 border-purple-500/30 text-purple-50 placeholder:text-purple-300/50" />
            </div>
            <div>
              <Label className="text-purple-100">Excerpt</Label>
              <Textarea rows={3} value={editing.excerpt ?? ""} onChange={(e) => setEditing({ ...editing, excerpt: e.target.value })} className="bg-purple-950/50 border-purple-500/30 text-purple-50" />
            </div>
            <div>
              <Label className="text-purple-100">Body</Label>
              <HtmlEditor
                value={editing.body ?? ""}
                onChange={(html) => setEditing({ ...editing, body: html })}
                placeholder="Write the guide content..."
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-purple-100">
              <input
                type="checkbox"
                checked={editing.published}
                onChange={(e) => setEditing({ ...editing, published: e.target.checked })}
              />
              Published
            </label>
          </div>
        )}
      </div>
    </div>
  );
}