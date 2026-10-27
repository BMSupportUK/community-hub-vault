import { useState, type ReactNode } from "react";

type SubTab = "setup" | "connection" | "code";

/** Remote setup / Connect Screen / BM TV Enabler Connection Status tabs. All panels stay mounted so code status keeps reporting. */
export function RemoteSetupSubTabs({ setup, connection, code }: { setup: ReactNode; connection: ReactNode; code: ReactNode }) {
  const [tab, setTab] = useState<SubTab>("setup");
  const btn = (t: SubTab, label: string) => (
    <button type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
      className={`shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-semibold ${tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>{label}</button>
  );
  return <div className="space-y-4">
    <div className="flex flex-col gap-1 rounded-xl border border-border bg-card/85 p-1 sm:flex-row sm:flex-nowrap sm:overflow-x-auto sm:[scrollbar-width:none] sm:[&::-webkit-scrollbar]:hidden" role="tablist">
      {btn("setup", "Remote setup")}{btn("connection", "Connect Screen")}{btn("code", "BM TV Enabler Connection Status")}
    </div>
    <div className={tab === "setup" ? "" : "hidden"}>{setup}</div>
    <div className={tab === "connection" ? "" : "hidden"}>{connection}</div>
    <div className={tab === "code" ? "" : "hidden"}>{code}</div>
  </div>;
}
