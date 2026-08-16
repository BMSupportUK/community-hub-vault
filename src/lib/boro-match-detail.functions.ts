import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { MatchDetailDTO } from "@/lib/boro-match-detail.types";

export type {
  MatchDetailDTO,
  MatchEventItem,
  PlayerLine,
  TeamLineup,
  TeamStatLine,
} from "@/lib/boro-match-detail.types";

export const getBoroMatchDetail = createServerFn({ method: "GET" })
  .inputValidator((input) =>
    z
      .object({
        eventId: z.string().min(1).max(24),
        slug: z.string().min(1).max(32).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<MatchDetailDTO> => {
    const { fetchBoroMatchDetail } = await import("@/lib/boro-match-detail.server");
    return fetchBoroMatchDetail(data.eventId, data.slug || "eng.2");
  });
