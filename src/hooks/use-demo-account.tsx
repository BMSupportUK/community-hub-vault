import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { isDemoAccount } from "@/lib/demo-role.functions";

const cache = new Map<string, boolean>();

/** True only for the live temporary demo account. Cached per user. */
export function useIsDemoAccount() {
  const { user } = useAuth();
  const id = user?.id;
  const [demo, setDemo] = useState(() => (id ? cache.get(id) ?? false : false));
  useEffect(() => {
    if (!id) return setDemo(false);
    if (cache.has(id)) return setDemo(cache.get(id)!);
    isDemoAccount()
      .then((r) => { cache.set(id, r.demo); setDemo(r.demo); })
      .catch(() => setDemo(false));
  }, [id]);
  return demo;
}

/** Pages that hold live customer data, downloads or DNS codes. */
export function isDemoLockedPath(path: string, ownUsername: string | null, staffView: boolean) {
  if (/^\/(members|install-guides|inbox|staff|admin)/.test(path)) return true;
  if (path.startsWith("/home/")) return true; // Talk channels show live staff chat
  if (staffView && path.startsWith("/tickets")) return true; // live customer tickets
  if (path.startsWith("/u/")) {
    const name = decodeURIComponent(path.split("/")[2] ?? "");
    return !ownUsername || name.toLowerCase() !== ownUsername.toLowerCase();
  }
  return false;
}
