import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type MentionCandidate = {
  type: "user" | "special";
  key: string; // user_id or special key
  label: string; // display text (without @)
  sublabel?: string;
  avatarUrl?: string | null;
  isStaff?: boolean;
  staffRole?: string | null;
};

const STAFF_SPECIALS: MentionCandidate[] = [
  { type: "special", key: "all", label: "all", sublabel: "Notify everyone in this thread" },
  { type: "special", key: "everyone", label: "everyone", sublabel: "Notify everyone in this thread" },
  { type: "special", key: "admin", label: "admin", sublabel: "All admins" },
  { type: "special", key: "management", label: "management", sublabel: "All management" },
  { type: "special", key: "staff", label: "staff", sublabel: "All staff" },
  { type: "special", key: "moderator", label: "moderator", sublabel: "All moderators" },
  { type: "special", key: "members", label: "members", sublabel: "All fan zone members" },
];

export function useMentionCandidates(canUseSpecials: boolean) {
  const [candidates, setCandidates] = useState<MentionCandidate[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc("forum_mention_candidates");
      if (cancelled || error || !data) return;
      const users: MentionCandidate[] = (data as Array<{
        user_id: string;
        display_name: string | null;
        username: string | null;
        avatar_url: string | null;
        is_staff: boolean;
        staff_role: string | null;
      }>).map((u) => ({
        type: "user",
        key: u.user_id,
        label: (u.display_name || u.username || "user").trim(),
        sublabel: u.username ? `@${u.username}` : undefined,
        avatarUrl: u.avatar_url,
        isStaff: u.is_staff,
        staffRole: u.staff_role,
      }));
      const list = canUseSpecials ? [...STAFF_SPECIALS, ...users] : users;
      setCandidates(list);
    })();
    return () => { cancelled = true; };
  }, [canUseSpecials]);

  return candidates;
}
