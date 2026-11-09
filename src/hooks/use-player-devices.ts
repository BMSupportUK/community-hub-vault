import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export type PlayerDevice = { id: string; name: string; platform: string; linked_at: string | null; last_seen_at: string; credential_id: string | null; iptv_username: string | null };

export function usePlayerDevices() {
  const { user } = useAuth();
  const [devices, setDevices] = useState<PlayerDevice[]>([]);
  const load = useCallback(async () => {
    if (!user) { setDevices([]); return; }
    const { data } = await supabase.from("player_devices").select("id, name, platform, linked_at, last_seen_at, credential_id, iptv_username")
      .eq("user_id", user.id).order("linked_at", { ascending: false });
    setDevices((data ?? []) as PlayerDevice[]);
  }, [user]);
  useEffect(() => {
    void load();
    const again = () => { void load(); };
    window.addEventListener("bm-profile-data-changed", again);
    return () => window.removeEventListener("bm-profile-data-changed", again);
  }, [load]);
  return { devices, reload: load };
}

