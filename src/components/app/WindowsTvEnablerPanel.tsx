import { Download, Monitor, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import windowsInstaller from "@/assets/BM-TV-Enabler-Setup-1.1.0.exe.asset.json";

export function WindowsTvEnablerPanel() {
  return (
    <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
      <section className="min-w-0">
      <h2 className="flex min-w-0 items-center gap-2 font-display text-2xl font-bold text-foreground">
        <Monitor className="size-6 shrink-0 text-primary" /> BM TV Enabler for Windows
      </h2>
      <h3 className="mt-6 font-display text-lg font-semibold text-foreground">Install and connect</h3>
      <ol className="mt-3 list-decimal space-y-3 pl-5 text-sm text-foreground">
        <li>Download and run the installer on your Windows computer. Follow the installation prompts, then open <strong>BM TV Enabler</strong>.</li>
        <li>Connect the computer and Fire TV to the same home network, not guest Wi-Fi. Disconnect any VPN. If Windows requests network access, allow it only on your trusted private network.</li>
        <li>Install and open <strong>BM Remote Helper</strong> on the Fire TV using the <strong>Amazon Fire TV</strong> tab. Leave it open.</li>
        <li>On the TV, open <strong>Settings → My Fire TV → Developer options → ADB debugging → ON</strong>. Some models call this <strong>Device &amp; Software</strong>. If Developer options is missing, open <strong>About</strong>, highlight your device name and press OK seven times, then go back.</li>
        <li>In the Windows app, press <strong>Find my TV</strong> and select the correct TV by name and address, or enter the address shown in BM Remote Helper. Debugging marked not reachable can mean the switch is off or the network is blocking it.</li>
        <li>Press <strong>Turn on remote control</strong>. When the TV asks <strong>Allow USB debugging?</strong>, tick <strong>Always allow from this computer</strong> and choose <strong>Allow</strong>.</li>
        <li>Wait for the confirmation, then close the Windows app. In BM Remote Helper, use the six-digit code in your support ticket or order when staff request screen sharing and approve the connection on the TV.</li>
        <li>When help is finished, end the session from your ticket, order or TV Helper. This Windows app does not start a support session by itself.</li>
      </ol>
      <p className="mt-4 text-sm text-muted-foreground">The TV's ADB debugging switch must be turned on on the TV itself. Setup normally survives restarts; if connection fails later, check the TV's current address. Never expose debugging through your router to the internet.</p>
      </section>
      <aside aria-label="Windows app download" className="min-w-0 self-start rounded-lg border border-border bg-surface/70 p-5 sm:p-6">
        <h3 className="flex items-center gap-2 font-display text-xl font-semibold text-foreground"><Download className="size-5 shrink-0 text-primary" /> Windows download</h3>
        <p className="mt-3 text-muted-foreground">Free Windows app for enabling BM Remote Control on your Amazon Fire TV. No Android phone or BM Support app login required.</p>
        <p className="mt-3 text-sm font-medium text-foreground">Windows 10 / 11 · 64-bit · Version 1.1 · {Math.round(windowsInstaller.size / 1024 / 1024)} MB</p>
        <Button asChild className="mt-5 h-auto w-full whitespace-normal py-3 text-center">
          <a href={windowsInstaller.url} download="BM-TV-Enabler-Setup-1.1.0.exe"><Download className="size-4 shrink-0" /> Download Windows installer</a>
        </Button>
        <div className="mt-5 flex items-start gap-2 border-l-2 border-primary pl-3 text-sm text-muted-foreground">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-primary" />
          <p>This free release is unsigned. Windows may show an unknown-publisher warning. For the file downloaded here, choose <strong className="text-foreground">More info → Run anyway</strong> if offered. Some managed computers block unsigned apps; do not disable Windows security.</p>
        </div>
      </aside>
    </div>
  );
}