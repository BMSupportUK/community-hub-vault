import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Sparkles,
  Plus,
  Loader2,
  Paperclip,
  X,
  FileText,
  Pencil,
  Trash2,
  Hash,
  FolderPlus,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/_approved/new-content")({
  component: NewContentPage,
});

type Kind = "channel" | "category";

interface Attachment {
  name: string;
  url: string;
  size: number;
  type: string;
}

interface Post {
  id: string;
  kind: Kind;
  title: string;
  description: string | null;
  attachments: Attachment[];
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

async function uploadFiles(files: File[]): Promise<Attachment[]> {
  const out: Attachment[] = [];
  for (const f of files) {
    if (f.size > 25 * 1024 * 1024) {
      toast.error(`${f.name} is over 25MB`);
      continue;
    }
    const safe = f.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}`;
    const { error } = await supabase.storage
      .from("new-content-attachments")
      .upload(path, f, { cacheControl: "3600", upsert: false, contentType: f.type || undefined });
    if (error) {
      toast.error(`Upload failed: ${error.message}`);
      continue;
    }
    const { data } = supabase.storage.from("new-content-attachments").getPublicUrl(path);
    out.push({ name: f.name, url: data.publicUrl, size: f.size, type: f.type });
  }
  return out;
}

function AttachmentList({ items }: { items: Attachment[] }) {
  if (!items?.length) return null;
  return (
    <div className="flex flex-wrap gap-2 mt-3">
      {items.map((a, i) => {
        const isImg = a.type?.startsWith("image/");
        return isImg ? (
          <a key={i} href={a.url} target="_blank" rel="noreferrer">
            <img src={a.url} alt={a.name} className="size-24 rounded-lg object-cover border border-purple-500/30 hover:opacity-80" />
          </a>
        ) : (
          <a
            key={i}
            href={a.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-purple-500/30 bg-purple-950/50 text-xs hover:border-fuchsia-400 text-purple-100"
          >
            <FileText className="size-3.5" />
            <span className="max-w-[180px] truncate">{a.name}</span>
          </a>
        );
      })}
    </div>
  );
}

function NewContentPage() {
  const { user, hasAny } = useAuth();
  const canManage = hasAny(["admin", "management", "staff"]);
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [tab, setTab] = useState<"welcome" | "channel" | "category">(() => {
    try { return (sessionStorage.getItem("new-content-tab") as any) || "welcome"; } catch { return "welcome"; }
  });
  const [editor, setEditor] = useState<{ open: boolean; kind: Kind; post?: Post } | null>(null);

  useEffect(() => { try { sessionStorage.setItem("new-content-tab", tab); } catch { /* noop */ } }, [tab]);

  const load = async () => {
    const { data } = await supabase
      .from("new_content_posts")
      .select("id, kind, title, description, attachments, created_at, updated_at, created_by")
      .order("created_at", { ascending: false });
    setPosts((data as Post[] | null) ?? []);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel("new-content-posts")
      .on("postgres_changes", { event: "*", schema: "public", table: "new_content_posts" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const channels = useMemo(() => (posts ?? []).filter((p) => p.kind === "channel"), [posts]);
  const categories = useMemo(() => (posts ?? []).filter((p) => p.kind === "category"), [posts]);

  const remove = async (id: string) => {
    if (!confirm("Delete this post?")) return;
    const { error } = await supabase.from("new_content_posts").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
  };

  const renderList = (items: Post[], kind: Kind) => (
    <div className="space-y-4">
      {canManage && (
        <Button
          onClick={() => setEditor({ open: true, kind })}
          className="bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 text-white border-0 shadow-lg shadow-purple-900/50"
        >
          <Plus className="size-4 mr-1" /> Add {kind === "channel" ? "Channel" : "Category"} Post
        </Button>
      )}
      {posts === null ? (
        <div className="grid place-items-center py-16 text-purple-200/70"><Loader2 className="size-5 animate-spin" /></div>
      ) : items.length === 0 ? (
        <div className="text-center text-purple-200/70 py-12 rounded-2xl border border-purple-500/30 bg-purple-950/40">
          No {kind === "channel" ? "new channel" : "new category"} posts yet.
        </div>
      ) : (
        items.map((p) => (
          <article
            key={p.id}
            className="rounded-2xl border border-purple-500/30 bg-purple-950/40 backdrop-blur p-5 shadow-[0_0_30px_-15px_rgba(168,85,247,0.5)]"
          >
            <div className="flex items-start gap-3">
              <div className="size-10 rounded-xl bg-gradient-to-br from-fuchsia-600 to-violet-700 grid place-items-center shrink-0 shadow-lg shadow-purple-900/50">
                {kind === "channel" ? <Hash className="size-5 text-white" /> : <FolderPlus className="size-5 text-white" />}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-display text-lg font-bold text-white">{p.title}</h3>
                <div className="text-[11px] text-purple-300/80 mt-0.5">
                  Posted {new Date(p.created_at).toLocaleString()}
                </div>
              </div>
              {canManage && (
                <div className="flex gap-1">
                  <button
                    onClick={() => setEditor({ open: true, kind, post: p })}
                    className="size-8 rounded-lg hover:bg-purple-800/50 text-purple-200 grid place-items-center"
                    title="Edit"
                  >
                    <Pencil className="size-4" />
                  </button>
                  <button
                    onClick={() => remove(p.id)}
                    className="size-8 rounded-lg hover:bg-destructive/20 text-destructive grid place-items-center"
                    title="Delete"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              )}
            </div>
            {p.description && (
              <p className="text-sm text-purple-100/90 mt-3 whitespace-pre-wrap">{p.description}</p>
            )}
            <AttachmentList items={p.attachments ?? []} />
          </article>
        ))
      )}
    </div>
  );

  return (
    <div className="flex-1 overflow-y-auto bg-gradient-to-br from-[#1a0b2e] via-[#2d1b4e] to-[#1a0b2e]">
      <header className="px-8 pt-8 pb-6 border-b border-purple-500/30 bg-purple-950/40 backdrop-blur flex items-center gap-3">
        <div className="size-12 rounded-2xl bg-gradient-to-br from-fuchsia-600 to-violet-700 grid place-items-center shadow-glow">
          <Sparkles className="size-6 text-white" />
        </div>
        <div>
          <h1 className="font-display text-3xl font-bold bg-gradient-to-r from-violet-300 via-fuchsia-300 to-blue-300 bg-clip-text text-transparent">New Content</h1>
          <p className="text-purple-200/80 mt-1">Announcements about new channels and categories</p>
        </div>
      </header>

      <div className="px-8 py-6">
        <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="w-full">
          <TabsList className="grid grid-cols-3 max-w-2xl bg-purple-950/60 border border-purple-500/30">
            <TabsTrigger value="welcome" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-fuchsia-600 data-[state=active]:to-purple-600 data-[state=active]:text-white">Welcome</TabsTrigger>
            <TabsTrigger value="channel" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-fuchsia-600 data-[state=active]:to-purple-600 data-[state=active]:text-white">
              New Channels{channels.length ? ` (${channels.length})` : ""}
            </TabsTrigger>
            <TabsTrigger value="category" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-fuchsia-600 data-[state=active]:to-purple-600 data-[state=active]:text-white">
              New Categories{categories.length ? ` (${categories.length})` : ""}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="welcome" className="mt-6">
            <div className="rounded-2xl bg-gradient-to-br from-fuchsia-600/30 via-purple-600/30 to-violet-700/30 border border-purple-500/40 p-10 shadow-[0_0_60px_-15px_rgba(168,85,247,0.5)]">
              <h2 className="font-display text-3xl font-bold bg-gradient-to-r from-violet-300 to-blue-300 bg-clip-text text-transparent">
                Welcome to New Content
              </h2>
              <p className="mt-3 text-lg text-purple-100/90 max-w-2xl">
                Stay up to date with every new channel and category added to the platform.
              </p>
              <p className="mt-4 text-purple-200/70 max-w-2xl">
                Browse the <span className="font-semibold text-white">New Channels</span> tab for newly added channels, or the <span className="font-semibold text-white">New Categories</span> tab for new content categories. Admins post details, images, and setup info here so you'll never miss what's new.
              </p>
              <div className="mt-6 flex gap-2">
                <Button onClick={() => setTab("channel")} className="bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 text-white border-0 shadow-lg shadow-purple-900/50">
                  <Hash className="size-4 mr-1" /> View new channels
                </Button>
                <Button onClick={() => setTab("category")} variant="outline" className="border-purple-500/40 bg-purple-950/40 text-purple-100 hover:bg-purple-900/60">
                  <FolderPlus className="size-4 mr-1" /> View new categories
                </Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="channel" className="mt-6">{renderList(channels, "channel")}</TabsContent>
          <TabsContent value="category" className="mt-6">{renderList(categories, "category")}</TabsContent>
        </Tabs>
      </div>

      {editor?.open && user && (
        <PostEditor
          kind={editor.kind}
          post={editor.post}
          userId={user.id}
          onClose={() => setEditor(null)}
          onSaved={() => { setEditor(null); load(); }}
        />
      )}
    </div>
  );
}

function PostEditor({
  kind,
  post,
  userId,
  onClose,
  onSaved,
}: {
  kind: Kind;
  post?: Post;
  userId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(post?.title ?? "");
  const [description, setDescription] = useState(post?.description ?? "");
  const [files, setFiles] = useState<File[]>([]);
  const [existing, setExisting] = useState<Attachment[]>(post?.attachments ?? []);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!title.trim()) { toast.error("Title required"); return; }
    setSaving(true);
    try {
      const uploaded = files.length ? await uploadFiles(files) : [];
      const attachments = [...existing, ...uploaded];
      if (post) {
        const { error } = await supabase
          .from("new_content_posts")
          .update({ title: title.trim(), description: description.trim() || null, attachments: attachments as unknown as never })
          .eq("id", post.id);
        if (error) throw error;
        toast.success("Updated");
      } else {
        const { error } = await supabase.from("new_content_posts").insert({
          kind,
          title: title.trim(),
          description: description.trim() || null,
          attachments: attachments as unknown as never,
          created_by: userId,
        });
        if (error) throw error;
        toast.success("Posted");
      }
      onSaved();
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm grid place-items-center p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-xl rounded-2xl border border-purple-500/40 bg-[#1a0b2e] p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-xl font-bold text-white">
            {post ? "Edit" : "New"} {kind === "channel" ? "Channel" : "Category"} Post
          </h2>
          <button onClick={onClose} className="size-8 rounded-lg hover:bg-purple-800/50 text-purple-200 grid place-items-center">
            <X className="size-4" />
          </button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs uppercase tracking-wider text-purple-300/80">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={kind === "channel" ? "New channel name" : "New category name"}
              className="mt-1 w-full rounded-lg bg-purple-950/60 border border-purple-500/30 px-3 py-2 text-sm text-white outline-none focus:border-fuchsia-400"
            />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wider text-purple-300/80">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={5}
              placeholder="What's been added? Include details, info, and any setup notes."
              className="mt-1 w-full rounded-lg bg-purple-950/60 border border-purple-500/30 px-3 py-2 text-sm text-white outline-none focus:border-fuchsia-400 resize-none"
            />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wider text-purple-300/80">Attachments</label>
            <div className="mt-1 space-y-2">
              <label className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-purple-500/30 bg-purple-950/60 text-xs text-purple-100 cursor-pointer hover:border-fuchsia-400">
                <Paperclip className="size-3.5" /> Attach files
                <input
                  type="file"
                  multiple
                  className="hidden"
                  disabled={saving}
                  onChange={(e) => {
                    const list = Array.from(e.target.files ?? []);
                    setFiles((f) => [...f, ...list]);
                    e.target.value = "";
                  }}
                />
              </label>
              {existing.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {existing.map((a, i) => (
                    <span key={i} className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded border border-purple-500/30 bg-purple-950/60 text-[11px] text-purple-100">
                      <span className="max-w-[160px] truncate">{a.name}</span>
                      <button type="button" onClick={() => setExisting((arr) => arr.filter((_, j) => j !== i))} className="text-purple-300 hover:text-destructive">
                        <X className="size-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              {files.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {files.map((f, i) => (
                    <span key={i} className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded border border-purple-500/30 bg-purple-950/60 text-[11px] text-purple-100">
                      <span className="max-w-[160px] truncate">{f.name}</span>
                      <button type="button" onClick={() => setFiles((arr) => arr.filter((_, j) => j !== i))} className="text-purple-300 hover:text-destructive">
                        <X className="size-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose} disabled={saving} className="border-purple-500/40 bg-purple-950/40 text-purple-100 hover:bg-purple-900/60">
              Cancel
            </Button>
            <Button onClick={save} disabled={saving} className="bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 text-white border-0">
              {saving ? <Loader2 className="size-4 animate-spin" /> : post ? "Save" : "Post"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}