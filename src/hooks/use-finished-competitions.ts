import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getCompetitionWinnersSummary,
  type CompetitionWinnerSummary,
} from "@/lib/competition-winners.functions";
import type { CompetitionKey } from "@/lib/competitions";

export function useCompetitionWinners() {
  const fn = useServerFn(getCompetitionWinnersSummary);
  return useQuery<CompetitionWinnerSummary[]>({
    queryKey: ["competition-winners-summary"],
    queryFn: () => fn({}),
    staleTime: 5 * 60_000,
  });
}

/** Keys of competitions that have finished (winners announced). */
export function useFinishedCompetitions(): CompetitionKey[] {
  const { data } = useCompetitionWinners();
  return (data ?? []).filter((c) => c.finished).map((c) => c.competition);
}
