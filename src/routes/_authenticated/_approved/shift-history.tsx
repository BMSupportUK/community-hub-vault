import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import ShiftHistoryPanel from "@/components/app/ShiftHistoryPanel";
import { staffDisplayName } from "@/lib/staff-display-name";
import { useAuth } from "@/hooks/use-auth";
import officeIllustration from "@/assets/staff-office-illustration.jpg";

export const Route = createFileRoute("/_authenticated/_approved/shift-history")({
  head: () => ({
    meta: [
      { title: "Shift History | BM Support" },
      { name: "description", content: "Your shift history, breaks and Away time." },
      { property: "og:title", content: "Shift History | BM Support" },
      { property: "og:description", content: "Your shift history, breaks and Away time." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ShiftHistoryPage,
});

function ShiftHistoryPage() {
  const { hasAny, user } = useAuth();
  const isStaff = hasAny(["admin", "management", "staff", "moderator"]);
  const [profile, setProfile] = useState<{ username: string | null; display_name: string | null } | null>(null);

  // The page is titled with the signed-in person's username, so it has to be
  // read from the profiles table — the auth session only carries the email.
  useEffect(() => {
    if (!user) return;
    let alive = true;
    void supabase
      .from("profiles")
      .select("username, display_name")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (alive) setProfile(data);
      });
    return () => {
      alive = false;
    };
  }, [user?.id]);

  if (!isStaff || !user) {
    return (
      <div className="h-full overflow-y-auto p-6">
        <p className="text-sm text-muted-foreground">Shift history is only for the support team.</p>
      </div>
    );
  }

  // Never fall back to the email address — usernames only, then the display name.
  const username = profile?.username?.trim() || "";
  const name = staffDisplayName(profile);

  return (
    <div className="relative isolate h-full min-h-dvh w-full min-w-0 flex-1 overflow-y-auto lg:min-h-0">
      <img src={officeIllustration} alt="" aria-hidden="true" className="absolute inset-0 -z-20 size-full object-cover object-center" />
      <div className="absolute inset-0 -z-10 bg-background/60" />
      <div className="relative w-full min-w-0 space-y-4 p-4 sm:p-6 lg:p-8">
        <Link to="/home" className="inline-flex items-center gap-1.5 text-xs text-foreground hover:text-primary">
          <ArrowLeft className="size-3.5" /> Back
        </Link>
        <ShiftHistoryPanel userId={user.id} name={name} username={username} />
      </div>
    </div>
  );
}
