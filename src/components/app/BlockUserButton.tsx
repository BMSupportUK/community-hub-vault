import { useState } from "react";
import { Ban, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useProtectedUsers, protectedRoleLabel } from "@/hooks/use-protected-users";

/**
 * Small block icon shown beside a forum username. Admins, management and
 * moderators are protected: clicking their icon explains why they can't be
 * blocked instead of attempting the block.
 */
export function BlockUserButton({
  targetId,
  name,
  onBlocked,
  className = "",
}: {
  targetId: string;
  name: string;
  onBlocked?: () => void;
  className?: string;
}) {
  const { protectedRoleOf } = useProtectedUsers();
  const role = protectedRoleOf(targetId);
  const [showProtected, setShowProtected] = useState(false);

  const block = async () => {
    if (role) {
      setShowProtected(true);
      return;
    }
    if (!confirm(`Block ${name}? Their posts will be hidden and you won't be able to message each other.`)) return;
    const { error } = await supabase.rpc("fan_zone_block", { _other: targetId });
    if (error) {
      if (error.message.includes("PROTECTED_ROLE")) {
        setShowProtected(true);
        return;
      }
      toast.error("Couldn't block", { description: error.message });
      return;
    }
    toast.success(`${name} blocked`);
    onBlocked?.();
  };

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        className={`h-6 w-6 p-0 align-middle text-muted-foreground hover:text-[#E11B22] ${className}`}
        title={role ? `${protectedRoleLabel(role)} — protected, can't be blocked` : `Block ${name}`}
        aria-label={role ? `${name} is protected and can't be blocked` : `Block ${name}`}
        onClick={() => void block()}
      >
        <Ban className="size-3.5" />
      </Button>

      <Dialog open={showProtected} onOpenChange={setShowProtected}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="size-5 text-[#F4B400]" /> This member is protected
            </DialogTitle>
            <DialogDescription>
              {name} is {protectedRoleLabel(role) || "a staff member"} on BM Support. Admins, management
              and moderators keep the Fan Zone running, so they can't be blocked. If you have an issue
              with a member of staff, please open a support ticket instead.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setShowProtected(false)}>Got it</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
