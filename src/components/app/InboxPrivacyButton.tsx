import { useEffect, useState } from "react";
import { Settings } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { INBOX_PRIVACY_OPTIONS, type InboxPrivacy } from "@/lib/inbox-privacy";

export function InboxPrivacyButton() {
  const [value, setValue] = useState<InboxPrivacy>("everyone");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void supabase.rpc("bm_inbox_my_privacy").then(({ data }) => { if (data) setValue(data as InboxPrivacy); });
  }, []);
  async function change(next: string) {
    const prev = value;
    setValue(next as InboxPrivacy);
    setBusy(true);
    const { error } = await supabase.rpc("bm_inbox_set_privacy", { _value: next });
    setBusy(false);
    if (error) { setValue(prev); toast.error("Could not save your inbox setting."); }
    else toast.success("Inbox setting saved.");
  }
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon" title="Inbox settings" aria-label="Inbox settings"><Settings className="size-4" /></Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72">
        <p className="mb-3 font-semibold">Who can message me</p>
        <RadioGroup value={value} onValueChange={change} disabled={busy} className="gap-3">
          {INBOX_PRIVACY_OPTIONS.map((o) => (
            <div key={o.value} className="flex items-start gap-3">
              <RadioGroupItem value={o.value} id={`inbox-privacy-${o.value}`} className="mt-0.5" />
              <Label htmlFor={`inbox-privacy-${o.value}`} className="flex flex-col gap-0.5 font-normal">
                <span className="font-medium">{o.label}</span>
                <span className="text-xs text-muted-foreground">{o.hint}</span>
              </Label>
            </div>
          ))}
        </RadioGroup>
        <p className="mt-3 text-xs text-muted-foreground">Admin and management can always message you.</p>
      </PopoverContent>
    </Popover>
  );
}
