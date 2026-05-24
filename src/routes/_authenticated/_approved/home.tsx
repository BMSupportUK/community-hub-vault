import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Hash, Menu } from "lucide-react";
import { ChannelColumn, type ChannelGroup } from "@/components/app/ChannelColumn";
import { ServiceStatusBox } from "@/components/app/ServiceStatusBox";
import { MembershipBox } from "@/components/app/MembershipBox";
import { SecurityBox } from "@/components/app/SecurityBox";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
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
  const path = useRouterState({ select: (r) => r.location.pathname });
  const [channels, setChannels] = useState<ChannelRow[] | null>(null);
  const [chanNavOpen, setChanNavOpen] = useState(false);
  useEffect(() => { setChanNavOpen(false); }, [path]);
  const [mentionCounts, setMentionCounts] = useState<Record<string, number>>({});
  const [addChannelGroup, setAddChannelGroup] = useState<string | null>(null);
  const [showAddGroup, setShowAddGroup] = useState(false);
  const [chName, setChName] = useState("");
  const [chStaffOnly, setChStaffOnly] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [categoryIcons, setCategoryIcons] = useState<Record<string, string>>({});
  const [categoryOrder, setCategoryOrder] = useState<string[]>([]);
  const [editChannelIcon, setEditChannelIcon] = useState<ChannelRow | null>(null);
  const [editCategoryIcon, setEditCategoryIcon] = useState<string | null>(null);
  const [renameChannel, setRenameChannel] = useState<ChannelRow | null>(null);
  const [renameChannelName, setRenameChannelName] = useState("");
  const [renameCategory, setRenameCategory] = useState<string | null>(null);
  const [renameCategoryName, setRenameCategoryName] = useState("");

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

  const loadCategoryOrder = async () => {
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "category_order")
      .maybeSingle();
    const value = (data?.value ?? {}) as { labels?: unknown };
    setCategoryOrder(
      Array.isArray(value.labels)
        ? value.labels.filter((v): v is string => typeof v === "string")
        : [],
    );
  };

  useEffect(() => {
    load();
    loadCategoryIcons();
    loadCategoryOrder();
  }, []);

  const saveChannelIcon = async (iconName: string): Promise<void> => {
    if (!editChannelIcon) return;
    const { error } = await supabase
      .from("chat_channels")
      .update({ icon: iconName })
      .eq("id", editChannelIcon.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Icon updated");
    load();
  };

  const saveCategoryIcon = async (iconName: string): Promise<void> => {
    if (!editCategoryIcon) return;
    const next = { ...categoryIcons, [editCategoryIcon]: iconName };
    const { error } = await supabase
      .from("app_settings")
      .upsert(
        { key: "category_icons", value: next, updated_at: new Date().toISOString() },
        { onConflict: "key" },
      );
    if (error) {
      toast.error(error.message);
      return;
    }
    setCategoryIcons(next);
    toast.success("Icon updated");
  };

  useEffect(() => {
    if (!user) return;
    const uid = user.id;
    const loadCounts = async () => {
      const { data } = await supabase
        .from("user_notifications")
        .select("link_path")
        .eq("user_id", uid)
        .eq("kind", "mention")
        .is("read_at", null);
      const map: Record<string, number> = {};
      (data ?? []).forEach((r: { link_path: string | null }) => {
        if (!r.link_path) return;
        if (r.link_path === path) return;
        map[r.link_path] = (map[r.link_path] ?? 0) + 1;
      });
      setMentionCounts(map);
    };
    loadCounts();
    const ch = supabase
      .channel(`home-mentions-${uid}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_notifications", filter: `user_id=eq.${uid}` },
        () => loadCounts(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [path, user?.id]);

  // Clear the visible per-channel mention badge as soon as that channel is opened.
  useEffect(() => {
    if (!user || !path.startsWith("/home/")) return;
    setMentionCounts((prev) => {
      if (!prev[path]) return prev;
      const next = { ...prev };
      delete next[path];
      return next;
    });
    void supabase
      .from("user_notifications")
      .delete()
      .eq("user_id", user.id)
      .eq("kind", "mention")
      .eq("link_path", path);
  }, [path, user]);

  const slugify = (s: string) =>
    s
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || `ch-${Date.now()}`;

  const orderedLabelsFor = (rows: ChannelRow[] = channels ?? []) => {
    const labels = Array.from(new Set(rows.map((c) => c.group_label)));
    const saved = categoryOrder.filter((label) => labels.includes(label));
    return [...saved, ...labels.filter((label) => !saved.includes(label))];
  };

  const saveCategoryOrder = async (labels: string[]) => {
    const clean = Array.from(new Set(labels.filter(Boolean)));
    setCategoryOrder(clean);
    const { error } = await supabase
      .from("app_settings")
      .upsert(
        { key: "category_order", value: { labels: clean }, updated_at: new Date().toISOString() },
        { onConflict: "key" },
      );
    if (error) {
      toast.error(error.message);
      loadCategoryOrder();
      return false;
    }
    return true;
  };

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
    await saveCategoryOrder([...orderedLabelsFor(), label]);
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
    const { error } = await supabase
      .from("chat_channels")
      .delete()
      .in(
        "id",
        inGroup.map((c) => c.id),
      );
    if (error) return toast.error(error.message);
    await saveCategoryOrder(orderedLabelsFor().filter((item) => item !== label));
    toast.success("Category deleted");
    load();
  };

  const saveChannelRename = async () => {
    if (!renameChannel) return;
    const name = renameChannelName.trim();
    if (!name) return toast.error("Name cannot be empty");
    const { error } = await supabase
      .from("chat_channels")
      .update({ name })
      .eq("id", renameChannel.id);
    if (error) return toast.error(error.message);
    toast.success("Channel renamed");
    setRenameChannel(null);
    setRenameChannelName("");
    load();
  };

  const saveCategoryRename = async () => {
    if (!renameCategory) return;
    const next = renameCategoryName.trim();
    if (!next) return toast.error("Name cannot be empty");
    if (next === renameCategory) {
      setRenameCategory(null);
      return;
    }
    const ids = (channels ?? []).filter((c) => c.group_label === renameCategory).map((c) => c.id);
    if (ids.length === 0) {
      setRenameCategory(null);
      return;
    }
    const { error } = await supabase
      .from("chat_channels")
      .update({ group_label: next })
      .in("id", ids);
    if (error) return toast.error(error.message);
    await saveCategoryOrder(
      orderedLabelsFor().map((label) => (label === renameCategory ? next : label)),
    );
    if (categoryIcons[renameCategory]) {
      const merged = { ...categoryIcons, [next]: categoryIcons[renameCategory] };
      delete merged[renameCategory];
      await supabase
        .from("app_settings")
        .upsert(
          { key: "category_icons", value: merged, updated_at: new Date().toISOString() },
          { onConflict: "key" },
        );
      setCategoryIcons(merged);
    }
    toast.success("Category renamed");
    setRenameCategory(null);
    setRenameCategoryName("");
    load();
  };

  const groups: ChannelGroup[] = [];
  if (channels) {
    const byGroup = new Map<string, ChannelRow[]>();
    for (const c of channels) {
      if (!byGroup.has(c.group_label)) byGroup.set(c.group_label, []);
      byGroup.get(c.group_label)!.push(c);
    }
    for (const label of orderedLabelsFor()) {
      const items = byGroup.get(label) ?? [];
      groups.push({
        label,
        icon: categoryIcons[label] ? getIcon(categoryIcons[label]) : undefined,
        items: items.map((c) => ({
          id: c.id,
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
              if (ch)
                navigate({
                  to: "/admin-permissions",
                  search: { tab: "channels", channel: ch.id } as never,
                });
            }
          : undefined,
        onEditGroupPerms: isAdmin
          ? () =>
              navigate({
                to: "/admin-permissions",
                search: { tab: "channels", group: label } as never,
              })
          : undefined,
        onEditItemIcon: isAdmin
          ? (to) => {
              const slug = to.replace("/home/", "");
              const ch = channels?.find((x) => x.slug === slug);
              if (ch) setEditChannelIcon(ch);
            }
          : undefined,
        onEditGroupIcon: isAdmin ? () => setEditCategoryIcon(label) : undefined,
        onRenameItem: isAdmin
          ? (to) => {
              const slug = to.replace("/home/", "");
              const ch = channels?.find((x) => x.slug === slug);
              if (ch) {
                setRenameChannel(ch);
                setRenameChannelName(ch.name);
              }
            }
          : undefined,
        onRenameGroup: isAdmin
          ? () => {
              setRenameCategory(label);
              setRenameCategoryName(label);
            }
          : undefined,
      });
    }
  }

  const reorderChannels = async (ordered: { id: string; groupLabel: string }[]) => {
    if (!channels) return;
    const byId = new Map(channels.map((c) => [c.id, c]));
    const next = ordered.map((o, i) => {
      const prev = byId.get(o.id)!;
      return { ...prev, group_label: o.groupLabel, sort_order: (i + 1) * 10 };
    });
    setChannels(next);
    const results = await Promise.all(
      next.map((c) =>
        supabase
          .from("chat_channels")
          .update({ sort_order: c.sort_order, group_label: c.group_label })
          .eq("id", c.id),
      ),
    );
    const err = results.find((r) => r.error)?.error;
    if (err) {
      toast.error(err.message);
      load();
    }
  };

  const reorderGroups = async (orderedLabels: string[]) => {
    if (!channels) return;
    await saveCategoryOrder(orderedLabels);
  };

  return (
    <>
      <ChannelColumn
        title="Support Community"
        groups={groups}
        onAddGroup={isAdmin ? () => setShowAddGroup(true) : undefined}
        onReorderChannels={isAdmin ? reorderChannels : undefined}
        onReorderGroups={isAdmin ? reorderGroups : undefined}
        footer={<><MembershipBox /><SecurityBox /><ServiceStatusBox /></>}
      />
      <div className="flex-1 flex flex-col min-w-0">
        <div className="md:hidden h-10 shrink-0 flex items-center px-3 border-b border-border bg-rail/30">
          <Sheet open={chanNavOpen} onOpenChange={setChanNavOpen}>
            <SheetTrigger className="inline-flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground">
              <Menu className="size-4" />
              Channels
            </SheetTrigger>
            <SheetContent side="left" className="p-0 w-72 bg-surface border-r border-border">
              <ChannelColumn
                inSheet
                title="Support Community"
                groups={groups}
                onAddGroup={isAdmin ? () => setShowAddGroup(true) : undefined}
                onReorderChannels={isAdmin ? reorderChannels : undefined}
                onReorderGroups={isAdmin ? reorderGroups : undefined}
                footer={<><MembershipBox /><SecurityBox /><ServiceStatusBox /></>}
              />
            </SheetContent>
          </Sheet>
        </div>
        <div className="flex-1 flex min-h-0 min-w-0">
          <Outlet />
        </div>
      </div>

      <Dialog open={!!addChannelGroup} onOpenChange={(o) => !o && setAddChannelGroup(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>New channel in {addChannelGroup}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Channel name</Label>
              <Input
                autoFocus
                value={chName}
                onChange={(e) => setChName(e.target.value)}
                placeholder="general"
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={chStaffOnly}
                onChange={(e) => setChStaffOnly(e.target.checked)}
              />
              Staff-only channel
            </label>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddChannelGroup(null)}>
              Cancel
            </Button>
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
              <Input
                autoFocus
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="Community"
              />
              <p className="text-xs text-muted-foreground mt-1">
                A starter "general" channel will be created in this category.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowAddGroup(false)}>
              Cancel
            </Button>
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

      <Dialog open={!!renameChannel} onOpenChange={(o) => !o && setRenameChannel(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename channel</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Channel name</Label>
              <Input
                autoFocus
                value={renameChannelName}
                onChange={(e) => setRenameChannelName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveChannelRename();
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRenameChannel(null)}>
              Cancel
            </Button>
            <Button onClick={saveChannelRename}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!renameCategory} onOpenChange={(o) => !o && setRenameCategory(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename category</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Category name</Label>
              <Input
                autoFocus
                value={renameCategoryName}
                onChange={(e) => setRenameCategoryName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveCategoryRename();
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRenameCategory(null)}>
              Cancel
            </Button>
            <Button onClick={saveCategoryRename}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
