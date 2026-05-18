import { createFileRoute, Navigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Trash2, Pencil, Upload, X, ArrowLeft, UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { Nameplate } from "@/components/app/Nameplate";
import { primeNameplates, clearNameplateCache, type NameplateRow } from "@/lib/nameplates";

export const Route = createFileRoute("/_authenticated/_approved/admin-nameplates")({
  component: AdminNameplates,
});

interface ProfileLite {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
}

function AdminNameplates() {
  const { hasAny } = useAuth();
  const isAdmin = hasAny(["admin", "management"]);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<NameplateRow[]>([]);
  const [editing, setEditing] = useState<NameplateRow | "new" | null>(null);
  const [assigning, setAssigning] = useState<NameplateRow | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("nameplates")
      .select("id,name,description,image_url,gradient_css,is_active,sort_order")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    const list = (data as NameplateRow[]) ?? [];
    setRows(list);
    primeNameplates(list);
    setLoading(false);
  };

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin]);

  if (!isAdmin) return <Navigate to="/home" />;

  const remove = async (id: string) => {
    if (!confirm("Delete this nameplate? Users will be unequipped.")) return;
    const { error } = await supabase.from("nameplates").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    clearNameplateCache();
    await load();
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
      <div className="flex items-center justify-between gap-3 mb-6">
        <div>
          <Link to="/admin" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-1">
            <ArrowLeft className="size-3" /> Admin dashboard
          </Link>
          <h1 className="font-display text-2xl font-bold">Nameplates</h1>
          <p className="text-sm text-muted-foreground">Discord-style decorative banners users can equip behind their name.</p>
        </div>
        <button
          onClick={() => setEditing("new")}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium"
        >
          <Plus className="size-4" /> New nameplate
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
          No nameplates yet. Create the first one to get started.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((r) => (
            <div key={r.id} className="rounded-2xl border border-border bg-surface-1 overflow-hidden">
              <Nameplate id={r.id} className="h-20" fallbackStyle={{ background: "var(--surface-2)" }} />
              <div className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold text-sm truncate">{r.name}</div>
                    {r.description && <div className="text-xs text-muted-foreground line-clamp-2">{r.description}</div>}
                  </div>
                  <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full ${r.is_active ? "bg-emerald-500/15 text-emerald-400" : "bg-muted text-muted-foreground"}`}>
                    {r.is_active ? "Active" : "Hidden"}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2 pt-2">
                  <button onClick={() => setEditing(r)} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg border border-border hover:bg-surface-2">
                    <Pencil className="size-3" /> Edit
                  </button>
                  <button onClick={() => setAssigning(r)} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg border border-border hover:bg-surface-2">
                    <UserPlus className="size-3" /> Assign
                  </button>
                  <button onClick={() => remove(r.id)} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg border border-destructive/40 text-destructive hover:bg-destructive/10 ml-auto">
                    <Trash2 className="size-3" /> Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <EditDialog
          row={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async () => { setEditing(null); clearNameplateCache(); await load(); }}
        />
      )}

      {assigning && (
        <AssignDialog
          nameplate={assigning}
          onClose={() => setAssigning(null)}
        />
      )}
    </div>
  );
}

function EditDialog({ row, onClose, onSaved }: { row: NameplateRow | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(row?.name ?? "");
  const [description, setDescription] = useState(row?.description ?? "");
  const [imageUrl, setImageUrl] = useState(row?.image_url ?? "");
  const [gradientCss, setGradientCss] = useState(row?.gradient_css ?? "");
  const [isActive, setIsActive] = useState(row?.is_active ?? true);
  const [sortOrder, setSortOrder] = useState(row?.sort_order ?? 100);
  const [busy, setBusy] = useState(false);

  const uploadImage = async (file: File) => {
    setBusy(true);
    try {
      const ext = file.name.split(".").pop() ?? "png";
      const path = `${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("nameplates").upload(path, file, { cacheControl: "3600", upsert: false });
      if (error) throw error;
      const { data } = supabase.storage.from("nameplates").getPublicUrl(path);
      setImageUrl(data.publicUrl);
      toast.success("Image uploaded");
    } catch (e: any) {
      toast.error(e.message ?? "Upload failed");
    } finally { setBusy(false); }
  };

  const save = async () => {
    if (!name.trim()) return toast.error("Name required");
    if (!imageUrl.trim() && !gradientCss.trim()) return toast.error("Provide an image or a gradient");
    setBusy(true);
    const payload = {
      name: name.trim(),
      description: description.trim() || null,
      image_url: imageUrl.trim() || null,
      gradient_css: gradientCss.trim() || null,
      is_active: isActive,
      sort_order: sortOrder,
    };
    const { error } = row
      ? await supabase.from("nameplates").update(payload).eq("id", row.id)
      : await supabase.from("nameplates").insert(payload);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(row ? "Updated" : "Created");
    onSaved();
  };

  const previewStyle = imageUrl
    ? { backgroundImage: `url(${imageUrl})`, backgroundSize: "cover", backgroundPosition: "center" }
    : gradientCss
    ? { background: gradientCss }
    : { background: "var(--surface-2)" };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-surface-1 border border-border overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <h2 className="font-display font-bold">{row ? "Edit nameplate" : "New nameplate"}</h2>
          <button onClick={onClose}><X className="size-4" /></button>
        </div>
        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          <div className="h-20 rounded-xl" style={previewStyle} />
          <Field label="Name">
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={64} className="w-full px-3 py-2 rounded-lg bg-surface-2 border border-border text-sm" />
          </Field>
          <Field label="Description (optional)">
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} rows={2} className="w-full px-3 py-2 rounded-lg bg-surface-2 border border-border text-sm resize-none" />
          </Field>
          <Field label="Image">
            <div className="flex gap-2">
              <input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="Image URL or upload" className="flex-1 px-3 py-2 rounded-lg bg-surface-2 border border-border text-sm" />
              <label className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-border bg-surface-2 cursor-pointer text-xs">
                <Upload className="size-3" /> Upload
                <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadImage(e.target.files[0])} />
              </label>
            </div>
          </Field>
          <Field label="Or a CSS background (gradient)">
            <input value={gradientCss} onChange={(e) => setGradientCss(e.target.value)} placeholder="linear-gradient(135deg, #a78bfa, #ec4899)" className="w-full px-3 py-2 rounded-lg bg-surface-2 border border-border text-sm font-mono" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Sort order">
              <input type="number" value={sortOrder} onChange={(e) => setSortOrder(Number(e.target.value) || 0)} className="w-full px-3 py-2 rounded-lg bg-surface-2 border border-border text-sm" />
            </Field>
            <Field label="Status">
              <label className="flex items-center gap-2 text-sm h-[38px] px-3 rounded-lg bg-surface-2 border border-border">
                <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
                Active (visible to users)
              </label>
            </Field>
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-border">
          <button onClick={onClose} className="px-3 py-2 rounded-lg text-sm hover:bg-surface-2">Cancel</button>
          <button onClick={save} disabled={busy} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-60">
            {busy && <Loader2 className="size-3 animate-spin" />} Save
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">{label}</div>
      {children}
    </div>
  );
}

function AssignDialog({ nameplate, onClose }: { nameplate: NameplateRow; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [members, setMembers] = useState<ProfileLite[]>([]);
  const [unlocked, setUnlocked] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [{ data: profs }, { data: ups }] = await Promise.all([
        supabase.from("profiles").select("id,username,display_name,avatar_url").order("display_name", { ascending: true }).limit(500),
        supabase.from("user_nameplates").select("user_id").eq("nameplate_id", nameplate.id),
      ]);
      setMembers((profs as ProfileLite[]) ?? []);
      setUnlocked(new Set(((ups as { user_id: string }[]) ?? []).map((u) => u.user_id)));
      setLoading(false);
    })();
  }, [nameplate.id]);

  const toggle = async (userId: string) => {
    const has = unlocked.has(userId);
    if (has) {
      const { error } = await supabase.from("user_nameplates").delete().eq("nameplate_id", nameplate.id).eq("user_id", userId);
      if (error) return toast.error(error.message);
      setUnlocked((s) => { const n = new Set(s); n.delete(userId); return n; });
    } else {
      const { error } = await supabase.from("user_nameplates").insert({ nameplate_id: nameplate.id, user_id: userId });
      if (error) return toast.error(error.message);
      setUnlocked((s) => { const n = new Set(s); n.add(userId); return n; });
    }
  };

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return members;
    return members.filter((m) =>
      (m.display_name ?? "").toLowerCase().includes(term) ||
      (m.username ?? "").toLowerCase().includes(term),
    );
  }, [members, q]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-surface-1 border border-border overflow-hidden flex flex-col max-h-[85vh]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <div className="min-w-0">
            <div className="text-xs text-muted-foreground">Assign access</div>
            <h2 className="font-display font-bold truncate">{nameplate.name}</h2>
          </div>
          <button onClick={onClose}><X className="size-4" /></button>
        </div>
        <div className="p-3 border-b border-border">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search members…" className="w-full px-3 py-2 rounded-lg bg-surface-2 border border-border text-sm" />
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="py-10 text-center"><Loader2 className="size-5 animate-spin inline text-muted-foreground" /></div>
          ) : (
            <ul className="divide-y divide-border">
              {filtered.map((m) => (
                <li key={m.id} className="flex items-center gap-3 px-4 py-2.5">
                  <img src={m.avatar_url || "/default-avatar.png"} alt="" className="size-8 rounded-full object-cover" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{m.display_name ?? m.username ?? "Unknown"}</div>
                    {m.username && <div className="text-[11px] text-muted-foreground truncate">@{m.username}</div>}
                  </div>
                  <button
                    onClick={() => toggle(m.id)}
                    className={`text-xs px-2 py-1 rounded-lg ${unlocked.has(m.id) ? "bg-primary/15 text-primary" : "border border-border hover:bg-surface-2"}`}
                  >
                    {unlocked.has(m.id) ? "Unlocked" : "Grant"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}