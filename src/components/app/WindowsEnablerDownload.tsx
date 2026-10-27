import { Button } from "@/components/ui/button";
import { WINDOWS_ENABLER_URL } from "@/components/app/WindowsTvEnablerPanel";

/** Windows download card shown in its own column beside the phone Enabler QR on remote setup. */
export function WindowsEnablerDownload() {
  return <div className="space-y-2">
    <h3 className="font-semibold">No Android phone? Use a Windows PC</h3>
    <p className="text-sm text-muted-foreground">Install BM TV Enabler for Windows, then type the code it shows here — it ticks the steps the same way.</p>
    <Button asChild size="sm" className="w-full"><a href={WINDOWS_ENABLER_URL} download="BM-TV-Enabler-Setup.exe">Download for Windows</a></Button>
    <p className="text-xs text-muted-foreground">Windows 10 / 11 · free, unsigned — choose More info › Run anyway if warned.</p>
  </div>;
}
