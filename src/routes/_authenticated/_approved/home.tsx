import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Hash, Megaphone } from "lucide-react";
import { ChannelColumn, type ChannelGroup } from "@/components/app/ChannelColumn";
import { supabase } from "@/integrations/supabase/client";

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

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Megaphone,
  Hash,
};

function HomeLayout() {
  const [channels, setChannels] = useState<ChannelRow[] | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("chat_channels")
        .select("id, slug, name, group_label, icon, staff_only, sort_order")
        .order("sort_order");
      setChannels((data as ChannelRow[] | null) ?? []);
    })();
  }, []);

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
        items: items.map((c) => ({
          to: `/home/${c.slug}`,
          label: c.name,
          icon: ICONS[c.icon] ?? Hash,
        })),
      });
    }
  }

  return (
    <>
      <ChannelColumn title="Hub" groups={groups} />
      <Outlet />
    </>
  );
}