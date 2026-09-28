/**
 * Run a `.in(column, ids)` lookup in batches so long ID lists never exceed
 * URL length limits. Throws on any batch error instead of returning partial data.
 */
export async function fetchInChunks<T>(
  ids: string[],
  run: (chunk: string[]) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
  size = 150,
): Promise<T[]> {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  const out: T[] = [];
  for (let i = 0; i < unique.length; i += size) {
    const { data, error } = await run(unique.slice(i, i + size));
    if (error) throw new Error(error.message);
    out.push(...((data as T[]) ?? []));
  }
  return out;
}
