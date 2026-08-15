import { z } from "zod";

export const emailSchema = z.string().trim().toLowerCase().email().max(255);
export const pinSchema = z.string().regex(/^\d{4}$/, "PIN must be 4 digits");
