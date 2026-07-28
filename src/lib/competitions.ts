export type CompetitionKey = "wc2026" | "boro2026";

export type CompetitionDef = {
  key: CompetitionKey;
  /** Short label used in the side rail. */
  railLabel: string;
  /** Full title used on cards and the winners page. */
  title: string;
  description: string;
  to: string;
};

export const COMPETITIONS: CompetitionDef[] = [
  {
    key: "wc2026",
    railLabel: "World Cup 2026",
    title: "World Cup 2026 Predictor",
    description: "Predict every World Cup 2026 score and climb the leaderboard.",
    to: "/predictions",
  },
  {
    key: "boro2026",
    railLabel: "Boro Predictor",
    title: "MFC 2026/27 Predictor",
    description: "Call every Middlesbrough result of the 2026/27 season.",
    to: "/boro-predictions",
  },
];

export const competitionByKey = (key: string) =>
  COMPETITIONS.find((c) => c.key === key);

/** Routes that must disappear from the rail / home once their competition ends. */
export const competitionRoutes = COMPETITIONS.map((c) => c.to);
