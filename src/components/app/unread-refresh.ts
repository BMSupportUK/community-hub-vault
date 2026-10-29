/** One refresh at a time; events arriving during a request get one immediate
 * follow-up, without resetting a debounce deadline or losing dirty rooms. */
export function unreadRefreshScheduler(load: (rooms: Set<string> | null) => Promise<void>) {
  let running = false;
  let stopped = false;
  let full = false;
  let pending = false;
  const rooms = new Set<string>();
  const drain = async () => {
    if (running || stopped) return;
    running = true;
    try {
      while (pending && !stopped) {
        const batch = full ? null : new Set(rooms);
        pending = false;
        full = false;
        rooms.clear();
        await load(batch);
      }
    } finally {
      running = false;
    }
  };
  return {
    request(room?: string) {
      if (stopped) return;
      pending = true;
      if (room) rooms.add(room);
      else full = true;
      void drain();
    },
    stop() { stopped = true; rooms.clear(); },
  };
}