export type NotifyChannel = "browser" | "phone";
export const NOTIFY_CATEGORIES = [
  { id: "tickets", label: "Support tickets", hint: "New tickets, replies and assignments" },
  { id: "messages", label: "Messages", hint: "Inbox messages, Talk and mentions" },
  { id: "orders", label: "Orders & payments", hint: "New orders and payment updates" },
  { id: "shifts", label: "Shifts & breaks", hint: "Clock in/out, breaks and shift reminders" },
  { id: "outages", label: "Service status", hint: "Outages and status updates" },
  { id: "general", label: "Everything else", hint: "Any other alerts" },
] as const;
export type NotifyCategory = (typeof NOTIFY_CATEGORIES)[number]["id"];

/** Works out which category an alert belongs to from its kind, tag or link. */
export function notifyCategory(kind?: string | null, tag?: string | null, url?: string | null): NotifyCategory {
  const s = `${kind ?? ""} ${tag ?? ""} ${url ?? ""}`.toLowerCase();
  if (/incident|outage|\/status/.test(s)) return "outages";
  if (/shift|break|clock|early-finish|rota|reminder|cover/.test(s)) return "shifts";
  if (/ticket/.test(s)) return "tickets";
  if (/\bdm\b|dm-|inbox|message|talk|mention|chat/.test(s)) return "messages";
  if (/order|sale|checkout|payment|invoice/.test(s)) return "orders";
  return "general";
}
