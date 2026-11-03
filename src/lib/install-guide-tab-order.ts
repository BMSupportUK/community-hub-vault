export const INSTALL_TAB_ORDER_KEY = "install_guides_tab_order";

export const INSTALL_TABS = [
  { key: "welcome", label: "Welcome" },
  { key: "setup", label: "Setup Device | Direct To Device" },
  { key: "link-device", label: "Link Device" },
  { key: "phone-windows-setup", label: "Setup Your Device Using | Android Phone | Or Windows" },
  { key: "ios-setup", label: "Apps For | iOS" },
  { key: "player-windows", label: "BM Player | Windows" },
  { key: "player-mac", label: "BM Player | Mac" },
  { key: "guides", label: "Guides" },
] as const;

export type InstallTabKey = (typeof INSTALL_TABS)[number]["key"];

/** Saved order first (unknown keys dropped), then any tabs missing from it in default order. */
export function resolveInstallTabOrder(saved: unknown): InstallTabKey[] {
  const all = INSTALL_TABS.map((t) => t.key) as InstallTabKey[];
  const list = Array.isArray(saved) ? saved : [];
  const picked = list.filter((k, i): k is InstallTabKey => all.includes(k as InstallTabKey) && list.indexOf(k) === i);
  return [...picked, ...all.filter((k) => !picked.includes(k))];
}

export function moveTab(order: InstallTabKey[], index: number, dir: -1 | 1): InstallTabKey[] {
  const j = index + dir;
  if (j < 0 || j >= order.length) return order;
  const next = [...order];
  [next[index], next[j]] = [next[j], next[index]];
  return next;
}
