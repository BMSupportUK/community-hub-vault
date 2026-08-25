import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Fires `onChange` the moment the score sync writes a new score/minute to
 * `boro_fixtures`, so the match strip and pop-up update instantly instead of
 * waiting for the next poll.
 */
export function useBoroFixtureRealtime(onChange: () => void, channelName = "boro-fixtures-live") {
  const cb = useRef(onChange);
  cb.current = onChange;

  useEffect(() => {
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "boro_fixtures" },
        () => cb.current(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [channelName]);
}
