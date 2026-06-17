import { useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChannelColumn, type ChannelGroup } from "@/components/app/ChannelColumn";
import { ServiceStatusBox } from "@/components/app/ServiceStatusBox";
import { WorkingStatusBox } from "@/components/app/WorkingStatusBox";
import { Skeleton } from "@/components/ui/skeleton";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { getIcon } from "@/components/app/IconPicker";

interface ChannelRow {
  id: string;
  slug: string;
  name: string;
  group_label: string;
  icon: string;
  staff_only: boolean;
  sort_order: number;
}

function useChannelGroups() {
  const { user } = useAuth();
  const path = useRouterState({ select: (r) => r.location.pathname });
  const { data: sidebarData } = useQuery({
    queryKey: ["home-channels-sidebar"],
    queryFn: async () => {
      const [{ data: ch }, { data: icons }, { data: order }] = await Promise.all([
        supabase
          .from("chat_channels")
          .select("id, slug, name, group_label, icon, staff_only, sort_order")
          .order("sort_order"),
        supabase.from("app_settings").select("value").eq("key", "category_icons").maybeSingle(),
        supabase.from("app_settings").select("value").eq("key", "category_order").maybeSingle(),
      ]);
      const value = (order?.value ?? {}) as { labels?: unknown };
      return {
        channels: (ch as ChannelRow[] | null) ?? [],
        categoryIcons: (icons?.value ?? {}) as Record<string, string>,
        categoryOrder: Array.isArray(value.labels)
          ? value.labels.filter((v): v is string => typeof v === "string")
          : [],
      };
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
  const channels = sidebarData?.channels ?? null;
  const categoryIcons = sidebarData?.categoryIcons ?? {};
  const categoryOrder = sidebarData?.categoryOrder ?? [];
  const [mentionCounts, setMentionCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!user) return;
    const uid = user.id;
    const load = async () => {
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
    void load();
    const sub = supabase
      .channel(`sidebar-mentions-${uid}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_notifications", filter: `user_id=eq.${uid}` },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(sub);
    };
  }, [path, user?.id]);

  const groups: ChannelGroup[] = [];
  if (channels) {
    const byGroup = new Map<string, ChannelRow[]>();
    for (const c of channels) {
      if (!byGroup.has(c.group_label)) byGroup.set(c.group_label, []);
      byGroup.get(c.group_label)!.push(c);
    }
    const labels = Array.from(new Set(channels.map((c) => c.group_label)));
    const saved = categoryOrder.filter((l) => labels.includes(l));
    const ordered = [...saved, ...labels.filter((l) => !saved.includes(l))];
    for (const label of ordered) {
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
      });
    }
  }
  return { groups, isLoading: channels === null };
}

export function HomeChannelsSidebar() {
  const { groups, isLoading } = useChannelGroups();
  if (isLoading) {
    return (
      <ChannelColumn
        title="Support Community"
        groups={[
          {
            label: "Loading",
            items: Array.from({ length: 6 }).map((_, i) => ({
              to: `#skeleton-${i}`,
              label: "",
              icon: () => <Skeleton className="size-4 rounded" />,
            })),
          },
        ]}
        footer={<><ServiceStatusBox /><WorkingStatusBox /></>}
      />
    );
  }
  return (
    <ChannelColumn
      title="Support Community"
      groups={groups}
      footer={<><ServiceStatusBox /><WorkingStatusBox /></>}
    />
  );
}