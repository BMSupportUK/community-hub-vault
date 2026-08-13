import { useAuth } from "@/hooks/use-auth";

/**
 * Fan Zone usernames link to the member profile page when signed in, and to the
 * guest-viewable public Fan Zone profile otherwise (guests must never be bounced
 * to the sign-up gate just to read a profile).
 */
export function useFanProfileTo(): "/fanzone/u/$userId" | "/fan-zone/u/$userId" {
  const { user } = useAuth();
  return user ? "/fanzone/u/$userId" : "/fan-zone/u/$userId";
}
