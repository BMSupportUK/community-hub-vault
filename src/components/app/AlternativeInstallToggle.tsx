import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { setAlternativeInstallEnabled, useAlternativeInstallEnabled } from "@/hooks/use-alternative-install";

export function AlternativeInstallToggle() {
  const on = useAlternativeInstallEnabled();
  return <div className="flex items-center justify-between gap-4 border-b border-border/70 pb-5">
    <div>
      <p className="font-semibold text-foreground">Show "Alternative Install methods" on Install Guides</p>
      <p className="text-xs text-muted-foreground">Hidden while customers use our own install system.</p>
    </div>
    <Switch className="shrink-0" checked={on} onCheckedChange={(v) => setAlternativeInstallEnabled(v).catch(() => toast.error("Couldn't save that setting"))} aria-label="Show alternative install methods" />
  </div>;
}
