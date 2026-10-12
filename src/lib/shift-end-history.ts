/** Shared interpretation of the recorded shift-end prompt for all history views. */
export interface ShiftEndHistory {
  clock_out: string | null;
  end_prompt_asked_at: string | null;
  still_working_ack_at: string | null;
  end_prompt_signed_out_at?: string | null;
  early_finish_at?: string | null;
}

export const SHIFT_END_RESPONSE_MS = 60_000;
const AUTO_OUT_TOLERANCE_MS = 15_000;

export function isAutomaticShiftOut(shift: ShiftEndHistory): boolean {
  if (!shift.clock_out || !shift.end_prompt_asked_at || shift.still_working_ack_at || shift.end_prompt_signed_out_at || shift.early_finish_at) return false;
  const elapsed = Date.parse(shift.clock_out) - Date.parse(shift.end_prompt_asked_at);
  return Math.abs(elapsed - SHIFT_END_RESPONSE_MS) < AUTO_OUT_TOLERANCE_MS;
}

export function shiftEndSignOutAnswer(shift: ShiftEndHistory): string | null {
  if (shift.end_prompt_signed_out_at) return shift.end_prompt_signed_out_at;
  // Older shifts did not record the explicit answer: only infer a quick reply.
  if (!shift.clock_out || !shift.end_prompt_asked_at || shift.still_working_ack_at || shift.early_finish_at || isAutomaticShiftOut(shift)) return null;
  const elapsed = Date.parse(shift.clock_out) - Date.parse(shift.end_prompt_asked_at);
  return elapsed >= 0 && elapsed < SHIFT_END_RESPONSE_MS ? shift.clock_out : null;
}