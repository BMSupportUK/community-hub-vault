import { z } from "zod";

export const memberEmailSchema = z.string().trim().toLowerCase().email("Enter only a valid email address, with no extra words or spaces.");

export function memberEmailError(value: string): string | null {
  const result = memberEmailSchema.safeParse(value);
  return result.success ? null : result.error.issues[0]?.message ?? "Enter a valid email address.";
}