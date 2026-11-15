/** Server check matching playerSectionAllowed: asks the database (same rule as the RLS policies). */
export async function requirePlayerSection(sb: any, section: string) {
  const { data, error } = await sb.rpc("player_section_allowed", { _section: section });
  if (error || data !== true) throw new Error("You don't have access to this BM Player section.");
}
