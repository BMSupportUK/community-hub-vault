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
};

export type FotmobEventPlayer = {
  name: string;
  number: string | null;
  position: string | null;
};
