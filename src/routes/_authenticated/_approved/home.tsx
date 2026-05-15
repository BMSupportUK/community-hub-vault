import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Hash } from "lucide-react";
import { ChannelColumn, type ChannelGroup } from "@/components/app/ChannelColumn";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { IconPicker, getIcon } from "@/components/app/IconPicker";

export const Route = createFileRoute("/_authenticated/_approved/home")({
  component: HomeLayout,
});

interface ChannelRow {
  id: string;
  slug: string;
  name: string;
  group_label: string;
  icon: string;
  staff_only: boolean;
  sort_order: number;
}

function HomeLayout() {
  const { hasAny, user } = useAuth();
  const isAdmin = hasAny(["admin", "management"]);
  const navigate = useNavigate();
  const [channels, setChannels] = useState<ChannelRow[] | null>(null);
  const [mentionCounts, setMentionCounts] = useState<Record<string, number>>({});
  const [addChannelGroup, setAddChannelGroup] = useState<string | null>(null);
  const [showAddGroup, setShowAddGroup] = useState(false);
  const [chName, setChName] = useState("");
  const [chStaffOnly, setChStaffOnly] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [categoryIcons, setCategoryIcons] = useState<Record<string, string>>({});
  const [editChannelIcon, setEditChannelIcon] = useState<ChannelRow | null>(null);
  const [editCategoryIcon, setEditCategoryIcon] = useState<string | null>(null);

  const load = async () => {
    const { data } = await supabase
      .from("chat_channels")
      .select("id, slug, name, group_label, icon, staff_only, sort_order")
      .order("sort_order");
    setChannels((data as ChannelRow[] | null) ?? []);
  };

  const loadCategoryIcons = async () => {
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "category_icons")
      .maybeSingle();
    const v = (data?.value ?? {}) as Record<string, string>;
    setCategoryIcons(v);
  };

  useEffect(() => { load(); loadCategoryIcons(); }, []);

  const saveChannelIcon = async (iconName: string) => {
    if (!editChannelIcon) return;
    const { error } = await supabase
      .from("chat_channels")
      .update({ icon: iconName })
      .eq("id", editChannelIcon.id);
    if (error) return toast.error(error.message);
    toast.success("Icon updated");
    load();
  };

  const saveCategoryIcon = async (iconName: string) => {
    if (!editCategoryIcon) return;
    const next = { ...categoryIcons, [editCategoryIcon]: iconName };
    const { error } = await supabase
      .from("app_settings")
      .upsert(
        { key: "category_icons", value: next, updated_at: new Date().toISOString() },
        { onConflict: "key" },
      );
    if (error) return toast.error(error.message);
    setCategoryIcons(next);
    toast.success("Icon updated");
  };

  useEffect(() => {
    if (!user) return;
    const loadCounts = async () => {
      const { data } = await supabase
        .from("user_notifications")
        .select("link_path")
        .eq("user_id", user.id)
        .eq("kind", "mention")
        .is("read_at", null);
      const map: Record<string, number> = {};
      (data ?? []).forEach((r: { link_path: string | null }) => {
        if (!r.link_path) return;
        map[r.link_path] = (map[r.link_path] ?? 0) + 1;
      });
      setMentionCounts(map);
    };
    loadCounts();
    const ch = supabase
      .channel(`home-mentions-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_notifications", filter: `user_id=eq.${user.id}` },
        () => loadCounts(),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user]);

  const slugify = (s: string) =>
    s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || `ch-${Date.now()}`;

  const createChannel = async () => {
    if (!addChannelGroup || !chName.trim()) return;
    const slug = slugify(chName);
    const nextOrder = (channels?.[channels.length - 1]?.sort_order ?? 0) + 10;
    const { error } = await supabase.from("chat_channels").insert({
      name: chName.trim(),
      slug,
      group_label: addChannelGroup,
      icon: "Hash",
      staff_only: chStaffOnly,
      sort_order: nextOrder,
    });
    if (error) return toast.error(error.message);
    toast.success("Channel created");
    setAddChannelGroup(null);
    setChName("");
    setChStaffOnly(false);
    load();
  };

  const createGroup = async () => {
    const label = groupName.trim();
    if (!label) return;
    const slug = slugify(label);
    const nextOrder = (channels?.[channels.length - 1]?.sort_order ?? 0) + 10;
    const { error } = await supabase.from("chat_channels").insert({
      name: "general",
      slug: `${slug}-general-${Date.now().toString(36)}`,
      group_label: label,
      icon: "Hash",
      staff_only: false,
      sort_order: nextOrder,
    });
    if (error) return toast.error(error.message);
    toast.success("Category created");
    setShowAddGroup(false);
    setGroupName("");
    load();
  };

  const deleteChannel = async (slug: string) => {
    const ch = channels?.find((c) => c.slug === slug);
    if (!ch) return;
    if (!confirm(`Delete channel #${ch.name}? This removes all messages.`)) return;
    const { error } = await supabase.from("chat_channels").delete().eq("id", ch.id);
    if (error) return toast.error(error.message);
    toast.success("Channel deleted");
    load();
  };

  const deleteGroup = async (label: string) => {
    const inGroup = (channels ?? []).filter((c) => c.group_label === label);
    if (!inGroup.length) return;
    if (!confirm(`Delete category "${label}" and its ${inGroup.length} channel(s)?`)) return;
    const { error } = await supabase.from("chat_channels").delete().in("id", inGroup.map((c) => c.id));
    if (error) return toast.error(error.message);
    toast.success("Category deleted");
    load();
  };

  const groups: ChannelGroup[] = [];
  if (channels) {
    const byGroup = new Map<string, ChannelRow[]>();
    for (const c of channels) {
      if (!byGroup.has(c.group_label)) byGroup.set(c.group_label, []);
      byGroup.get(c.group_label)!.push(c);
    }
    for (const [label, items] of byGroup) {
      groups.push({
        label,
        icon: categoryIcons[label] ? getIcon(categoryIcons[label]) : undefined,
        items: items.map((c) => ({
          to: `/home/${c.slug}`,
          label: c.name,
          icon: getIcon(c.icon),
          badge: mentionCounts[`/home/${c.slug}`] ?? 0,
        })),
        onAddItem: isAdmin ? () => setAddChannelGroup(label) : undefined,
        onDeleteItem: isAdmin ? (to) => deleteChannel(to.replace("/home/", "")) : undefined,
        onDeleteGroup: isAdmin ? () => deleteGroup(label) : undefined,
        onEditItemPerms: isAdmin
          ? (to) => {
              const slug = to.replace("/home/", "");
              const ch = channels?.find((x) => x.slug === slug);
              if (ch) navigate({ to: "/admin-permissions", search: { tab: "channels", channel: ch.id } as never });
            }
          : undefined,
        onEditGroupPerms: isAdmin
          ? () => navigate({ to: "/admin-permissions", search: { tab: "channels", group: label } as never })
          : undefined,
        onEditItemIcon: isAdmin
          ? (to) => {
              const slug = to.replace("/home/", "");
              const ch = channels?.find((x) => x.slug === slug);
              if (ch) setEditChannelIcon(ch);
            }
          : undefined,
        onEditGroupIcon: isAdmin ? () => setEditCategoryIcon(label) : undefined,
      });
    }
  }

  return (
    <>
      <ChannelColumn
        title="Support Community"
        groups={groups}
        onAddGroup={isAdmin ? () => setShowAddGroup(true) : undefined}
      />
      <Outlet />

      <Dialog open={!!addChannelGroup} onOpenChange={(o) => !o && setAddChannelGroup(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>New channel in {addChannelGroup}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Channel name</Label>
              <Input autoFocus value={chName} onChange={(e) => setChName(e.target.value)} placeholder="general" />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={chStaffOnly} onChange={(e) => setChStaffOnly(e.target.checked)} />
              Staff-only channel
            </label>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddChannelGroup(null)}>Cancel</Button>
            <Button onClick={createChannel}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showAddGroup} onOpenChange={setShowAddGroup}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>New category</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Category name</Label>
              <Input autoFocus value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="Community" />
              <p className="text-xs text-muted-foreground mt-1">A starter "general" channel will be created in this category.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowAddGroup(false)}>Cancel</Button>
            <Button onClick={createGroup}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <IconPicker
        open={!!editChannelIcon}
        onOpenChange={(o) => !o && setEditChannelIcon(null)}
        title={editChannelIcon ? `Icon for #${editChannelIcon.name}` : "Channel icon"}
        current={editChannelIcon?.icon}
        onSave={saveChannelIcon}
      />

      <IconPicker
        open={!!editCategoryIcon}
        onOpenChange={(o) => !o && setEditCategoryIcon(null)}
        title={editCategoryIcon ? `Icon for ${editCategoryIcon}` : "Category icon"}
        current={editCategoryIcon ? categoryIcons[editCategoryIcon] : undefined}
        onSave={saveCategoryIcon}
      />
    </>
  );
}