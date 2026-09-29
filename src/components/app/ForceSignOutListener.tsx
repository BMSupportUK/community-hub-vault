import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

function currentSessionId(token?: string | null): string | null {
  try {
    if (!token) return null;
    const p = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return typeof p.session_id === "string" ? p.session_id : null;
  } catch {
    return null;
  }
}

/** Signs this device out when an admin revokes the account's sessions remotely. */
export function ForceSignOutListener() {
  const { user, signOut } = useAuth();
  const uid = user?.id;
  useEffect(() => {
    if (!uid) return;
    const ch = supabase
      .channel(`force-signout-${uid}`)
      .on("broadcast", { event: "force-signout" }, async ({ payload }) => {
        const { data } = await supabase.auth.getSession();
        const mine = currentSessionId(data.session?.access_token);
        if (payload?.keepSessionId && mine && payload.keepSessionId === mine) return;
        toast.error("You've been signed out of this device.");
        await signOut();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [uid, signOut]);
  return null;
}
