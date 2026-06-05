import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Plus, Trash2, Pencil, Save, X, Pin, Lock, Loader2, UserPlus, ArrowUp, ArrowDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, type AppRole } from "@/hooks/use-auth";
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
  affiliate_banner_url: string | null;
  affiliate_banner_link: string | null;
  affiliate_banner_alt: string | null;
};
type Mod = { board_id: string; user_id: string };
type Profile = { id: string; display_name: string | null; username: string | null };
type Perm = { board_id: string; role: string; can_view: boolean; can_create_topic: boolean; can_reply: boolean };

const ROLES: { value: AppRole; label: string }[] = [
  { value: "member", label: "Member" },
  { value: "subscriber", label: "Subscriber" },
  { value: "nonsubscriber", label: "Non-subscriber" },
  { value: "staff", label: "Staff" },
  { value: "moderator", label: "Moderator" },
];

function AdminForumPage() {
  const { hasAny } = useAuth();
  const isAdmin = hasAny(["admin", "management"]);
  const [boards, setBoards] = useState<Board[] | null>(null);
  const [mods, setMods] = useState<Mod[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [perms, setPerms] = useState<Perm[]>([]);
  const [editing, setEditing] = useState<Board | null>(null);
  const [draft, setDraft] = useState<Partial<Board>>({});
  const [newMod, setNewMod] = useState<Record<string, string>>({});

  const load = async () => {
    const { data: bs } = await supabase
      .from("forum_boards")
      .select("id, name, slug, description, icon, sort_order, is_pinned, is_locked, topic_count, post_count, affiliate_banner_url, affiliate_banner_link, affiliate_banner_alt")
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
    const { data: pps } = await supabase
      .from("forum_board_permissions")
      .select("board_id, role, can_view, can_create_topic, can_reply");
    setPerms((pps ?? []) as Perm[]);
  };

  useEffect(() => { if (isAdmin) void load(); }, [isAdmin]);

  if (!isAdmin) return <Navigate to="/admin" />;

  const startEdit = (b: Board) => { setEditing(b); setDraft(b); };
  const saveEdit = async () => {
    if (!editing) return;
    const { error } = await supabase.from("forum_boards").update({
      name: draft.name, description: draft.description, icon: draft.icon,
      sort_order: draft.sort_order, is_pinned: draft.is_pinned, is_locked: draft.is_locked,
      affiliate_banner_url: draft.affiliate_banner_url || null,
      affiliate_banner_link: draft.affiliate_banner_link || null,
      affiliate_banner_alt: draft.affiliate_banner_alt || null,
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

  const move = async (b: Board, dir: -1 | 1) => {
    if (!boards) return;
    // Operate within same pinned group, matching the on-screen order.
    const group = boards.filter((x) => x.is_pinned === b.is_pinned);
    const idx = group.findIndex((x) => x.id === b.id);
    const swapIdx = idx + dir;
    if (idx < 0 || swapIdx < 0 || swapIdx >= group.length) return;
    const other = group[swapIdx];
    const a = b.sort_order;
    const c = other.sort_order;
    // If equal, nudge to guarantee a swap.
    const newA = a === c ? c - dir : c;
    const newC = a === c ? a + dir : a;
    // Optimistic update
    setBoards((cur) => {
      if (!cur) return cur;
      return cur
        .map((x) => x.id === b.id ? { ...x, sort_order: newA } : x.id === other.id ? { ...x, sort_order: newC } : x)
        .sort((x, y) => (Number(y.is_pinned) - Number(x.is_pinned)) || (x.sort_order - y.sort_order));
    });
    const [r1, r2] = await Promise.all([
      supabase.from("forum_boards").update({ sort_order: newA }).eq("id", b.id),
      supabase.from("forum_boards").update({ sort_order: newC }).eq("id", other.id),
    ]);
    if (r1.error || r2.error) {
      toast.error("Reorder failed", { description: r1.error?.message || r2.error?.message });
      void load();
    }
  };

  const togglePerm = async (
    boardId: string,
    role: AppRole,
    field: "can_view" | "can_create_topic" | "can_reply",
    next: boolean,
  ) => {
    const existing = perms.find((p) => p.board_id === boardId && p.role === role);
    const row: { board_id: string; role: AppRole; can_view: boolean; can_create_topic: boolean; can_reply: boolean } = {
      board_id: boardId,
      role,
      can_view: existing?.can_view ?? false,
      can_create_topic: existing?.can_create_topic ?? false,
      can_reply: existing?.can_reply ?? false,
    };
    row[field] = next;
    // Optimistic update
    setPerms((cur) => {
      const others = cur.filter((p) => !(p.board_id === boardId && p.role === role));
      return [...others, row as Perm];
    });
    const { error } = await supabase
      .from("forum_board_permissions")
      .upsert(row, { onConflict: "board_id,role" });
    if (error) { toast.error("Couldn't save permission", { description: error.message }); void load(); }
  };

  const permFor = (boardId: string, role: AppRole) =>
    perms.find((p) => p.board_id === boardId && p.role === role);

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
          {boards.map((b, i) => {
            const boardMods = mods.filter((m) => m.board_id === b.id);
            const isEditing = editing?.id === b.id;
            const group = boards.filter((x) => x.is_pinned === b.is_pinned);
            const groupIdx = group.findIndex((x) => x.id === b.id);
            const canUp = groupIdx > 0;
            const canDown = groupIdx < group.length - 1;
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
                    <div className="space-y-2 rounded-lg border border-border/60 bg-background/60 p-3">
                      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Affiliate banner (right side) — 512×1536 (1:3), centered</div>
                      <Input
                        value={draft.affiliate_banner_url ?? ""}
                        onChange={(e) => setDraft({ ...draft, affiliate_banner_url: e.target.value })}
                        placeholder="Banner image URL (https://...)"
                      />
                      <Input
                        value={draft.affiliate_banner_link ?? ""}
                        onChange={(e) => setDraft({ ...draft, affiliate_banner_link: e.target.value })}
                        placeholder="Click-through link URL (optional)"
                      />
                      <Input
                        value={draft.affiliate_banner_alt ?? ""}
                        onChange={(e) => setDraft({ ...draft, affiliate_banner_alt: e.target.value })}
                        placeholder="Alt text (optional)"
                      />
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
                      <div className="flex flex-col gap-1">
                        <Button size="sm" variant="outline" disabled={!canUp} onClick={() => void move(b, -1)} aria-label="Move up" className="h-6 px-1.5"><ArrowUp className="size-3.5" /></Button>
                        <Button size="sm" variant="outline" disabled={!canDown} onClick={() => void move(b, 1)} aria-label="Move down" className="h-6 px-1.5"><ArrowDown className="size-3.5" /></Button>
                      </div>
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

                <div className="rounded-lg bg-background/60 border border-border/60 p-3">
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">Permissions per role</div>
                  <p className="text-[11px] text-muted-foreground mb-2">
                    Admin, management and moderator roles always have full access. If no rows are toggled below, the default falls back to approved Fan Zone members.
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="text-muted-foreground">
                        <tr>
                          <th className="text-left font-medium pb-1.5 pr-2">Role</th>
                          <th className="font-medium pb-1.5 px-2">View</th>
                          <th className="font-medium pb-1.5 px-2">Create topic</th>
                          <th className="font-medium pb-1.5 pl-2">Reply</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ROLES.map((r) => {
                          const p = permFor(b.id, r.value);
                          return (
                            <tr key={r.value} className="border-t border-border/40">
                              <td className="py-1.5 pr-2">{r.label}</td>
                              <td className="py-1.5 px-2 text-center">
                                <input
                                  type="checkbox"
                                  checked={!!p?.can_view}
                                  onChange={(e) => void togglePerm(b.id, r.value, "can_view", e.target.checked)}
                                />
                              </td>
                              <td className="py-1.5 px-2 text-center">
                                <input
                                  type="checkbox"
                                  checked={!!p?.can_create_topic}
                                  onChange={(e) => void togglePerm(b.id, r.value, "can_create_topic", e.target.checked)}
                                />
                              </td>
                              <td className="py-1.5 pl-2 text-center">
                                <input
                                  type="checkbox"
                                  checked={!!p?.can_reply}
                                  onChange={(e) => void togglePerm(b.id, r.value, "can_reply", e.target.checked)}
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
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