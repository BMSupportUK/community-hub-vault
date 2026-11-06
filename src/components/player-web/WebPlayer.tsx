import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { webPlayerDevice, webPlayerDns, webPlayerProvider } from "@/lib/player-web.functions";
import { MAX_TRIES, STALL_RECONNECT_MS, backoffMs, catchupUrl, isAppleMobile, liveUrl, secureDns, vodUrl } from "@/lib/player-web";
import family from "@/assets/player-web-family.jpg";
import "./player-web.css";

type Cat = { id: string; name: string };
type Item = { kind: "live" | "film" | "series"; id: string; name: string; category: string; poster: string; archive?: number; ext?: string; added?: number; rating?: number };
type Prog = { id: string; title: string; desc: string; start: number; end: number; archive?: boolean };
type Episode = { id: string; title: string; num: number; ext: string; plot: string };
type Login = { id: string; app_login_name: string | null; password: string | null; account_number: number | null };
type Rating = { kind: string; title: string; count: number; average: number | null; mine: number | null };
type Progress = Record<string, { position_ms: number; duration_ms: number }>;
type Playing = { kind: "live" | "film" | "episode" | "catchup"; id: string; title: string; url: string; resumeAt?: number; category?: string };
type View = "home" | "live" | "film" | "series" | "seriesPage" | "catchup" | "saved" | "settings";

const VERSION = "web-0.1.0";
const SLOT = 30 * 60_000, PX_PER_MIN = 4;
const clock = (t: number) => new Date(t).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
const ukDay = (t: number) => new Date(t).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Europe/London" });
const store = {
  get<T>(k: string, d: T): T { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) as T : d; } catch { return d; } },
  set(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* full or private mode */ } },
};

async function api<T = Record<string, unknown>>(body: Record<string, unknown>): Promise<T> {
  const r = await fetch("/api/public/player", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { error?: string }).error || "Something went wrong. Try again.");
  return j as T;
}

export function WebPlayer() {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  useEffect(() => { setAllowed(isAppleMobile(navigator.userAgent, navigator.maxTouchPoints || 0)); }, []);
  if (allowed === null) return <div className="bmw" />;
  if (!allowed) return (
    <div className="bmw"><div className="bmw-center">
      <h2>BM Player for iPhone and iPad</h2>
      <p className="muted">This player only opens on an iPhone or iPad. On a computer, use BM Player for Windows or Mac.</p>
      <Link to="/install-guides"><button>Go to Install Guides</button></Link>
    </div></div>
  );
  return <Player />;
}

function Player() {
  const { user } = useAuth();
  const uid = user?.id;
  const getDevice = useServerFn(webPlayerDevice), getDns = useServerFn(webPlayerDns), provider = useServerFn(webPlayerProvider);
  const [token, setToken] = useState<string | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [logins, setLogins] = useState<Login[] | null>(null);
  const [login, setLogin] = useState<Login | null>(null);
  const [dns, setDns] = useState("");
  const [view, setView] = useState<View>("home");
  const startedAt = useRef(Date.now());
  const toast = useCallback((m: string) => { setNotice(m); window.setTimeout(() => setNotice(""), 6000); }, []);

  // Device link for this browser (kept by the browser like the apps keep theirs; logins are never stored).
  useEffect(() => {
    if (!uid) return;
    const key = `bmw-device-${uid}`;
    getDevice({ data: { token: store.get<string | null>(key, null) } })
      .then((r) => { store.set(key, r.token); setToken(r.token); })
      .catch((e: Error) => setError(e.message));
  }, [uid, getDevice]);

  useEffect(() => {
    if (!unlocked || !uid) return;
    supabase.from("app_credentials").select("id,app_login_name,password,account_number").eq("owner_id", uid).order("account_number")
      .then(({ data }) => {
        const usable = ((data ?? []) as Login[]).filter((l) => l.id && l.app_login_name && l.password);
        setLogins(usable);
        if (usable.length === 1) setLogin(usable[0]);
      });
    getDns().then((r) => setDns(r.dns)).catch(() => setDns(""));
  }, [unlocked, uid, getDns]);

  if (error) return <div className="bmw"><div className="bmw-center"><p className="bmw-err">{error}</p></div></div>;
  if (!token) return <div className="bmw"><div className="bmw-center"><p className="muted">Starting BM Player…</p></div></div>;
  if (!unlocked) return <div className="bmw"><Unlock token={token} onDone={() => setUnlocked(true)} /></div>;
  if (!logins) return <div className="bmw"><div className="bmw-center"><p className="muted">Loading your app logins…</p></div></div>;
  if (!login) return (
    <div className="bmw"><div className="bmw-center">
      <h2>Choose your app login</h2>
      {logins.length === 0 && <p className="muted">There's no app login on your account yet. Once one is added, it will show here.</p>}
      {logins.map((l) => <button key={l.id} onClick={() => setLogin(l)}>{l.app_login_name}</button>)}
    </div></div>
  );
  if (dns && !secureDns(dns)) return <div className="bmw"><div className="bmw-center"><p className="bmw-err">The TV service address isn't secure (https), so it can't play on iPhone or iPad.</p></div></div>;
  return (
    <div className="bmw">
      <Main token={token} login={login} dns={dns} provider={provider} view={view} setView={setView} toast={toast}
        startedAt={startedAt.current} changeLogin={logins.length > 1 ? () => setLogin(null) : undefined} />
      {notice && <div className="bmw-notice" role="status">{notice}</div>}
    </div>
  );
}

function Unlock({ token, onDone }: { token: string; onDone: () => void }) {
  const [pin, setPin] = useState(""), [busy, setBusy] = useState(false), [err, setErr] = useState("");
  const [showLimits, setShowLimits] = useState(true);
  // Short phone screens keep the keypad on view: the full list folds away, the summary line stays.
  useEffect(() => { if (window.innerHeight < 620) setShowLimits(false); }, []);
  async function submit(value: string) {
    setBusy(true); setErr("");
    try { await api({ action: "unlock", device_token: token, account_number: value }); onDone(); }
    catch (e) { setErr((e as Error).message); setPin(""); }
    setBusy(false);
  }
  function press(d: string) { if (busy) return; const next = (pin + d).slice(0, 6); setPin(next); if (next.length === 6) void submit(next); }
  return (
    <div className="bmw-unlock">
      <div className="bmw-note">
        <h3>What this free browser player can play</h3>
        {showLimits ? <>
          <ul>
            <li>Live TV: only channels that stream in the m3u8 format. If one won't start, it isn't offered that way.</li>
            <li>Films and series: only the mp4 ones are listed. Everything else is hidden, not broken.</li>
            <li>Catch up: only where the recording is available in that same format.</li>
            <li>Video plays through Safari, so use a strong Wi-Fi or data connection.</li>
          </ul>
          <p className="muted">For everything else, use BM Player for Android, Windows or Mac.</p>
        </> : <p className="muted">Only m3u8 channels and mp4 films and series. Everything else is hidden.</p>}
        <button className="bmw-note-more" onClick={() => setShowLimits((v) => !v)}>{showLimits ? "Show less" : "Show what's available"}</button>
      </div>
      <h2>Enter your account number</h2>
      <p className="muted">It's the 6-digit number in your subscription box on bmsupport.uk.</p>
      <div className="bmw-pin" aria-label="Account number entered">{pin.padEnd(6, "•")}</div>
      {err && <p className="bmw-err">{err}</p>}
      <div className="bmw-pad">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => <button key={d} onClick={() => press(d)}>{d}</button>)}
        <button aria-label="Delete" onClick={() => setPin((p) => p.slice(0, -1))}>⌫</button>
        <button onClick={() => press("0")}>0</button>
        <span />
      </div>
    </div>
  );
}

type ProviderCall =
  | { action: "get_live_categories" | "get_vod_categories" | "get_series_categories" | "get_live_streams" | "get_vod_streams" | "get_series" }
  | { action: "get_series_info"; series_id: string }
  | { action: "get_short_epg" | "get_simple_data_table"; stream_id: string };
type ProviderFn = (o: { data: { credentialId: string; call: ProviderCall } }) => Promise<unknown>;

function Main({ token, login, dns, provider, view, setView, toast, startedAt, changeLogin }: {
  token: string; login: Login; dns: string; provider: ProviderFn; view: View; setView: (v: View) => void;
  toast: (m: string) => void; startedAt: number; changeLogin?: () => void;
}) {
  const user = login.app_login_name!, pass = login.password!;
  const call = useCallback(async <T,>(c: ProviderCall) => (await provider({ data: { credentialId: login.id, call: c } })) as T, [provider, login.id]);
  const [cats, setCats] = useState<Record<string, Cat[]>>({});
  const [items, setItems] = useState<Record<string, Item[]>>({});
  const [loading, setLoading] = useState(false);
  const [favourites, setFavourites] = useState<Item[]>([]);
  const [progress, setProgress] = useState<Progress>({});
  const [ratings, setRatings] = useState<Record<string, Rating>>({});
  const [playing, setPlaying] = useState<Playing | null>(null);
  const [preview, setPreview] = useState<Item | null>(null);
  const [series, setSeries] = useState<{ item: Item; plot: string; backdrop: string; seasons: Record<string, Episode[]> } | null>(null);
  const [catchup, setCatchup] = useState<{ channel: Item; list: Prog[] | null; day: string | null } | null>(null);
  const [sheet, setSheet] = useState<Item | null>(null);
  const [vote, setVote] = useState<Item | null>(null);
  const recentKey = `bmw-recent-${login.id}`;
  const [recent, setRecent] = useState<Item[]>(() => store.get<Item[]>(recentKey, []));

  // Favourites + watched progress follow the account across every BM Player.
  useEffect(() => {
    api<{ items: Item[] }>({ action: "favourites", device_token: token, login: user }).then((r) => setFavourites(r.items || [])).catch(() => {});
    api<{ items: { key: string; position_ms: number; duration_ms: number }[] }>({ action: "progress", device_token: token, login: user })
      .then((r) => setProgress(Object.fromEntries((r.items || []).map((i) => [i.key, i])))).catch(() => {});
  }, [token, user]);

  async function load(kind: "live" | "film" | "series") {
    if (items[kind]) return;
    setLoading(true);
    try {
      const pre = kind === "live" ? "live" : kind === "film" ? "vod" : "series";
      const [c, l] = await Promise.all([
        call<{ categories: Cat[] }>({ action: `get_${pre}_categories` as "get_live_categories" }),
        call<{ items: Item[] }>({ action: kind === "live" ? "get_live_streams" : kind === "film" ? "get_vod_streams" : "get_series" }),
      ]);
      setCats((o) => ({ ...o, [kind]: c.categories })); setItems((o) => ({ ...o, [kind]: l.items }));
    } catch (e) { toast((e as Error).message); }
    setLoading(false);
  }
  useEffect(() => { if (view === "live" || view === "film" || view === "series") void load(view); }, [view]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadRatings(list: Item[]) {
    const unique = [...new Map(list.filter((i) => i.kind !== "live").map((i) => [`${i.kind}:${i.name}`, { kind: i.kind, title: i.name }])).values()].slice(0, 200);
    if (!unique.length) return;
    try { const r = await api<{ ratings: Rating[] }>({ action: "ratings", device_token: token, items: unique }); setRatings((o) => ({ ...o, ...Object.fromEntries(r.ratings.map((x) => [`${x.kind}:${x.title}`, x])) })); } catch { /* ratings are optional */ }
  }
  async function castVote(item: Item, stars: number) {
    try {
      const r = await api<{ ratings: Rating[] }>({ action: "vote", device_token: token, kind: item.kind, title: item.name, stars });
      setRatings((o) => ({ ...o, ...Object.fromEntries(r.ratings.map((x) => [`${x.kind}:${x.title}`, x])) })); toast(`Your ${stars}-star vote is saved.`);
    } catch (e) { toast((e as Error).message); }
    setVote(null);
  }
  const isFav = (i: Item) => favourites.some((f) => f.kind === i.kind && f.id === i.id);
  async function toggleFav(i: Item) {
    const next = isFav(i) ? favourites.filter((f) => !(f.kind === i.kind && f.id === i.id)) : [...favourites, { ...i }];
    setFavourites(next);
    try { await api({ action: "favourites_set", device_token: token, login: user, items: next }); } catch (e) { toast((e as Error).message); }
  }
  function remember(i: Item) {
    const next = [i, ...recent.filter((r) => !(r.kind === i.kind && r.id === i.id))].slice(0, 40);
    setRecent(next); store.set(recentKey, next);
  }

  function playItem(i: Item, resume = false) {
    const p = progress[`film:${i.id}`];
    setPreview(null); remember(i);
    if (i.kind === "live") setPlaying({ kind: "live", id: i.id, title: i.name, url: liveUrl(dns, user, pass, i.id), category: i.category });
    else setPlaying({ kind: "film", id: i.id, title: i.name, url: vodUrl(dns, user, pass, "film", i.id, i.ext || "mp4"), resumeAt: resume && p ? p.position_ms / 1000 : 0 });
    setSheet(null);
  }
  function playEpisode(ep: Episode, resume: boolean) {
    if (!series) return;
    const p = progress[`episode:${ep.id}`];
    remember(series.item);
    setPlaying({ kind: "episode", id: ep.id, title: `${series.item.name} · ${ep.title}`, url: vodUrl(dns, user, pass, "episode", ep.id, ep.ext), resumeAt: resume && p ? p.position_ms / 1000 : 0 });
  }
  async function openSeries(i: Item) {
    setLoading(true);
    try {
      const r = await call<{ plot: string; backdrop: string; seasons: Record<string, Episode[]> }>({ action: "get_series_info", series_id: i.id });
      if (!Object.keys(r.seasons).length) toast("This series has no episodes that play on iPhone or iPad.");
      else { setSeries({ item: i, ...r }); setView("seriesPage"); void loadRatings([i]); }
    } catch (e) { toast((e as Error).message); }
    setLoading(false);
  }
  async function openCatchup(channel: Item) {
    setCatchup({ channel, list: null, day: null }); setView("catchup");
    try {
      const r = await call<{ programmes: Prog[] }>({ action: "get_simple_data_table", stream_id: channel.id });
      const from = Date.now() - Math.max(1, channel.archive || 1) * 86_400_000;
      const list = r.programmes.filter((p) => p.archive !== false && p.start >= from && p.end <= Date.now()).sort((a, b) => b.start - a.start);
      setCatchup({ channel, list, day: list[0] ? ukDay(list[0].start) : null });
    } catch (e) { toast((e as Error).message); setCatchup({ channel, list: [], day: null }); }
  }
  const epg = useCallback(async (id: string) => (await call<{ programmes: Prog[] }>({ action: "get_short_epg", stream_id: id })).programmes, [call]);

  // Check in like the apps: Live Connections + weekly viewing hours (previews never count).
  const watchingRef = useRef<{ kind: string; title: string; category?: string; player: string; since: number } | null>(null);
  useEffect(() => {
    watchingRef.current = playing ? { kind: playing.kind, title: playing.title.slice(0, 200), category: playing.category, player: "safari", since: Date.now() } : null;
    void api({ action: "poll", device_token: token, login: user, version: VERSION, watching: watchingRef.current }).catch(() => {});
  }, [playing, token, user]);
  useEffect(() => {
    const t = window.setInterval(() => { void api({ action: "poll", device_token: token, login: user, version: VERSION, watching: watchingRef.current }).catch(() => {}); }, 30_000);
    return () => window.clearInterval(t);
  }, [token, user]);

  function saveProgress(key: string, pos: number, dur: number) {
    if (!dur || !Number.isFinite(dur)) return;
    const item = { key, position_ms: Math.round(pos * 1000), duration_ms: Math.round(dur * 1000), updated_at: Date.now(), age_ms: 0 };
    setProgress((o) => ({ ...o, [key]: item }));
    void api({ action: "progress_set", device_token: token, login: user, items: [item] }).catch(() => {});
  }

  const title = { home: "BM Player", live: "Live TV", film: "Films", series: "Series", seriesPage: series?.item.name || "Series", catchup: "Catch up", saved: "Favourites & Recently watched", settings: "Settings" }[view];
  const back = view === "seriesPage" ? "series" : view === "catchup" ? "live" : "home";

  return (
    <>
      <div className="bmw-bar">
        {view !== "home" && <button aria-label="Back" onClick={() => setView(back)}>‹ Back</button>}
        <h1>{title}</h1>
      </div>
      <MajorAnnouncements token={token} />
      {view === "home" && (
        <div className="bmw-scroll"><div className="bmw-tiles">
          {([["live", "📺", "Live TV"], ["film", "🎬", "Films"], ["series", "🎞️", "Series"], ["saved", "★", "Favourites & Recently watched"], ["settings", "⚙️", "Settings"]] as const).map(([v, icon, label]) =>
            <button key={v} className="bmw-tile" onClick={() => setView(v)}><span aria-hidden>{icon}</span>{label}</button>)}
        </div></div>
      )}
      {view === "live" && (loading && !items.live ? <p className="muted bmw-center">Loading channels…</p> :
        <LiveTv channels={items.live || []} cats={cats.live || []} preview={preview} setPreview={setPreview} epg={epg} dns={dns} user={user} pass={pass}
          onPlay={playItem} onCatchup={openCatchup} isFav={isFav} toggleFav={toggleFav} toast={toast} />)}
      {(view === "film" || view === "series") && (loading && !items[view] ? <p className="muted bmw-center">Loading…</p> :
        <Posters key={view} kind={view} list={items[view] || []} cats={cats[view] || []} ratings={ratings} progress={progress} onRatings={loadRatings}
          onOpen={(i) => (i.kind === "series" ? openSeries(i) : setSheet(i))} />)}
      {view === "seriesPage" && series && <SeriesPage series={series} progress={progress} onPlay={playEpisode} isFav={isFav} toggleFav={toggleFav} rating={ratings[`series:${series.item.name}`]} onVote={() => setVote(series.item)} />}
      {view === "catchup" && catchup && (
        <div className="bmw-scroll">
          <h3>{catchup.channel.name}</h3>
          {!catchup.list ? <p className="muted">Loading recordings…</p> : !catchup.list.length ? <p className="muted">No catch up recordings for this channel.</p> : <>
            <div className="bmw-pills">{[...new Set(catchup.list.map((p) => ukDay(p.start)))].map((d) =>
              <button key={d} className={catchup.day === d ? "sel" : ""} onClick={() => setCatchup({ ...catchup, day: d })}>{d}</button>)}</div>
            <div className="bmw-list">{catchup.list.filter((p) => ukDay(p.start) === catchup.day).map((p) =>
              <button key={p.id + p.start} onClick={() => setPlaying({ kind: "catchup", id: catchup.channel.id, title: `${catchup.channel.name} · ${p.title}`, url: catchupUrl(dns, user, pass, catchup.channel.id, p.start, p.end) })}>
                <b>{clock(p.start)} – {clock(p.end)}</b> {p.title}</button>)}</div>
          </>}
        </div>
      )}
      {view === "saved" && <Saved favourites={favourites} recent={recent} onOpen={(i) => (i.kind === "live" ? playItem(i) : i.kind === "series" ? openSeries(i) : setSheet(i))} />}
      {view === "settings" && (
        <div className="bmw-scroll bmw-list">
          <p className="muted">App login: <b>{user}</b></p>
          {changeLogin && <button onClick={() => { if (confirm("Change to a different app login?")) changeLogin(); }}>Change app login</button>}
          <button onClick={() => { setItems({}); setCats({}); toast("Lists will reload next time you open them."); }}>Refresh lists</button>
          <p className="muted">Tip: tap Share, then Add to Home Screen, to keep BM Player as an app icon.</p>
          <p className="muted">Version {VERSION}</p>
        </div>
      )}
      {sheet && (
        <div className="bmw-sheet" onClick={() => setSheet(null)}><div onClick={(e) => e.stopPropagation()}>
          <h2>{sheet.name}</h2>
          <RatingText r={ratings[`film:${sheet.name}`]} />
          <div className="bmw-row-btns">
            {progress[`film:${sheet.id}`] && resumable(progress[`film:${sheet.id}`]) && <button className="on" onClick={() => playItem(sheet, true)}>▶ Resume</button>}
            <button onClick={() => playItem(sheet)}>▶ Play{progress[`film:${sheet.id}`] ? " from start" : ""}</button>
            <button aria-pressed={isFav(sheet)} onClick={() => toggleFav(sheet)}>★ {isFav(sheet) ? "Remove favourite" : "Add favourite"}</button>
            {ratings[`film:${sheet.name}`]?.mine ? <button disabled>★ You voted {ratings[`film:${sheet.name}`]?.mine}/5</button> : <button onClick={() => setVote(sheet)}>☆ Vote</button>}
            <button onClick={() => setSheet(null)}>Close</button>
          </div>
        </div></div>
      )}
      {vote && (
        <div className="bmw-sheet" onClick={() => setVote(null)}><div onClick={(e) => e.stopPropagation()}>
          <h2>Vote: {vote.name}</h2><p className="muted">Votes can't be changed once cast.</p>
          <div className="bmw-stars">{[1, 2, 3, 4, 5].map((s) => <button key={s} onClick={() => castVote(vote, s)}>{"★".repeat(s)}</button>)}</div>
          <button onClick={() => setVote(null)}>Cancel</button>
        </div></div>
      )}
      {playing && <PlayerView playing={playing} onClose={() => setPlaying(null)} toast={toast} onProgress={saveProgress} />}
      <ShortAnnouncement token={token} startedAt={startedAt} />
    </>
  );
}

const resumable = (p: { position_ms: number; duration_ms: number }) => p.position_ms > 0 && p.duration_ms > 0 && p.position_ms < p.duration_ms * 0.95;
function RatingText({ r }: { r?: Rating }) {
  return <div className="bmw-rating">{r ? r.count ? `BM ★ ${Number(r.average).toFixed(1)}/5 · ${r.count} vote${r.count === 1 ? "" : "s"}` : "BM ☆ Not rated" : "BM ☆ —"}</div>;
}
function WatchBar({ p }: { p?: { position_ms: number; duration_ms: number } }) {
  return p?.duration_ms ? <div className="bmw-watch"><i style={{ width: `${Math.min(100, Math.round(p.position_ms / p.duration_ms * 100))}%` }} /></div> : null;
}

function CategoryDrawer({ cats, value, counts, onPick, onClose }: { cats: Cat[]; value: string; counts: Record<string, number>; onPick: (id: string) => void; onClose: () => void }) {
  return (<>
    <div className="bmw-drawer-scrim" onClick={onClose} />
    <nav className="bmw-drawer" aria-label="Categories">
      <button className={value === "all" ? "sel" : ""} onClick={() => onPick("all")}>All</button>
      {cats.filter((c) => counts[c.id]).map((c) => <button key={c.id} className={value === c.id ? "sel" : ""} onClick={() => onPick(c.id)}>{c.name} <span className="muted">{counts[c.id]}</span></button>)}
    </nav>
  </>);
}

function LiveTv({ channels, cats, preview, setPreview, epg, dns, user, pass, onPlay, onCatchup, isFav, toggleFav, toast }: {
  channels: Item[]; cats: Cat[]; preview: Item | null; setPreview: (i: Item | null) => void; epg: (id: string) => Promise<Prog[]>;
  dns: string; user: string; pass: string; onPlay: (i: Item) => void; onCatchup: (i: Item) => void;
  isFav: (i: Item) => boolean; toggleFav: (i: Item) => void; toast: (m: string) => void;
}) {
  const [cat, setCat] = useState("all"), [drawer, setDrawer] = useState(false), [q, setQ] = useState(""), [search, setSearch] = useState(false);
  const [guide, setGuide] = useState<Record<string, Prog[]>>({});
  const [start, setStart] = useState(() => Math.floor(Date.now() / SLOT) * SLOT);
  const asked = useRef(new Set<string>()), grid = useRef<HTMLDivElement>(null);
  const counts = useMemo(() => channels.reduce<Record<string, number>>((o, c) => ({ ...o, [c.category]: (o[c.category] || 0) + 1 }), {}), [channels]);
  const shown = useMemo(() => channels.filter((c) => (cat === "all" || c.category === cat) && c.name.toLowerCase().includes(q.toLowerCase())), [channels, cat, q]);
  const now = Date.now(), end = start + 24 * 3_600_000, width = (end - start) / 60_000 * PX_PER_MIN;

  // Guide rows load only as they scroll into view, three at a time like the Android guide.
  useEffect(() => {
    const root = grid.current; if (!root) return;
    const queue: string[] = []; let running = 0;
    const pump = () => { while (running < 3 && queue.length) { const id = queue.shift()!; running++; epg(id).then((p) => setGuide((g) => ({ ...g, [id]: p }))).catch(() => setGuide((g) => ({ ...g, [id]: [] }))).finally(() => { running--; pump(); }); } };
    const io = new IntersectionObserver((rows) => { rows.forEach((r) => { const id = (r.target as HTMLElement).dataset.ch!; if (r.isIntersecting && !asked.current.has(id)) { asked.current.add(id); queue.push(id); } }); pump(); }, { root, rootMargin: "200px" });
    root.querySelectorAll("[data-ch]").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [shown, epg]);
  useEffect(() => { grid.current?.scrollTo(0, 0); }, [cat]);

  const list = preview ? guide[preview.id] || [] : [];
  const onNow = list.find((p) => p.start <= now && p.end > now), next = onNow ? list.find((p) => p.start >= onNow.end) : list.find((p) => p.start > now);

  function tapChannel(c: Item) { if (preview?.id === c.id) onPlay(c); else { setPreview(c); if (!guide[c.id]) void epg(c.id).then((p) => setGuide((g) => ({ ...g, [c.id]: p }))).catch(() => {}); } }
  function tapProg(c: Item, p: Prog) {
    if (p.end <= now) { if (c.archive) onCatchup(c); else toast("This programme has ended."); return; }
    if (p.start > now) { toast(`${p.title} starts at ${clock(p.start)}.`); return; }
    tapChannel(c);
  }
  return (
    <div className="bmw-live">
      <div className="bmw-top">
        <div className="bmw-preview" onDoubleClick={() => preview && onPlay(preview)}>
          {preview ? <PreviewVideo key={preview.id} url={liveUrl(dns, user, pass, preview.id)} /> : <img src={family} alt="Family on a sofa watching TV, one pointing a remote at the screen" />}
        </div>
        <div className="bmw-info">
          {preview ? <>
            <h3>{preview.name}</h3>
            {onNow && <div><span className="bmw-badge">NOW</span>{onNow.title} <span className="muted">{clock(onNow.start)}–{clock(onNow.end)} · {Math.round((now - onNow.start) / (onNow.end - onNow.start) * 100)}%</span></div>}
            {next && <div><span className="bmw-badge">UP NEXT</span>{next.title} <span className="muted">{clock(next.start)}–{clock(next.end)}</span></div>}
            <div className="bmw-row-btns">
              <button className="on" onClick={() => onPlay(preview)}>▶ Play channel</button>
              <button aria-pressed={isFav(preview)} onClick={() => toggleFav(preview)}>★</button>
              {!!preview.archive && <button onClick={() => onCatchup(preview)}>🕘 Catch up</button>}
            </div>
          </> : <p className="muted">Tap a channel to preview in the preview box. Tap it again to watch.</p>}
        </div>
      </div>
      <div className="bmw-pills">
        <button onClick={() => setDrawer(true)}>☰ {cat === "all" ? "All channels" : cats.find((c) => c.id === cat)?.name}</button>
        <button onClick={() => setStart((s) => Math.max(Math.floor(Date.now() / SLOT) * SLOT, s - 86_400_000))}>◀ 24h</button>
        <button onClick={() => { setStart(Math.floor(Date.now() / SLOT) * SLOT); grid.current?.scrollTo({ left: 0 }); }}>Now</button>
        <button onClick={() => setStart((s) => s + 86_400_000)}>24h ▶</button>
        {search ? <input autoFocus placeholder="Search TV" value={q} onChange={(e) => setQ(e.target.value)} onBlur={() => !q && setSearch(false)} /> : <button onClick={() => setSearch(true)}>🔍 Search TV</button>}
      </div>
      <div className="bmw-grid" ref={grid}>
        <div className="bmw-times" style={{ width: 130 + width }}>
          <div className="muted" style={{ paddingLeft: 6 }}>{ukDay(start)}</div>
          {Array.from({ length: 48 }, (_, i) => <div key={i} style={{ flex: `0 0 ${30 * PX_PER_MIN}px` }} className="muted">{clock(start + i * SLOT)}</div>)}
        </div>
        {shown.map((c) => (
          <div className="bmw-row" key={c.id} data-ch={c.id} style={{ width: 130 + width }}>
            <button className={`bmw-ch ${preview?.id === c.id ? "sel" : ""}`} onClick={() => tapChannel(c)}>
              {c.poster && <img src={c.poster} alt="" loading="lazy" />}<b>{c.name}</b>{!!c.archive && <span title="Catch up" aria-label="Catch up">🕘</span>}
            </button>
            <div className="bmw-progs" style={{ width }}>
              {(guide[c.id] || []).filter((p) => p.end > start && p.start < end).map((p) => {
                const left = Math.max(0, (p.start - start) / 60_000 * PX_PER_MIN), right = Math.min(width, (p.end - start) / 60_000 * PX_PER_MIN);
                return <button key={p.id + p.start} className={`bmw-prog ${p.start <= now && p.end > now ? "now" : ""}`} style={{ left, width: Math.max(4, right - left - 2) }} onClick={() => tapProg(c, p)}>{p.title}</button>;
              })}
            </div>
          </div>
        ))}
        {!shown.length && <p className="muted" style={{ padding: 12 }}>No channels found.</p>}
      </div>
      {drawer && <CategoryDrawer cats={cats} value={cat} counts={counts} onPick={(id) => { setCat(id); setDrawer(false); }} onClose={() => setDrawer(false)} />}
    </div>
  );
}

function PreviewVideo({ url }: { url: string }) {
  return <video src={url} autoPlay muted playsInline />;
}

function Posters({ kind, list, cats, ratings, progress, onRatings, onOpen }: {
  kind: "film" | "series"; list: Item[]; cats: Cat[]; ratings: Record<string, Rating>; progress: Progress; onRatings: (l: Item[]) => void; onOpen: (i: Item) => void;
}) {
  const [cat, setCat] = useState("all"), [drawer, setDrawer] = useState(false), [q, setQ] = useState("");
  const [sort, setSort] = useState(() => store.get(`bmw-sort-${kind}`, "added"));
  const counts = useMemo(() => list.reduce<Record<string, number>>((o, c) => ({ ...o, [c.category]: (o[c.category] || 0) + 1 }), {}), [list]);
  const shown = useMemo(() => {
    const l = list.filter((i) => (cat === "all" || i.category === cat) && i.name.toLowerCase().includes(q.toLowerCase()));
    return sort === "default" ? l : [...l].sort((a, b) => sort === "az" ? a.name.localeCompare(b.name) : sort === "za" ? b.name.localeCompare(a.name) : sort === "rating" ? (b.rating || 0) - (a.rating || 0) : (b.added || 0) - (a.added || 0));
  }, [list, cat, q, sort]);
  const [limit, setLimit] = useState(120);
  const pane = useRef<HTMLDivElement>(null);
  useEffect(() => { setLimit(120); pane.current?.scrollTo(0, 0); }, [cat, q, sort]);
  useEffect(() => { onRatings(shown.slice(0, limit)); }, [shown, limit]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <div className="bmw-pills">
        <button onClick={() => setDrawer(true)}>☰ {cat === "all" ? "All" : cats.find((c) => c.id === cat)?.name}</button>
        <input placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: "1 1 140px" }} />
        <select aria-label="Sort" value={sort} onChange={(e) => { setSort(e.target.value); store.set(`bmw-sort-${kind}`, e.target.value); }}>
          <option value="added">⇅ Recently added</option><option value="default">⇅ Default</option><option value="az">⇅ A–Z</option><option value="za">⇅ Z–A</option><option value="rating">⇅ Top rated</option>
        </select>
      </div>
      <div className="bmw-scroll" ref={pane} onScroll={(e) => { const el = e.currentTarget; if (el.scrollTop + el.clientHeight > el.scrollHeight - 600) setLimit((n) => n + 120); }}>
        <div className="bmw-posters">
          {shown.slice(0, limit).map((i) => (
            <button key={i.id} className="bmw-poster" onClick={() => onOpen(i)}>
              {i.poster ? <img src={i.poster} alt={i.name} loading="lazy" onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} /> : <div className="np">🎬</div>}
              {kind === "film" && <WatchBar p={progress[`film:${i.id}`]} />}
              <div className="nm">{i.name}</div>
              <RatingText r={ratings[`${i.kind}:${i.name}`]} />
            </button>
          ))}
        </div>
        {!shown.length && <p className="muted">{kind === "film" ? "No films found that play on iPhone or iPad." : "No series found."}</p>}
      </div>
      {drawer && <CategoryDrawer cats={cats} value={cat} counts={counts} onPick={(id) => { setCat(id); setDrawer(false); }} onClose={() => setDrawer(false)} />}
    </>
  );
}

function SeriesPage({ series, progress, onPlay, isFav, toggleFav, rating, onVote }: {
  series: { item: Item; plot: string; backdrop: string; seasons: Record<string, Episode[]> }; progress: Progress;
  onPlay: (e: Episode, resume: boolean) => void; isFav: (i: Item) => boolean; toggleFav: (i: Item) => void; rating?: Rating; onVote: () => void;
}) {
  const seasons = Object.keys(series.seasons);
  const [season, setSeason] = useState(seasons[0]);
  return (
    <div className="bmw-scroll">
      {series.backdrop && <div className="bmw-backdrop" style={{ backgroundImage: `url("${series.backdrop.replace(/"/g, "")}")` }} />}
      {series.plot && <p className="muted">{series.plot}</p>}
      <RatingText r={rating} />
      <div className="bmw-row-btns">
        <button aria-pressed={isFav(series.item)} onClick={() => toggleFav(series.item)}>★ {isFav(series.item) ? "Remove favourite" : "Add favourite"}</button>
        {rating?.mine ? <button disabled>★ You voted {rating.mine}/5</button> : <button onClick={onVote}>☆ Vote</button>}
      </div>
      <div className="bmw-pills">{seasons.map((s) => <button key={s} className={season === s ? "sel" : ""} onClick={() => setSeason(s)}>Season {s}</button>)}</div>
      {(series.seasons[season] || []).map((ep) => {
        const p = progress[`episode:${ep.id}`];
        return (
          <button key={ep.id} className="bmw-ep" onClick={() => onPlay(ep, !!p && resumable(p))}>
            <b>{ep.num ? `${ep.num}. ` : ""}{ep.title}</b>
            {ep.plot && <small>{ep.plot}</small>}
            <WatchBar p={p} />
            {p && resumable(p) && <small>Resume</small>}
          </button>
        );
      })}
    </div>
  );
}

function Saved({ favourites, recent, onOpen }: { favourites: Item[]; recent: Item[]; onOpen: (i: Item) => void }) {
  const [list, setList] = useState<"fav" | "recent">("fav"), [tab, setTab] = useState<"live" | "film" | "series">("live");
  const items = (list === "fav" ? favourites : recent).filter((i) => i.kind === tab);
  return (
    <div className="bmw-scroll">
      <div className="bmw-pills">
        <button className={list === "fav" ? "sel" : ""} onClick={() => setList("fav")}>★ Favourites</button>
        <button className={list === "recent" ? "sel" : ""} onClick={() => setList("recent")}>🕘 Recently watched</button>
      </div>
      <div className="bmw-pills">
        {([["live", "Live TV"], ["film", "Movies"], ["series", "Series"]] as const).map(([k, l]) => <button key={k} className={tab === k ? "sel" : ""} onClick={() => setTab(k)}>{l}</button>)}
      </div>
      <div className="bmw-list">{items.map((i) => <button key={i.kind + i.id} onClick={() => onOpen(i)}>{i.name}</button>)}</div>
      {!items.length && <p className="muted">Nothing here yet.</p>}
    </div>
  );
}

/** Full-screen playback in Safari's own player with the same anti-freeze/reconnect timing as the apps. */
function PlayerView({ playing, onClose, toast, onProgress }: { playing: Playing; onClose: () => void; toast: (m: string) => void; onProgress: (key: string, pos: number, dur: number) => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  const tries = useRef(0), lastPos = useRef({ t: 0, at: Date.now() }), stallAt = useRef<number | null>(null);
  const vod = playing.kind === "film" || playing.kind === "episode";
  const key = `${playing.kind === "episode" ? "episode" : "film"}:${playing.id}`;
  const reopen = useCallback(() => {
    const v = ref.current; if (!v) return;
    if (tries.current >= MAX_TRIES) { toast("This stream isn't responding. Try another channel or try again later."); return; }
    const at = vod ? v.currentTime : 0;
    window.setTimeout(() => { if (!ref.current) return; ref.current.src = playing.url; if (vod && at) ref.current.currentTime = at; void ref.current.play().catch(() => {}); }, backoffMs(tries.current++));
  }, [playing.url, vod, toast]);
  useEffect(() => {
    const t = window.setInterval(() => {
      const v = ref.current; if (!v || v.paused) return;
      if (v.currentTime !== lastPos.current.t) { lastPos.current = { t: v.currentTime, at: Date.now() }; stallAt.current = null; tries.current = 0; return; }
      if (Date.now() - lastPos.current.at >= 4000 && !stallAt.current) { stallAt.current = Date.now(); reopen(); }
      else if (stallAt.current && Date.now() - stallAt.current >= STALL_RECONNECT_MS) { stallAt.current = Date.now(); reopen(); }
    }, 1000);
    return () => window.clearInterval(t);
  }, [reopen]);
  useEffect(() => {
    if (!vod) return;
    const t = window.setInterval(() => { const v = ref.current; if (v && !v.paused) onProgress(key, v.currentTime, v.duration); }, 15_000);
    return () => { window.clearInterval(t); const v = ref.current; if (v) onProgress(key, v.currentTime, v.duration); };
  }, [vod, key]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="bmw-player">
      <div className="bmw-bar"><button onClick={onClose}>‹ Back</button><h1>{playing.title}</h1></div>
      <video ref={ref} src={playing.url} autoPlay playsInline controls
        onLoadedMetadata={(e) => { if (playing.resumeAt) e.currentTarget.currentTime = playing.resumeAt; }}
        onError={() => { if (tries.current === 0) toast("Reconnecting…"); reopen(); }} />
    </div>
  );
}

function ShortAnnouncement({ token, startedAt }: { token: string; startedAt: number }) {
  const [a, setA] = useState<{ id: string; message: string } | null>(null);
  useEffect(() => {
    const check = () => api<{ announcement: { id: string; message: string; age_ms: number } | null }>({ action: "announcement", device_token: token }).then((r) => {
      const x = r.announcement;
      // Only shown if BM Player was already open when it was sent, and never again once closed.
      if (x && x.age_ms <= Date.now() - startedAt && !store.get<string[]>("bmw-closed-ann", []).includes(x.id)) setA(x); else if (!x) setA(null);
    }).catch(() => {});
    void check(); const t = window.setInterval(check, 15_000); return () => window.clearInterval(t);
  }, [token, startedAt]);
  if (!a) return null;
  return <div className="bmw-announce" role="status"><span>{a.message}</span><button aria-label="Close announcement" onClick={() => { store.set("bmw-closed-ann", [...store.get<string[]>("bmw-closed-ann", []), a.id].slice(-50)); setA(null); }}>✕</button></div>;
}

function MajorAnnouncements({ token }: { token: string }) {
  const [items, setItems] = useState<{ id: string; title: string; body: string; created_at: string }[]>([]);
  const [seen, setSeen] = useState<string[]>(() => store.get<string[]>("bmw-major-seen", []));
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const check = () => api<{ items: typeof items }>({ action: "major_announcements", device_token: token }).then((r) => setItems(r.items || [])).catch(() => {});
    void check(); const t = window.setInterval(check, 60_000); return () => window.clearInterval(t);
  }, [token]);
  if (!items.length) return null;
  const unread = items.filter((i) => !seen.includes(i.id)).length;
  return (<>
    <button className="bmw-major" aria-label={`Announcements${unread ? `, ${unread} new` : ""}`} onClick={() => { setOpen(true); const s = items.map((i) => i.id); setSeen(s); store.set("bmw-major-seen", s); }}>📣{unread > 0 && <i>{unread}</i>}</button>
    {open && <div className="bmw-sheet" onClick={() => setOpen(false)}><div onClick={(e) => e.stopPropagation()}>
      <h2>Announcements</h2>
      {items.map((i) => <div key={i.id}><b>{i.title}</b><p className="muted" style={{ whiteSpace: "pre-wrap" }}>{i.body}</p></div>)}
      <button onClick={() => setOpen(false)}>Close</button>
    </div></div>}
  </>);
}
