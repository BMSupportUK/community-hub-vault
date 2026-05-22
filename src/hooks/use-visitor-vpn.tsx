import { useEffect, useState } from "react";
import { checkVisitorVpn } from "@/lib/vpn-public-check.functions";

let cached: boolean | null = null;
let inflight: Promise<boolean> | null = null;

export function useVisitorVpn() {
  const [isVpn, setIsVpn] = useState<boolean>(cached ?? false);

  useEffect(() => {
    if (cached !== null) {
      setIsVpn(cached);
      return;
    }
    if (!inflight) {
      inflight = (async () => {
        try {
          const res = await checkVisitorVpn();
          const flag = !!(res?.is_vpn || res?.is_proxy);
          cached = flag;
          return flag;
        } catch {
          cached = false;
          return false;
        }
      })();
    }
    inflight.then((flag) => setIsVpn(flag));
  }, []);

  return isVpn;
}
