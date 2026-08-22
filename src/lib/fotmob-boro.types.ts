/** Presentation detail for one FotMob event, mirroring FotMob's own cards. */
export type FotmobEventDetail = {
  minuteLabel: string;
  headline: string;
  narrative: string;
  teamName: string | null;
  isHome: boolean;
  player: FotmobEventPlayer | null;
  playerIn: FotmobEventPlayer | null;
  playerOut: FotmobEventPlayer | null;
  assist: string | null;
  shotType: string | null;
  xg: string | null;
  xgot: string | null;
  card: string | null;
  /** Team shirt colour FotMob uses to tint the card. */
  teamColor?: string | null;
  /** Running score after the event, e.g. "Blackburn Rovers 2 - 1 Middlesbrough". */
  scoreLine?: string | null;
  /** Where the shot crossed the goal line: x 0-2 (left to right), y 0-1 (ground up). */
  goalMouth?: { x: number; y: number } | null;
  /** Whether the shot was on target (used for the shot diagram). */
  onTarget?: boolean | null;
};

export type FotmobEventPlayer = {
  name: string;
  number: string | null;
  position: string | null;
};
