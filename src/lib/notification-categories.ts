export type NotifyChannel = "browser" | "phone";
type Role = "admin" | "management" | "staff" | "moderator" | "member";

const ADMIN: Role[] = ["admin", "management"];
const STAFF: Role[] = ["admin", "management", "staff", "moderator"];
const EVERYONE: Role[] = [...STAFF, "member"];

/** Every alert type, and which roles can ever receive it. */
export const NOTIFY_CATEGORIES = [
  { id: "messages", label: "Inbox messages", hint: "Private messages sent to you", roles: EVERYONE },
  { id: "mentions", label: "Mentions", hint: "When someone @mentions you", roles: EVERYONE },
  { id: "my_orders", label: "Your orders", hint: "Your order is paid or updated", roles: EVERYONE },
  { id: "outages", label: "Service status", hint: "Outages and status updates", roles: EVERYONE },
  { id: "app_updates", label: "App updates", hint: "A new version of the BM Support app", roles: EVERYONE },
  { id: "new_tickets", label: "New support tickets", hint: "A customer opens a ticket", roles: STAFF },
  { id: "ticket_replies", label: "Ticket replies & handovers", hint: "Replies on tickets assigned to you", roles: STAFF },
  { id: "ticket_assigned", label: "Ticket assigned to you", hint: "A ticket is passed to you", roles: STAFF },
  { id: "live_help", label: "Video help requests", hint: "A customer asks for live video help", roles: STAFF },
  { id: "shifts", label: "Shift alerts", hint: "Clock in/out, shift start and end reminders", roles: STAFF },
  { id: "breaks", label: "Break alerts", hint: "Break starting and ending", roles: STAFF },
  { id: "early_finish", label: "Early finish requests", hint: "Early finish asked for or answered", roles: STAFF },
  { id: "access_requests", label: "Access requests", hint: "New sign-up requests and gate messages", roles: ["admin", "management", "moderator"] as Role[] },
  { id: "new_orders", label: "New orders", hint: "A customer places an order", roles: ADMIN },
  { id: "payments", label: "Payments received", hint: "Invoices paid and Wise transfers", roles: ADMIN },
  { id: "checkout_chat", label: "Secure checkout chat", hint: "Customer messages on an order", roles: ADMIN },
  { id: "owner_tickets", label: "Tickets raised to owner", hint: "Tickets escalated to admin", roles: ADMIN },
  { id: "general", label: "Everything else", hint: "Any other alerts", roles: EVERYONE },
] as const;
export type NotifyCategory = (typeof NOTIFY_CATEGORIES)[number]["id"];

/** The alert types this person's roles can actually receive. */
export function categoriesForRoles(roles: string[]) {
  const mine = new Set<string>(roles.length ? [...roles, "member"] : ["member"]);
  return NOTIFY_CATEGORIES.filter((c) => (c.roles as readonly string[]).some((r) => mine.has(r)));
}

const BY_KIND: Record<string, NotifyCategory> = {
  dm: "messages",
  mention: "mentions",
  order_paid: "my_orders",
  incident: "outages",
  app_update: "app_updates",
  ticket: "new_tickets",
  ticket_raised: "new_tickets",
  "ticket-reply": "ticket_replies",
  ticket_assigned: "ticket_assigned",
  live_help: "live_help",
  shift: "shifts",
  staff_auto_clock_in: "shifts",
  shift_auto_clock_in: "shifts",
  shift_start_warn: "shifts",
  shift_start_over: "shifts",
  break: "breaks",
  break_warn: "breaks",
  early_finish: "early_finish",
  "early-finish": "early_finish",
  gate_application: "access_requests",
  gate_message: "access_requests",
  order_placed: "new_orders",
  invoice_paid: "payments",
  wise_payment: "payments",
  checkout_chat: "checkout_chat",
  ticket_raised_owner: "owner_tickets",
};

/** Works out which alert type something is from its kind, tag or link. */
export function notifyCategory(kind?: string | null, tag?: string | null, url?: string | null): NotifyCategory {
  if (kind && BY_KIND[kind]) return BY_KIND[kind];
  const s = `${kind ?? ""} ${tag ?? ""} ${url ?? ""}`.toLowerCase();
  if (/incident|outage|\/status/.test(s)) return "outages";
  if (/bplan:|break/.test(s)) return "breaks";
  if (/early-finish|early_finish/.test(s)) return "early_finish";
  if (/slot:|shift|clock|rota|cover/.test(s)) return "shifts";
  if (/ticket-reply|ticket-handover/.test(s)) return "ticket_replies";
  if (/ticket/.test(s)) return "new_tickets";
  if (/\bdm\b|dm-|inbox/.test(s)) return "messages";
  if (/mention/.test(s)) return "mentions";
  return "general";
}
