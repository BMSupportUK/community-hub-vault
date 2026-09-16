// Club name matching shared by every FotMob reader.
//
// FotMob uses short club names ("QPR", "Sheff Utd", "Wolves") while our own
// fixture rows carry the full ones. Matching on the raw strings created
// duplicate fixtures, so all comparisons go through this canonical form.

const ALIASES: Record<string, string> = {
  queensparkrangers: "qpr",
  qpr: "qpr",
  westbromwichalbion: "westbrom",
  westbrom: "westbrom",
  wba: "westbrom",
  westhamunited: "westham",
  westham: "westham",
  sheffieldunited: "sheffutd",
  sheffutd: "sheffutd",
  sheffieldwednesday: "sheffwed",
  sheffwed: "sheffwed",
  wolverhamptonwanderers: "wolves",
  wolves: "wolves",
  brightonandhovealbion: "brighton",
  brighton: "brighton",
  boltonwanderers: "bolton",
  bolton: "bolton",
  blackburnrovers: "blackburn",
  blackburn: "blackburn",
  bristolcity: "bristolcity",
  cardiffcity: "cardiff",
  cardiff: "cardiff",
  stokecity: "stoke",
  stoke: "stoke",
  swanseacity: "swansea",
  swansea: "swansea",
  norwichcity: "norwich",
  norwich: "norwich",
  birminghamcity: "birmingham",
  birmingham: "birmingham",
  hullcity: "hull",
  hull: "hull",
  leicestercity: "leicester",
  leicester: "leicester",
  coventrycity: "coventry",
  coventry: "coventry",
  derbycounty: "derby",
  derby: "derby",
  prestonnorthend: "preston",
  preston: "preston",
  charltonathletic: "charlton",
  charlton: "charlton",
  millwallfc: "millwall",
  portsmouthfc: "portsmouth",
  lincolncity: "lincoln",
  lincoln: "lincoln",
  doncasterrovers: "doncaster",
  doncaster: "doncaster",
  wrexhamafc: "wrexham",
  ipswichtown: "ipswich",
  ipswich: "ipswich",
  lutontown: "luton",
  luton: "luton",
  oxfordunited: "oxford",
  oxford: "oxford",
  plymouthargyle: "plymouth",
  plymouth: "plymouth",
  southamptonfc: "southampton",
  middlesbroughfc: "middlesbrough",
  nottinghamforest: "nottmforest",
  nottmforest: "nottmforest",
  leedsunited: "leeds",
  leeds: "leeds",
  watfordfc: "watford",
  sunderlandafc: "sunderland",
  huddersfieldtown: "huddersfield",
  huddersfield: "huddersfield",
  barnsleyfc: "barnsley",
  blackpoolfc: "blackpool",
  peterboroughunited: "peterborough",
  peterborough: "peterborough",
};

const strip = (value: string) => value.toLowerCase().replace(/[^a-z]/g, "");

/** Canonical, alias-resolved club name. */
export function canonClub(value: string | null | undefined): string {
  const base = strip(value ?? "")
    .replace(/^afc/, "")
    .replace(/(fc|afc)$/, "");
  return ALIASES[base] ?? base;
}

/** True when two club names refer to the same club. */
export function clubNamesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = canonClub(a);
  const y = canonClub(b);
  if (!x || !y) return false;
  return x === y || x.includes(y) || y.includes(x);
}
