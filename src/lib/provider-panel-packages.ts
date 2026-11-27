/** We never sell 3 months, so it has no package. Xtream panel package IDs. Adult content = the "XXX" package of the same length/rooms. */
export type PanelRooms = "single" | "multi" | "triple";
const PACKAGES: Record<number, Record<PanelRooms, [plain: number, adult: number]>> = {
  1: { single: [68, 69], multi: [70, 71], triple: [72, 73] },
  6: { single: [114, 89], multi: [90, 91], triple: [92, 93] },
  12: { single: [98, 99], multi: [100, 101], triple: [102, 103] },
};
export function panelPackageId(months: number, rooms: PanelRooms | null, adult: boolean): number | null {
  const row = PACKAGES[months]?.[rooms ?? "single"];
  return row ? row[adult ? 1 : 0] : null;
}
