import { useState, type ReactNode } from "react";

type SubTab = "setup" | "connection" | "code";

/** Remote setup / New connection / Change code tabs. All panels stay mounted so code status keeps reporting. */
export function RemoteSetupSubTabs({ setup, connection, code }: { setup: ReactNode; connection: ReactNode; code: ReactNode }) {
  const [tab, setTab] = useState<SubTab>("setup");
  const btn = (t: SubTab, label: string) => (
    <button type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
      className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>{label}</button>
  );
  return <div className="space-y-4">
    <div className="inline-flex flex-wrap rounded-xl border border-border bg-card/85 p-1" role="tablist">
      {btn("setup", "Remote setup")}{btn("connection", "New connection")}{btn("code", "Change code")}
    </div>
    <div className={tab === "setup" ? "" : "hidden"}>{setup}</div>
    <div className={tab === "connection" ? "" : "hidden"}>{connection}</div>
    <div className={tab === "code" ? "" : "hidden"}>{code}</div>
  </div>;
}
