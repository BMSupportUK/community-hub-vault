import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";


/**
 * Fires `onChange` whenever an app credential is created or updated.
 *
 * The credentials themselves live in a private schema that browsers can't
 * subscribe to, so a small public `credential_change_events` log is broadcast
 * instead. Pass an `ownerId` to only react to that customer's accounts.
 */
export function useCredentialChanges(onChange: () => void, ownerId?: string | null) {
  const cb = useRef(onChange);
  cb.current = onChange;
  useEffect(() => {

    const channel = supabase
      .channel(`credential-changes-${ownerId ?? "all"}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "credential_change_events",
          ...(ownerId ? { filter: `owner_id=eq.${ownerId}` } : {}),
        },
        () => cb.current(),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerId]);
}
