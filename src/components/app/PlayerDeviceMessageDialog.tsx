import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const MAX = 300;

/** Short bottom-screen announcement to one connected BM Player device only. */
export function PlayerDeviceMessageDialog({ device, onOpenChange }: {
  device: { id: string; user_id: string | null; label: string } | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const send = async () => {
    const message = text.trim();
    if (!device || !message) return;
    setBusy(true);
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) { setBusy(false); toast.error("Please sign in again."); return; }
    const ended = await supabase.from("player_announcements").update({ active: false, ended_at: new Date().toISOString() }).eq("active", true);
    const { error } = ended.error ? ended : await supabase.from("player_announcements")
      .insert({ message, created_by: auth.user.id, target_user_id: device.user_id, target_device_id: device.id });
    setBusy(false);
    if (error) { toast.error("Couldn't send the message."); return; }
    toast.success(`Message sent to ${device.label}.`); setText(""); onOpenChange(false);
  };
  return <Dialog open={!!device} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[85dvh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Message this device</DialogTitle>
        <DialogDescription>Shows along the bottom of {device?.label ?? "this device"}'s BM Player only. Other devices on the same account won't see it.</DialogDescription>
      </DialogHeader>
      <Textarea value={text} maxLength={MAX} rows={3} placeholder="e.g. That channel is down — try Sky Sports Main Event 2." onChange={(e) => setText(e.target.value)} />
      <DialogFooter className="items-center gap-2">
        <span className="mr-auto text-xs text-muted-foreground">{text.length}/{MAX}</span>
        <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button onClick={send} disabled={busy || !text.trim()}>{busy && <Loader2 className="size-4 animate-spin" />}Send</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
