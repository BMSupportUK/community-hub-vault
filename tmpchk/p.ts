import { fetchFotmobSummary } from "../src/lib/fotmob-boro.server";
import { buildPreviewBody } from "../src/lib/boro-match-thread.server";
const fx: any = { id: "x", home_team: "Middlesbrough", away_team: "West Brom", kickoff_at: "2026-08-29T11:30:00.000Z", competition: "Championship" };
const json = await fetchFotmobSummary({ home: fx.home_team, away: fx.away_team, kickoff: fx.kickoff_at });
console.log(buildPreviewBody(fx, json).replace(/<\/p>/g, "</p>\n"));
