export function inboxDeletionResult(requested: string[], remainingIds: string[]) {
  const remaining = new Set(remainingIds);
  return {
    removed: requested.filter((id) => !remaining.has(id)),
    kept: requested.filter((id) => remaining.has(id)),
  };
}

export function visibleInboxThreads<T extends { last_at: string | null }>(threads: T[]) {
  return threads.filter((thread) => thread.last_at !== null);
}