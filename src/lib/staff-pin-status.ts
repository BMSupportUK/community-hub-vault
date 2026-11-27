/** Missing and unreadable are different states; an error must never offer PIN setup. */
export function existingPinStatus(row: { user_id: string } | null, error: unknown): boolean {
  if (error) throw new Error("Unable to check your existing PIN. Please try again.");
  return row !== null;
}