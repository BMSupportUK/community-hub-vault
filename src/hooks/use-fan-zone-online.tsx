import { useEffect, useState } from "react";
import { subscribeFanZonePresence } from "@/lib/fan-zone-presence";

/**
 * Read-only view of who is currently *in the Boro Fan Zone*.
 *
 * Deliberately separate from the app-shell presence channel: someone browsing
 * BM Support is not "online" in the Fan Zone, so the staff box must show them
 * as away. Reads the shared Fan Zone presence channel.
 */
export function useFanZoneOnlineUsers(): Set<string> {
  const [ids, setIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    return subscribeFanZonePresence(({ keys }) => {
      const next = new Set(
        keys.filter((k) => !k.startsWith("guest-") && !k.startsWith("anon-") && !k.startsWith("observer-")),
      );
      setIds((prev) => {
        if (prev.size === next.size && Array.from(next).every((id) => prev.has(id))) return prev;
        return next;
      });
    });
  }, []);

  return ids;
}
