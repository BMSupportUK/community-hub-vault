import { z } from "zod";

export const RatingTitle = z.object({
  kind: z.enum(["film", "series"]),
  title: z.string().trim().min(1).max(300),
});
export const RatingVote = RatingTitle.extend({ stars: z.number().int().min(1).max(5) });
export function ratingIdentity(kind: "film" | "series", title: string) {
  return `${kind}:${title.normalize("NFKC").toLowerCase().replace(/\s+/gu, " ").trim()}`;
}
export function ratingVoter(device: { user_id: string | null; offsite_customer_id: string | null }) {
  if (device.user_id) return `user:${device.user_id}`;
  if (device.offsite_customer_id) return `offsite:${device.offsite_customer_id}`;
  return null;
}