/** Made-up records shown only to the demo account, never live data. */
const day = 86400000;
const ago = (d: number) => new Date(Date.now() - d * day).toISOString();

const p = (n: number, username: string, display_name: string, d: number) => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
  username,
  display_name,
  avatar_url: null,
  bio: null,
  created_at: ago(d),
  is_private: false,
  last_seen_at: ago(n % 3),
  equipped_nameplate_id: null,
});

export const DEMO_STAFF = [
  p(1, "sample-admin", "Sample Admin", 400),
  p(2, "sample-manager", "Sample Manager", 300),
  p(3, "sample-staff", "Sample Staff", 200),
  p(4, "sample-moderator", "Sample Moderator", 150),
];
export const DEMO_MEMBERS = [
  p(11, "demo-member-1", "Demo Member 1", 90),
  p(12, "demo-member-2", "Demo Member 2", 60),
  p(13, "demo-member-3", "Demo Member 3", 30),
  p(14, "demo-member-4", "Demo Member 4", 10),
];
export const DEMO_ROLES = [
  { user_id: DEMO_STAFF[0].id, role: "admin" },
  { user_id: DEMO_STAFF[1].id, role: "management" },
  { user_id: DEMO_STAFF[2].id, role: "staff" },
  { user_id: DEMO_STAFF[3].id, role: "moderator" },
  ...DEMO_MEMBERS.map((m) => ({ user_id: m.id, role: "subscriber" })),
];

export function demoTickets(userId: string) {
  const t = (n: number, subject: string, status: string, priority: string, d: number) => ({
    id: `00000000-0000-4000-9000-${String(n).padStart(12, "0")}`,
    user_id: userId,
    category_id: null,
    subject,
    status,
    priority,
    assigned_to: DEMO_STAFF[2].id,
    created_at: ago(d),
    updated_at: ago(d / 2),
    closed_at: status === "closed" ? ago(d / 2) : null,
    order_id: null,
    archived_at: null,
  });
  return [
    t(1, "Sample: channel buffering", "open", "normal", 1),
    t(2, "Sample: help setting up my app", "in_progress", "high", 3),
    t(3, "Sample: forgot my login", "closed", "normal", 9),
  ];
}
export const DEMO_PROFILE_MAP: [string, { id: string; display_name: string; username: string }][] =
  DEMO_STAFF.map((s) => [s.id, { id: s.id, display_name: s.display_name, username: s.username }]);

export const DEMO_LATEST_ORDER = {
  id: "00000000-0000-4000-a000-000000000001",
  status: "paid",
  paid_at: ago(5),
  completed_at: null,
  created_at: ago(5),
  ticket_id: null,
};

export function demoReferrals() {
  const r = (n: number, used: boolean, paid: boolean, d: number) => ({
    id: `00000000-0000-4000-b000-${String(n).padStart(12, "0")}`,
    code: `DEMO${1000 + n}`,
    used_by: used ? DEMO_MEMBERS[n % DEMO_MEMBERS.length].id : null,
    used_at: used ? ago(d - 1) : null,
    created_at: ago(d),
    referral_bonus_paid: paid,
    joined_name: used ? DEMO_MEMBERS[n % DEMO_MEMBERS.length].display_name : null,
    joined_username: used ? DEMO_MEMBERS[n % DEMO_MEMBERS.length].username : null,
  });
  return [r(1, true, true, 40), r(2, true, false, 20), r(3, false, false, 5)];
}

/** Sample staff rota for the demo account, built around the week being viewed. */
export function demoRota(weekStart: Date) {
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const day = (i: number) => { const d = new Date(weekStart); d.setDate(d.getDate() + i); return d; };
  let n = 0;
  const slot = (
    i: number, start: string, end: string,
    role: "admin" | "management" | "staff" | "moderator",
    assigned: string | null, type: "shift" | "hourly" = "shift",
  ) => ({
    id: `00000000-0000-4000-c000-${String(++n).padStart(12, "0")}`,
    shift_date: fmt(day(i)),
    start_time: start,
    end_time: end,
    slot_type: type,
    assigned_to: assigned,
    notes: null,
    required_role: role,
  });
  const [admin, manager, staff, mod] = DEMO_STAFF.map((s) => s.id);
  const slots = [
    // Monday
    slot(0, "09:00", "19:00", "admin", admin),
    slot(0, "09:00", "19:00", "management", manager),
    slot(0, "09:00", "19:00", "staff", staff),
    slot(0, "09:00", "19:00", "staff", null),
    slot(0, "09:00", "19:00", "moderator", mod, "hourly"),
    // Tuesday
    slot(1, "09:00", "19:00", "admin", admin),
    slot(1, "09:00", "19:00", "management", null),
    slot(1, "09:00", "19:00", "staff", staff),
    slot(1, "09:00", "19:00", "staff", null),
    // Wednesday
    slot(2, "09:00", "19:00", "admin", null),
    slot(2, "09:00", "19:00", "management", manager),
    slot(2, "09:00", "19:00", "staff", staff),
    slot(2, "09:00", "19:00", "moderator", mod, "hourly"),
    // Thursday
    slot(3, "09:00", "19:00", "admin", admin),
    slot(3, "09:00", "19:00", "staff", null),
    slot(3, "09:00", "19:00", "staff", null),
    // Friday
    slot(4, "09:00", "19:00", "admin", admin),
    slot(4, "09:00", "19:00", "management", manager),
    slot(4, "09:00", "19:00", "staff", staff),
    // Saturday
    slot(5, "10:00", "18:00", "admin", null),
    slot(5, "10:00", "18:00", "staff", staff),
    slot(5, "10:00", "18:00", "moderator", null, "hourly"),
    // Sunday
    slot(6, "10:00", "18:00", "management", manager),
    slot(6, "10:00", "18:00", "staff", null),
  ];
  const holidays = [{
    id: "00000000-0000-4000-c100-000000000001",
    user_id: staff,
    start_date: fmt(day(9)),
    end_date: fmt(day(12)),
    reason: "Sample: family holiday",
    status: "pending",
    created_at: ago(2),
    decision_reason: null,
  }];
  const swaps = [{
    id: "00000000-0000-4000-c200-000000000001",
    slot_id: slots[0].id,
    requester_id: admin,
    target_user_id: manager,
    message: "Sample: can you cover my Monday?",
    status: "pending",
    created_at: ago(1),
  }];
  const profiles = Object.fromEntries(
    DEMO_STAFF.map((s) => [s.id, { id: s.id, username: s.username, display_name: s.display_name }]),
  );
  return { slots, holidays, swaps, profiles };
}

/** Sample secure-order page content for /pay/demo. */
export const DEMO_CHECKOUT_VIEW = {
  order: {
    ref: "DEMO-0001",
    name: "Demo Customer",
    totalCents: 6000,
    discountCents: 0,
    paidAt: ago(5),
    completedAt: null,
    method: "wise",
    customerKind: "new" as const,
    createdAt: ago(5),
    email: null,
    status: "paid",
    paymentSentAt: ago(5),
    accountSetupStartedAt: ago(4),
    accountSetupAt: null,
  },
  items: [{ name: "Sample 12 month subscription", qty: 1, unitCents: 6000 }],
  invoice: null,
  bank: { account_name: "Sample Account", sort_code: "00-00-00", account_number: "00000000", iban: null, bic: null },
  qdCode: { label: "Sample DNS", code: "000000" },
};
