// Keyword -> Category (+ optional Subcategory) routing map.
// First match wins, top-to-bottom, case-insensitive substring match against
// the event title/text. Categories with subcategories fall back to a default
// subcategory if no specific keyword matches first.

export type RouteRule = {
  /** Keywords that trigger this rule. Case-insensitive substring match. */
  keywords: string[];
  /** Exact category name (must match sports_categories.name). */
  category: string;
  /** Optional subcategory name (must match sports_subcategories.name). */
  subcategory?: string;
};

// Ordering matters. Sports Passes come first so a "Sky Sports Pass" event
// doesn't get pulled into Football/Rugby/etc.
export const ROUTE_RULES: RouteRule[] = [
  // ── Sports Passes ─────────────────────────────────────────────
  { keywords: ["sky sports pass", "tnt sports pass", "peacock pass", "dazn pass", "season pass", "sports pass"], category: "Sports Passes" },

  // ── UFC / MMA ─────────────────────────────────────────────────
  { keywords: ["ufc", "mma", "bellator", " pfl"], category: "UFC" },

  // ── Boxing ────────────────────────────────────────────────────
  { keywords: ["boxing", "matchroom", "queensberry", "fight night"], category: "Boxing" },

  // ── Darts ─────────────────────────────────────────────────────
  { keywords: ["darts", "pdc"], category: "Darts" },

  // ── Tennis ────────────────────────────────────────────────────
  { keywords: ["tennis", " atp", " wta", "wimbledon", "roland garros", "australian open"], category: "Tennis" },

  // ── Golf (subcategories) ──────────────────────────────────────
  { keywords: ["liv golf"], category: "Golf", subcategory: "Liv Golf" },
  { keywords: ["lpga"], category: "Golf", subcategory: "LPGA Tour" },
  { keywords: ["let tour", "ladies european"], category: "Golf", subcategory: "LET Tour" },
  { keywords: ["dp world tour", "european tour"], category: "Golf", subcategory: "DP World Tour" },
  { keywords: ["pga", "ryder cup", "masters", "open championship", "golf"], category: "Golf", subcategory: "PGA Tour" },

  // ── Football | Women (check BEFORE Mens) ──────────────────────
  { keywords: ["nwsl", "uswnt"], category: "Football | Women", subcategory: "USA" },
  { keywords: ["womens euro", "women's euro", "womens world cup", "women's world cup", "womens champions league", "women's champions league"], category: "Football | Women", subcategory: "Tournament" },
  { keywords: ["wsl", "women's super league", "womens super league", "womens fa cup", "women's fa cup", "england women", "women's football", "womens football"], category: "Football | Women", subcategory: "England" },

  // ── Football | Mens (subcategories) ───────────────────────────
  { keywords: ["champions league", "europa league", "conference league", "club world cup"], category: "Football | Mens", subcategory: "Tournaments | Clubs" },
  { keywords: ["world cup", "euros", "nations league", "international friendly", "world cup qualifier", "euro qualifier"], category: "Football | Mens", subcategory: "International" },
  { keywords: ["la liga", "copa del rey", "spain "], category: "Football | Mens", subcategory: "Spain" },
  { keywords: ["serie a", "coppa italia", "italy "], category: "Football | Mens", subcategory: "Italy" },
  { keywords: ["bundesliga", "dfb pokal", "germany "], category: "Football | Mens", subcategory: "Germany" },
  { keywords: ["ligue 1", "coupe de france", "france "], category: "Football | Mens", subcategory: "France" },
  { keywords: ["eredivisie", "knvb", "holland", "netherlands"], category: "Football | Mens", subcategory: "Holland" },
  { keywords: ["scottish premiership", "spfl", "scottish cup", "scottish ", "scotland "], category: "Football | Mens", subcategory: "Scotland" },
  { keywords: ["mls", "liga mx", "brasileirao", "a-league soccer", "j-league"], category: "Football | Mens", subcategory: "All Other Leagues" },
  { keywords: ["premier league", "epl", "fa cup", "efl", "championship", "league one", "league two", "carabao cup", "football", "soccer"], category: "Football | Mens", subcategory: "England" },

  // ── Rugby League (subcategories) ──────────────────────────────
  { keywords: ["rugby league pass", "sky rugby pass"], category: "Rugby League", subcategory: "Sports Passes" },
  { keywords: ["super league", "nrl", "challenge cup rugby", "rugby league"], category: "Rugby League", subcategory: "League" },

  // ── Rugby Union (subcategories) ───────────────────────────────
  { keywords: ["rugby union pass"], category: "Rugby Union", subcategory: "Sports Pass" },
  { keywords: ["six nations", "rugby world cup", "autumn internationals", "international rugby"], category: "Rugby Union", subcategory: "International" },
  { keywords: ["champions cup rugby", "rugby champions cup", "investec rugby"], category: "Rugby Union", subcategory: "Tournament" },
  { keywords: ["premiership rugby", "united rugby", "urc", "top 14", "rugby union", "rugby"], category: "Rugby Union", subcategory: "League" },

  // ── Cricket (always League per user spec) ─────────────────────
  { keywords: ["cricket", "ipl", "the hundred", "vitality blast", "bbl", "psl", "t20", "odi", "test match"], category: "Cricket", subcategory: "League" },

  // ── Motorcar Racing (subcategories) ───────────────────────────
  { keywords: ["dtm"], category: "Motorcar Racing", subcategory: "DTM" },
  { keywords: ["wrc", "rally"], category: "Motorcar Racing", subcategory: "Rally" },
  { keywords: ["formula 1", "formula1", " f1 ", "f1 ", " f2 ", " f3 ", "f1 academy", "grand prix", "indycar", "nascar", "le mans", "wec"], category: "Motorcar Racing", subcategory: "F1 | F2 | F1 Academy" },

  // ── Motorbike Racing (subcategories) ──────────────────────────
  { keywords: ["motogp pass", "moto gp pass", "motorbike pass"], category: "Motorbike Racing", subcategory: "Sport Passes" },
  { keywords: ["speedway"], category: "Motorbike Racing", subcategory: "Speedway" },
  { keywords: ["superbike", "wsbk", "bsb"], category: "Motorbike Racing", subcategory: "Superbike" },
  { keywords: ["motogp", "moto gp", "moto2", "moto3"], category: "Motorbike Racing", subcategory: "Moto GP" },

  // ── Irish Sports ──────────────────────────────────────────────
  { keywords: ["gaa", "hurling", "gaelic", "all-ireland"], category: "Irish Sports" },

  // ── Australian Sports (subcategories) ─────────────────────────
  { keywords: ["afl", "aussie rules"], category: "Australian Sports", subcategory: "Aussie Rules" },
  { keywords: ["aus rugby league", "australia nrl"], category: "Australian Sports", subcategory: "Rugby League" },
  { keywords: ["a-league"], category: "Australian Sports", subcategory: "Soccer" },
  { keywords: ["super netball", "netball"], category: "Australian Sports", subcategory: "Netball" },
  { keywords: ["supercars", "v8 supercars"], category: "Australian Sports", subcategory: "Motorsports" },

  // ── USA Sports (subcategories) ────────────────────────────────
  { keywords: ["nba", "wnba", "basketball"], category: "USA Sports", subcategory: "Basketball" },
  { keywords: ["nhl", "ice hockey"], category: "USA Sports", subcategory: "Ice Hockey" },
  { keywords: ["mlb", "baseball", "world series"], category: "USA Sports", subcategory: "Baseball" },
  { keywords: ["nfl", "college football", "ncaa football", "ncaa", "super bowl", "american football"], category: "USA Sports", subcategory: "American Football" },
  { keywords: ["mlr ", "major league rugby"], category: "USA Sports", subcategory: "Rugby Union" },
  { keywords: ["mls usa", "usa mls"], category: "USA Sports", subcategory: "Soccer" },
  { keywords: ["peacock"], category: "USA Sports", subcategory: "Baseball" },

  // ── Cycling (subcategories) ───────────────────────────────────
  { keywords: ["giro d'italia", "giro ditalia", "tour de france", "vuelta a espana", "vuelta"], category: "Cycling", subcategory: "Grand Tours" },
  { keywords: ["paris-roubaix", "milan-san remo", "milan san remo", "liege-bastogne", "tour of flanders", "il lombardia", "strade bianche"], category: "Cycling", subcategory: "Classics & One-Day" },
  { keywords: ["tirreno-adriatico", "paris-nice", "criterium du dauphine", "tour de suisse", "volta a catalunya"], category: "Cycling", subcategory: "Stage Races" },
  { keywords: ["womens tour", "women's tour", "giro donne", "tour de france femmes", "uci women"], category: "Cycling", subcategory: "Womens" },
  { keywords: ["track cycling", "uci track", "velodrome"], category: "Cycling", subcategory: "Track & Other" },
  { keywords: ["uci", "cycling", "tour de", "giro "], category: "Cycling", subcategory: "Grand Tours" },

  // ── Daily Sports & PPV ────────────────────────────────────────
  { keywords: ["ppv", "pay-per-view", "pay per view"], category: "Daily Sports & PPV" },

  // ── Other Sports (catch-all hints) ────────────────────────────
  { keywords: ["greyhound", "horse racing", "snooker", "volleyball", "handball"], category: "Other Sports" },
];

/**
 * Route a single event title to a Category + Subcategory.
 * Returns null when nothing matches (caller should queue for admin review).
 */
export function routeEvent(text: string): { category: string; subcategory?: string } | null {
  const haystack = ` ${text.toLowerCase()} `;
  for (const rule of ROUTE_RULES) {
    for (const kw of rule.keywords) {
      if (haystack.includes(kw.toLowerCase())) {
        return { category: rule.category, subcategory: rule.subcategory };
      }
    }
  }
  return null;
}