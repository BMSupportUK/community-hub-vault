import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Plus, Trash2, Pencil, Save, X, Pin, Lock, Loader2, UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/_approved/admin-forum")({
  component: AdminForumPage,
});

type Board = {
  id: string;
  name: string;
  slug: string;
  description: string;
  icon: string;
  sort_order: number;
  is_pinned: boolean;
  is_locked: boolean;
  topic_count: number;
  post_count: number;
};
type Mod = { board_id: string; user_id: string };
type Profile = { id: string; display_name: string | null; username: string | null };

function AdminForumPage() {
  const { hasAny } = useAuth();
  const isAdmin = hasAny(["admin", "management"]);
  const [boards, setBoards] = useState<Board[] | null>(null);
  const [mods, setMods] = useState<Mod[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [editing, setEditing] = useState<Board | null>(null);
  const [draft, setDraft] = useState<Partial<Board>>({});
  const [newMod, setNewMod] = useState<Record<string, string>>({});

  const load = async () => {
    const { data: bs } = await supabase
      .from("forum_boards")
      .select("id, name, slug, description, icon, sort_order, is_pinned, is_locked, topic_count, post_count")
      .order("is_pinned", { ascending: false })
      .order("sort_order");
    setBoards((bs ?? []) as Board[]);
    const { data: ms } = await supabase.from("forum_board_moderators").select("board_id, user_id");
    const list = (ms ?? []) as Mod[];
    setMods(list);
    const ids = Array.from(new Set(list.map((m) => m.user_id)));
    if (ids.length) {
      const { data: ps } = await supabase.from("profiles").select("id, display_name, username").in("id", ids);
      const map: Record<string, Profile> = {};
      (ps ?? []).forEach((p) => { map[p.id as string] = p as Profile; });
      setProfiles(map);
    }
  };

  useEffect(() => { if (isAdmin) void load(); }, [isAdmin]);

  if (!isAdmin) return <Navigate to="/admin" />;

  const startEdit = (b: Board) => { setEditing(b); setDraft(b); };
  const saveEdit = async () => {
    if (!editing) return;
    const { error } = await supabase.from("forum_boards").update({
      name: draft.name, description: draft.description, icon: draft.icon,
      sort_order: draft.sort_order, is_pinned: draft.is_pinned, is_locked: draft.is_locked,
    }).eq("id", editing.id);
    if (error) { toast.error("Save failed", { description: error.message }); return; }
    setEditing(null); void load();
  };
  const create = async () => {
    const name = prompt("Board name?")?.trim();
    if (!name) return;
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    const { error } = await supabase.from("forum_boards").insert({ name, slug, description: "", sort_order: 100 });
    if (error) { toast.error("Create failed", { description: error.message }); return; }
    void load();
  };
  const remove = async (b: Board) => {
    if (!confirm(`Delete board "${b.name}" and ALL its topics?`)) return;
    const { error } = await supabase.from("forum_boards").delete().eq("id", b.id);
    if (error) { toast.error("Delete failed", { description: error.message }); return; }
    void load();
  };
  const addMod = async (boardId: string) => {
    const handle = newMod[boardId]?.trim();
    if (!handle) return;
    const { data: p } = await supabase.from("profiles").select("id").or(`username.eq.${handle},display_name.eq.${handle}`).maybeSingle();
    if (!p) { toast.error("User not found"); return; }
    const { error } = await supabase.from("forum_board_moderators").insert({ board_id: boardId, user_id: (p as { id: string }).id });
    if (error) { toast.error("Couldn't add", { description: error.message }); return; }
    setNewMod((m) => ({ ...m, [boardId]: "" }));
    void load();
  };
  const removeMod = async (boardId: string, userId: string) => {
    const { error } = await supabase.from("forum_board_moderators").delete().eq("board_id", boardId).eq("user_id", userId);
    if (error) { toast.error("Couldn't remove", { description: error.message }); return; }
    void load();
  };

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 space-y-4">
      <Button asChild variant="ghost" size="sm" className="-ml-2"><Link to="/admin"><ArrowLeft className="size-4 mr-1" />Admin</Link></Button>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="font-display text-2xl font-bold">Forum boards</h1>
        <Button onClick={create}><Plus className="size-4 mr-1" />New board</Button>
      </div>
      {!boards ? (
        <div className="grid place-items-center py-10 text-muted-foreground"><Loader2 className="size-5 animate-spin" /></div>
      ) : boards.length === 0 ? (
        <p className="text-sm text-muted-foreground">No boards yet.</p>
      ) : (
        <div className="space-y-3">
          {boards.map((b) => {
            const boardMods = mods.filter((m) => m.board_id === b.id);
            const isEditing = editing?.id === b.id;
            return (
              <div key={b.id} className="rounded-xl border border-border bg-surface-1 p-4 space-y-3">
                {isEditing ? (
                  <div className="space-y-2">
                    <Input value={draft.name ?? ""} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Name" />
                    <Textarea value={draft.description ?? ""} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="Description" rows={2} />
                    <div className="grid grid-cols-2 gap-2">
                      <Input value={draft.icon ?? ""} onChange={(e) => setDraft({ ...draft, icon: e.target.value })} placeholder="Icon name (e.g. MessageSquare)" />
                      <Input type="number" value={draft.sort_order ?? 0} onChange={(e) => setDraft({ ...draft, sort_order: Number(e.target.value) })} placeholder="Sort order" />
                    </div>
                    <div className="flex gap-3 text-sm">
                      <label className="flex items-center gap-1"><input type="checkbox" checked={!!draft.is_pinned} onChange={(e) => setDraft({ ...draft, is_pinned: e.target.checked })} />Pinned</label>
                      <label className="flex items-center gap-1"><input type="checkbox" checked={!!draft.is_locked} onChange={(e) => setDraft({ ...draft, is_locked: e.target.checked })} />Locked</label>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="outline" onClick={() => setEditing(null)}><X className="size-3.5 mr-1" />Cancel</Button>
                      <Button size="sm" onClick={() => void saveEdit()}><Save className="size-3.5 mr-1" />Save</Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        {b.is_pinned && <Pin className="size-3.5 text-amber-400" />}
                        {b.is_locked && <Lock className="size-3.5 text-muted-foreground" />}
                        <h3 className="font-display font-bold">{b.name}</h3>
                        <span className="text-[11px] text-muted-foreground">/{b.slug} · {b.topic_count} topics · {b.post_count} posts</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{b.description || <em>No description</em>}</p>
                    </div>
                    <div className="flex gap-1.5">
                      <Button size="sm" variant="outline" onClick={() => startEdit(b)}><Pencil className="size-3.5" /></Button>
                      <Button size="sm" variant="destructive" onClick={() => void remove(b)}><Trash2 className="size-3.5" /></Button>
                    </div>
                  </div>
                )}

                <div className="rounded-lg bg-background/60 border border-border/60 p-3">
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">Moderators</div>
                  {boardMods.length === 0 ? (
                    <p className="text-xs text-muted-foreground mb-2">No board-specific moderators (staff & global mods always have access).</p>
                  ) : (
                    <ul className="flex flex-wrap gap-1.5 mb-2">
                      {boardMods.map((m) => {
                        const p = profiles[m.user_id];
                        const name = p?.display_name || p?.username || m.user_id.slice(0, 6);
                        return (
                          <li key={m.user_id} className="inline-flex items-center gap-1 text-xs rounded-full bg-surface-2 border border-border px-2 py-0.5">
                            {name}
                            <button onClick={() => void removeMod(b.id, m.user_id)} className="text-muted-foreground hover:text-destructive"><X className="size-3" /></button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  <div className="flex gap-2">
                    <Input
                      value={newMod[b.id] ?? ""}
                      onChange={(e) => setNewMod({ ...newMod, [b.id]: e.target.value })}
                      placeholder="Add moderator by username"
                      className="h-8 text-xs"
                    />
                    <Button size="sm" variant="outline" onClick={() => void addMod(b.id)}><UserPlus className="size-3.5" /></Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}