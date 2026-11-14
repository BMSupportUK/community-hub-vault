/** TV reports unlock a completed prefix; existing installs omit the download steps. */
export function directStepAccess(reported: boolean[], answered: "yes" | "no" | null, completed = false): boolean[] {
  const visible = [0, ...(answered === "yes" ? [] : [1, 2]), 3, 4, 5];
  const access = Array(6).fill(false) as boolean[];
  if (completed) return access.map((_, i) => visible.includes(i));
  access[0] = true;
  if (!answered) return access;
  const lastReport = visible.filter((i) => reported[i]).at(-1) ?? 0;
  const frontier = Math.min(visible.indexOf(lastReport) + 1, visible.length - 1);
  visible.forEach((i, position) => { access[i] = position <= frontier; });
  return access;
}