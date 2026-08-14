import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Bumps whenever any Boro Fan Zone member row changes (display name / avatar
 * edits included). Use it as a dependency so alias-backed lists refresh live.
 */
export function useFanAliasVersion(): number {
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const ch = supabase
      .channel(`fan-aliases-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "fan_zone_members" },
        () => setVersion((v) => v + 1),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  return version;
}
