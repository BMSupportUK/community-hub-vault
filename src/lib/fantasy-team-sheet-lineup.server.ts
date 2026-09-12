type Admin = { from: (table: string) => any };

type FantasyPlayer = {
  id: string;
  name: string;
  shirt_number?: number | null;
};


function normaliseName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchPlayer(name: string, players: FantasyPlayer[]): FantasyPlayer | null {
  const wanted = normaliseName(name);
  if (!wanted) return null;
  const exact = players.find((player) => normaliseName(player.name) === wanted);
  if (exact) return exact;

  const bits = wanted.split(" ").filter(Boolean);
  const wantedSurname = bits.at(-1);
  if (!wantedSurname) return null;
  const surnameMatches = players.filter(
    (player) => normaliseName(player.name).split(" ").at(-1) === wantedSurname,
  );
  if (surnameMatches.length === 1) return surnameMatches[0] ?? null;
  if (surnameMatches.length === 0) return null;

  // Several squad members share the surname (Jones), so a bare surname on the
  // graphic is ambiguous. Only accept it when the first name or initial given
  // narrows it to exactly one player; otherwise leave it unmatched so the
  // caller refuses to act on a partial eleven.
  const wantedFirst = bits.length > 1 ? bits[0]! : "";
  if (!wantedFirst) return null;
  const narrowed = surnameMatches.filter((player) => {
    const first = normaliseName(player.name).split(" ")[0] ?? "";
    return first.startsWith(wantedFirst) || wantedFirst.startsWith(first);
  });
  return narrowed.length === 1 ? narrowed[0] ?? null : null;
}

export type SheetEntry = { number: number | null; text: string };

/**
 * Transcribe the graphic verbatim. Club graphics print SURNAMES with shirt
 * numbers, so the reader must never be asked to supply first names — it
 * hallucinates them (it once returned "Tom Vitek" and "Finley Jones"). We take
 * the printed text plus the shirt number and resolve the player ourselves.
 */
async function readSheetEntries(
  imageUrl: string,
  apiKey: string,
  instruction: string,
): Promise<SheetEntry[] | null> {
  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        temperature: 0,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: instruction },
              { type: "image_url", image_url: { url: imageUrl } },
            ],
          },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = payload.choices?.[0]?.message?.content;
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { starters?: unknown };
    if (!Array.isArray(parsed.starters) || parsed.starters.length !== 11) return null;
    const entries: SheetEntry[] = [];
    for (const item of parsed.starters) {
      if (typeof item === "string") {
        if (!item.trim()) return null;
        entries.push({ number: null, text: item });
        continue;
      }
      const row = item as { number?: unknown; text?: unknown; name?: unknown };
      const text = typeof row.text === "string" ? row.text : typeof row.name === "string" ? row.name : "";
      if (!text.trim()) return null;
      const num = typeof row.number === "number" && Number.isFinite(row.number) ? row.number : null;
      entries.push({ number: num, text });
    }
    return entries.length === 11 ? entries : null;
  } catch {
    return null;
  }
}


/** Surnames shared by more than one squad member — these always need a first name. */
function sharedSurnames(players: FantasyPlayer[]): Set<string> {
  const counts = new Map<string, number>();
  for (const player of players) {
    const surname = normaliseName(player.name).split(" ").at(-1);
    if (!surname) continue;
    counts.set(surname, (counts.get(surname) ?? 0) + 1);
  }
  return new Set([...counts.entries()].filter(([, n]) => n > 1).map(([s]) => s));
}

/**
 * Turn read names into player ids. Any name whose surname is shared inside the
 * squad MUST carry a first name (or initial) that narrows it to one player —
 * otherwise the whole read is rejected rather than guessed at.
 */
function resolveIds(names: string[], players: FantasyPlayer[]): string[] | null {
  const ambiguous = sharedSurnames(players);
  const ids: string[] = [];
  for (const name of names) {
    const bits = normaliseName(name).split(" ").filter(Boolean);
    const surname = bits.at(-1);
    if (!surname) return null;
    if (ambiguous.has(surname) && bits.length < 2) return null; // first name missing
    const player = matchPlayer(name, players);
    if (!player) return null;
    ids.push(player.id);
  }
  const unique = [...new Set(ids)];
  return unique.length === 11 ? unique : null;
}

/** Strip captain marks, initials and punctuation: "N. BORGES (C)" -> "borges". */
function printedSurname(text: string): string {
  const cleaned = normaliseName(text.replace(/\((?:c|gk|vc)\)/gi, " "));
  const bits = cleaned.split(" ").filter((b) => b.length > 1);
  return bits.at(-1) ?? "";
}

/**
 * Resolve the printed eleven to squad players using the SHIRT NUMBER as the
 * primary key — club graphics print surnames only, and the number is what makes
 * "JONES" unambiguous. The printed surname must also agree with the player
 * holding that number, otherwise the whole read is refused.
 */
function resolveEntries(entries: SheetEntry[], players: FantasyPlayer[]): string[] | null {
  const ids: string[] = [];
  for (const entry of entries) {
    const surname = printedSurname(entry.text);
    if (!surname) return null;

    const byNumber =
      entry.number == null
        ? []
        : players.filter((p) => (p.shirt_number ?? null) === entry.number);
    const numberMatch =
      byNumber.length === 1
        ? byNumber[0]!
        : byNumber.find((p) => normaliseName(p.name).split(" ").at(-1) === surname) ?? null;

    if (numberMatch) {
      const holderSurname = normaliseName(numberMatch.name).split(" ").at(-1) ?? "";
      // Number and printed surname must describe the same person.
      if (holderSurname !== surname && !holderSurname.includes(surname) && !surname.includes(holderSurname)) {
        return null;
      }
      ids.push(numberMatch.id);
      continue;
    }

    // No usable number: fall back to a surname that is unique in the squad.
    const bySurname = players.filter(
      (p) => normaliseName(p.name).split(" ").at(-1) === surname,
    );
    if (bySurname.length !== 1) return null;
    ids.push(bySurname[0]!.id);
  }
  const unique = [...new Set(ids)];
  return unique.length === 11 ? unique : null;
}



/**
 * Second, independent source: the live match feed's line-up for Middlesbrough.
 * Its names always include first names, so it settles shared surnames such as
 * Jones. Returns null when the feed has no confirmed eleven yet.
 */
async function fetchFeedStarterIds(
  admin: Admin,
  fixtureId: string,
  players: FantasyPlayer[],
): Promise<string[] | null> {
  try {
    const { data: fixture } = await admin
      .from("boro_fixtures")
      .select("home_team, away_team, kickoff_at")
      .eq("id", fixtureId)
      .maybeSingle();
    if (!fixture?.home_team || !fixture?.away_team || !fixture?.kickoff_at) return null;

    const { getCachedSummaryForFixture } = await import("@/lib/espn-summary-cache.server");
    const summary = await getCachedSummaryForFixture({
      home_team: String(fixture.home_team),
      away_team: String(fixture.away_team),
      kickoff_at: String(fixture.kickoff_at),
    });
    const rosters: any[] = Array.isArray(summary?.rosters) ? summary.rosters : [];
    const boro = rosters.find((roster: any) =>
      normaliseName(String(roster?.team?.displayName ?? roster?.team?.name ?? "")).includes(
        "middlesbrough",
      ),
    );
    const names: string[] = (boro?.roster ?? [])
      .filter((entry: any) => entry?.starter === true)
      .map((entry: any) => String(entry?.athlete?.displayName ?? ""))
      .filter((name: string) => name.trim() !== "");
    if (names.length !== 11) return null;
    return resolveIds(names, players);
  } catch {
    return null;
  }
}

/** Read the starting XI from the official team-sheet graphic already captured for the fixture. */
export async function fetchTeamSheetStarterIds(
  admin: Admin,
  fixtureId: string,
  players: FantasyPlayer[],
): Promise<string[] | null> {
  const cacheKey = `fantasy_official_xi_${fixtureId}`;
  const { data: cached } = await admin
    .from("app_settings")
    .select("value")
    .eq("key", cacheKey)
    .maybeSingle();
  const cachedIds = Array.isArray(cached?.value?.starterIds)
    ? cached.value.starterIds.filter((id: unknown): id is string => typeof id === "string")
    : [];
  // Only a complete eleven may be acted on. A partial read makes a real starter
  // look like he was left out, and he gets wrongly benched.
  if (cachedIds.length === 11) return cachedIds;

  // The match centre's own confirmed line-up is an official source in its own
  // right: it always carries full first names, so shared surnames cannot be
  // mixed up. As soon as it confirms exactly eleven Boro starters we act on it,
  // without waiting for the club's team-sheet graphic to be captured and read.
  const feedFirst = await fetchFeedStarterIds(admin, fixtureId, players);
  if (feedFirst && new Set(feedFirst).size === 11) {
    await admin.from("app_settings").upsert(
      {
        key: cacheKey,
        value: {
          starterIds: feedFirst,
          extractedAt: new Date().toISOString(),
          verifiedBy: "match-centre",
        },
      },
      { onConflict: "key" },
    );
    return feedFirst;
  }

  // Only ever read Boro's OWN graphic. The fixture also stores the opposition
  // line-up (and sometimes a "team news soon" teaser), and reading either of
  // those would resolve no Boro players at all.
  const { data: sheet } = await admin
    .from("boro_team_sheets")
    .select("image_url")
    .eq("fixture_id", fixtureId)
    .eq("side", "boro")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const imageUrl = typeof sheet?.image_url === "string" ? sheet.image_url : null;
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!imageUrl || !apiKey) return null;

  // First pass — verbatim transcription with shirt numbers.
  const firstEntries = await readSheetEntries(
    imageUrl,
    apiKey,
    'Transcribe this Middlesbrough team-sheet graphic EXACTLY as printed. Return JSON only: {"starters":[{"number":9,"text":"as printed"}]} — the exactly 11 STARTING players, in the order shown, with the shirt number printed beside each name (null if no number is shown). Copy the text verbatim: never add, guess or complete a first name. Exclude every substitute.',
  );
  const firstIds = firstEntries ? resolveEntries(firstEntries, players) : null;
  if (!firstIds) return null;

  // Back-up source: the live match feed's own line-up, which always carries
  // full first names. Preferred check — it is a completely separate source from
  // the graphic, so a misread shared surname (three Joneses) cannot slip past.
  let source = "";
  let checkIds = await fetchFeedStarterIds(admin, fixtureId, players);
  if (checkIds) {
    source = "match-feed";
  } else {
    // Feed line-ups are not published yet: fall back to an independent second
    // read of the graphic, again verbatim with shirt numbers.
    const secondEntries = await readSheetEntries(
      imageUrl,
      apiKey,
      'Look at this football team sheet. Return JSON only: {"starters":[{"number":1,"text":"printed name"}]} listing the 11 STARTING players with their shirt numbers, copied character for character from the image. Do not invent first names and do not include substitutes.',
    );
    checkIds = secondEntries ? resolveEntries(secondEntries, players) : null;
    source = "second-read";
  }

  if (!checkIds) return null;

  const agree =
    firstIds.length === checkIds.length && firstIds.every((id) => checkIds!.includes(id));
  if (!agree) return null;

  await admin.from("app_settings").upsert(
    {
      key: cacheKey,
      value: {
        starterIds: firstIds,
        extractedAt: new Date().toISOString(),
        verifiedBy: source,
      },
    },
    { onConflict: "key" },
  );
  return firstIds;
}