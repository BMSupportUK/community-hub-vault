/** Presentation only. Connection eligibility and all TV checks remain server-owned. */
export function ticketSetupStage(state: {
  loggedIn: boolean; handedOff: boolean; tvConnected: boolean;
  ready: boolean; canConnect: boolean; completed: boolean; linked: boolean;
}): 1 | 2 | 3 | 4 | 5 | 6 {
  if (state.canConnect) return 5;
  if (state.completed) return 6;
  if (state.ready) return 4;
  if (state.tvConnected) return 4;
  if (state.handedOff || state.linked) return 3;
  if (state.loggedIn) return 2;
  return 1;
}