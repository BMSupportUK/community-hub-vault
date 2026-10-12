import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Repeat } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { isDemoAccount, switchDemoRole } from "@/lib/demo-role.functions";
import { Button } from "@/components/ui/button";

/**
 * Top-of-page banner shown only to the live demo account, letting it flip
 * between the subscriber and staff layouts. Renders nothing for anyone else.
 */
export function DemoRoleBanner() {
  const { user, roles, refreshRoles } = useAuth();
  const navigate = useNavigate();
  const [isDemo, setIsDemo] = useState(false);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    isDemoAccount().then((r) => setIsDemo(r.demo)).catch(() => setIsDemo(false));
  }, [user?.id]);

  if (!isDemo) return null;

  const staffView = roles.includes("staff");

  const flip = async () => {
    setSwitching(true);
    try {
      const to = staffView ? "subscriber" : "staff";
      await switchDemoRole({ data: { to } });
      await refreshRoles();
      toast.success(to === "staff" ? "Now showing the staff layout" : "Now showing the subscriber layout");
      navigate({ to: "/home" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't switch view");
    } finally {
      setSwitching(false);
    }
  };

  return (
    <div className="sticky top-0 z-40 w-full bg-gradient-primary text-primary-foreground shadow-soft">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-center gap-2 px-3 py-2 text-center">
        <span className="text-xs font-semibold sm:text-sm">
          Demo account — currently viewing the {staffView ? "staff" : "subscriber"} layout
        </span>
        <Button
          size="sm"
          variant="secondary"
          className="h-7 gap-1.5 px-3 text-xs font-semibold"
          onClick={() => void flip()}
          disabled={switching}
        >
          <Repeat className="size-3.5" />
          {switching ? "Switching…" : staffView ? "Switch to subscriber view" : "Switch to staff view"}
        </Button>
      </div>
    </div>
  );
}
