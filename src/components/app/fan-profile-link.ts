import { useOptionalAuth } from "@/hooks/use-auth";

/**
 * Fan Zone usernames link to the member Fan Zone profile when signed in, and to
 * the guest-viewable public Fan Zone profile otherwise. Neither ever points at a
 * BM Support profile — the two profile types are kept separate.
 */
export function useFanProfileTo(): "/fanzone/u/$userId" | "/fan-zone/u/$userId" {
  const auth = useOptionalAuth();
  return auth?.user ? "/fanzone/u/$userId" : "/fan-zone/u/$userId";
}
