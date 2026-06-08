import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Trophy, CalendarDays, BarChart3, Pencil, Loader2, X } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  getBoroMatchCentre,
  saveBoroMatchCentre,
  type MatchCentreDTO,
  type LastResult,
  type NextFixture,
  type LeaguePosition,
  type LeagueTableRow,
} from "@/lib/boro-match-centre.functions";
import { useAuth } from "@/hooks/use-auth";
import { useUserTimezone } from "@/hooks/use-user-timezone";

const BORO = "Middlesbrough";

function isBoro(name: string) {
  return /middles?brough|boro/i.test(name);
}

function fmtDate(iso: string, tz: string) {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      weekday: "short",
      day: "2-digit",
      month: "short",
      timeZone: tz,
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}
function fmtTime(iso: string, tz: string) {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: tz,
      timeZoneName: "short",
    }).format(new Date(iso));
  } catch {
    return "";
  }
}

function TeamRow({
  name,
  score,
  logo,
}: {
  name: string;
  score?: number;
  logo?: string | null;
}) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <div className="size-7 shrink-0 grid place-items-center">
        {logo ? (
          <img
            src={logo}
            alt=""
            className="size-7 object-contain"
            loading="lazy"
          />
        ) : (
          <span
            className={`inline-block size-5 rounded-full ring-1 ring-white/20 ${
              isBoro(name) ? "bg-[#E11B22]" : "bg-amber-300"
            }`}
            aria-hidden
          />
        )}
      </div>
      <span className="flex-1 truncate text-base font-medium">{name}</span>
      {typeof score === "number" && (
        <span className="font-mono font-bold tabular-nums text-lg w-6 text-right">
          {score}
        </span>
      )}
    </div>
  );
}

function FixtureCard({
  children,
  rightLabel,
  meta,
}: {
  children: ReactNode;
  rightLabel: string;
  meta?: string;
}) {
  return (
    <section className="px-1">
      {meta && (
        <div className="text-[11px] text-muted-foreground mb-1 px-1">{meta}</div>
      )}
      <div className="flex items-stretch gap-3">
        <div className="flex-1 divide-y divide-border/60">{children}</div>
        <div className="flex items-center pl-3 border-l border-border/60">
          <span className="text-xs font-bold text-muted-foreground tracking-wider">
            {rightLabel}
          </span>
        </div>
      </div>
    </section>
  );
}

export function BoroMatchCentreBox() {
  const { hasAny } = useAuth();
  const canEdit = hasAny(["admin", "management"]);
  const tz = useUserTimezone();
  const fetchData = useServerFn(getBoroMatchCentre);
  const saveData = useServerFn(saveBoroMatchCentre);

  const [data, setData] = useState<MatchCentreDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);

  const load = async () => {
    try {
      const d = await fetchData();
      setData(d);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);

  if (loading) {
    return (
      <aside className="rounded-xl border border-[#E11B22]/40 bg-surface-1/85 p-4 text-sm text-muted-foreground">
        Loading match centre…
      </aside>
    );
  }

  const lr = data?.lastResult ?? null;
  const nf = data?.nextFixture ?? null;
  const lp = data?.leaguePosition ?? null;

  return (
    <aside className="rounded-xl border border-[#E11B22]/40 bg-surface-1/85 backdrop-blur-sm overflow-hidden shadow-[0_8px_30px_-12px_rgba(225,27,34,0.45)]">
      <div className="px-4 py-3 bg-gradient-to-r from-[#E11B22] to-[#8B0F14] text-white flex items-center justify-between">
        <h3 className="font-display text-sm font-bold uppercase tracking-wider flex items-center gap-2">
          <Trophy className="size-4" /> Boro Match Centre
        </h3>
        {canEdit && (
          <button
            onClick={() => setEditing(true)}
            className="opacity-80 hover:opacity-100"
            title="Edit"
            aria-label="Edit match centre"
          >
            <Pencil className="size-3.5" />
          </button>
        )}
      </div>

      <div className="p-3 space-y-3">
        {/* Last result */}
        <div className="text-[10px] uppercase tracking-wider font-bold text-[#E11B22] flex items-center gap-1 px-1">
          <Trophy className="size-3" /> Last result
        </div>
        {lr ? (
          <FixtureCard
            rightLabel="FT"
            meta={`${fmtDate(lr.date, tz)} · ${lr.competition}`}
          >
            <TeamRow name={lr.home} score={lr.homeScore} logo={lr.homeLogo} />
            <TeamRow name={lr.away} score={lr.awayScore} logo={lr.awayLogo} />
          </FixtureCard>
        ) : (
          <div className="text-xs text-muted-foreground italic px-1">No result yet.</div>
        )}

        <div className="border-t border-border/60" />

        {/* Next fixture */}
        <div className="text-[10px] uppercase tracking-wider font-bold text-[#E11B22] flex items-center gap-1 px-1">
          <CalendarDays className="size-3" /> Next fixture
        </div>
        {nf ? (
          <FixtureCard
            rightLabel={`KO ${fmtTime(nf.kickoff, tz)}`}
            meta={`${fmtDate(nf.kickoff, tz)} · ${nf.competition}${nf.venue ? ` · ${nf.venue}` : ""}`}
          >
            <TeamRow name={nf.home} logo={nf.homeLogo} />
            <TeamRow name={nf.away} logo={nf.awayLogo} />
          </FixtureCard>
        ) : (
          <div className="text-xs text-muted-foreground italic px-1">No fixture scheduled.</div>
        )}

        {/* League position */}
        <section className="rounded-lg border border-border bg-surface-2/70 p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] uppercase tracking-wider font-bold text-[#E11B22] flex items-center gap-1">
              <Trophy className="size-3" /> League
            </span>
            {lp && (
              <span className="text-[10px] text-muted-foreground">{lp.competition}</span>
            )}
          </div>
          {lp?.table && lp.table.length > 0 ? (
            <div className="overflow-hidden rounded border border-border/60">
              <table className="w-full text-[11px] font-mono tabular-nums">
                <thead className="bg-surface-1 text-muted-foreground">
                  <tr>
                    <th className="px-1.5 py-1 text-left w-6">#</th>
                    <th className="px-1.5 py-1 text-left">Team</th>
                    <th className="px-1 py-1 text-center">P</th>
                    <th className="px-1 py-1 text-center">W</th>
                    <th className="px-1 py-1 text-center">D</th>
                    <th className="px-1 py-1 text-center">L</th>
                    <th className="px-1 py-1 text-center">GD</th>
                    <th className="px-1 py-1 text-center font-bold">Pts</th>
                  </tr>
                </thead>
                <tbody>
                  {lp.table.map((r) => {
                    const boro = r.isBoro || isBoro(r.team);
                    return (
                      <tr
                        key={`${r.position}-${r.team}`}
                        className={
                          boro
                            ? "bg-[#E11B22]/15 text-foreground font-bold"
                            : "text-muted-foreground"
                        }
                      >
                        <td className="px-1.5 py-1">{r.position}</td>
                        <td className="px-1.5 py-1 font-sans truncate max-w-[120px]">{r.team}</td>
                        <td className="px-1 py-1 text-center">{r.played}</td>
                        <td className="px-1 py-1 text-center">{r.won}</td>
                        <td className="px-1 py-1 text-center">{r.drawn}</td>
                        <td className="px-1 py-1 text-center">{r.lost}</td>
                        <td className="px-1 py-1 text-center">{r.goalDifference > 0 ? `+${r.goalDifference}` : r.goalDifference}</td>
                        <td className="px-1 py-1 text-center font-bold">{r.points}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : lp ? (
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-2xl font-display font-bold text-[#E11B22] leading-none">
                  {lp.position}
                  <sup className="text-xs ml-0.5">
                    {ordinalSuffix(lp.position)}
                  </sup>
                </span>
                <span className="text-[10px] text-muted-foreground leading-tight">
                  Position
                </span>
              </div>
              <div className="grid grid-cols-5 gap-1.5 text-[10px] text-center flex-1">
                {[
                  ["P", lp.played],
                  ["W", lp.won],
                  ["D", lp.drawn],
                  ["L", lp.lost],
                  ["Pts", lp.points],
                ].map(([k, v]) => (
                  <div key={String(k)} className="rounded bg-surface-1 py-1">
                    <div className="text-muted-foreground">{k}</div>
                    <div className="font-bold font-mono">{v}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-xs text-muted-foreground italic">League position not set.</div>
          )}
        </section>

        {data?.fetchedAt && (
          <div className="text-[10px] text-muted-foreground text-center">
            Source: mfc.co.uk · updated {new Date(data.updatedAt ?? data.fetchedAt).toLocaleString()}
          </div>
        )}
      </div>

      {editing && canEdit && (
        <EditDialog
          data={data}
          onClose={() => setEditing(false)}
          onSaved={async () => {
            setEditing(false);
            await load();
            toast.success("Match centre updated");
          }}
          save={saveData}
        />
      )}
    </aside>
  );
}

function ordinalSuffix(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

function EditDialog({
  data,
  onClose,
  onSaved,
  save,
}: {
  data: MatchCentreDTO | null;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
  save: ReturnType<typeof useServerFn<typeof saveBoroMatchCentre>>;
}) {
  const lr = data?.lastResult;
  const nf = data?.nextFixture;
  const lp = data?.leaguePosition;
  const [busy, setBusy] = useState(false);

  // Last result
  const [lrDate, setLrDate] = useState(lr?.date?.slice(0, 10) ?? "");
  const [lrComp, setLrComp] = useState(lr?.competition ?? "Championship");
  const [lrHome, setLrHome] = useState(lr?.home ?? "");
  const [lrAway, setLrAway] = useState(lr?.away ?? BORO);
  const [lrHs, setLrHs] = useState(String(lr?.homeScore ?? 0));
  const [lrAs, setLrAs] = useState(String(lr?.awayScore ?? 0));

  // Next fixture
  const toLocalInput = (iso?: string) => {
    if (!iso) return "";
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const [nfWhen, setNfWhen] = useState(toLocalInput(nf?.kickoff));
  const [nfComp, setNfComp] = useState(nf?.competition ?? "Championship");
  const [nfHome, setNfHome] = useState(nf?.home ?? BORO);
  const [nfAway, setNfAway] = useState(nf?.away ?? "");
  const [nfVenue, setNfVenue] = useState(nf?.venue ?? "");

  // League
  const [lpComp, setLpComp] = useState(lp?.competition ?? "EFL Championship");
  const [lpPos, setLpPos] = useState(String(lp?.position ?? 1));
  const [lpP, setLpP] = useState(String(lp?.played ?? 0));
  const [lpW, setLpW] = useState(String(lp?.won ?? 0));
  const [lpD, setLpD] = useState(String(lp?.drawn ?? 0));
  const [lpL, setLpL] = useState(String(lp?.lost ?? 0));
  const [lpGd, setLpGd] = useState(String(lp?.goalDifference ?? 0));
  const [lpPts, setLpPts] = useState(String(lp?.points ?? 0));

  const submit = async () => {
    setBusy(true);
    try {
      const payload: any = {};
      if (lrDate && lrHome && lrAway) {
        payload.lastResult = {
          date: new Date(lrDate).toISOString(),
          competition: lrComp,
          home: lrHome,
          away: lrAway,
          homeScore: parseInt(lrHs, 10) || 0,
          awayScore: parseInt(lrAs, 10) || 0,
        };
      }
      if (nfWhen && nfHome && nfAway) {
        payload.nextFixture = {
          kickoff: new Date(nfWhen).toISOString(),
          competition: nfComp,
          home: nfHome,
          away: nfAway,
          venue: nfVenue || null,
        };
      }
      if (lpPos) {
        payload.leaguePosition = {
          competition: lpComp,
          position: parseInt(lpPos, 10),
          played: parseInt(lpP, 10) || 0,
          won: parseInt(lpW, 10) || 0,
          drawn: parseInt(lpD, 10) || 0,
          lost: parseInt(lpL, 10) || 0,
          goalDifference: parseInt(lpGd, 10) || 0,
          points: parseInt(lpPts, 10) || 0,
        };
      }
      await save({ data: payload });
      await onSaved();
    } catch (e: any) {
      toast.error(e?.message ?? "Save failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 grid place-items-center p-4" onClick={onClose}>
      <div
        className="bg-surface-1 border border-border rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-gradient-to-r from-[#E11B22] to-[#8B0F14] text-white">
          <h3 className="font-bold">Edit Match Centre</h3>
          <button onClick={onClose} aria-label="Close"><X className="size-4" /></button>
        </div>
        <div className="p-4 space-y-5 text-sm">
          <fieldset className="space-y-2">
            <legend className="font-bold text-xs uppercase tracking-wider text-[#E11B22]">Last result</legend>
            <input type="date" className="input" value={lrDate} onChange={(e) => setLrDate(e.target.value)} />
            <input className="input" placeholder="Competition" value={lrComp} onChange={(e) => setLrComp(e.target.value)} />
            <div className="grid grid-cols-[1fr_60px] gap-2">
              <input className="input" placeholder="Home team" value={lrHome} onChange={(e) => setLrHome(e.target.value)} />
              <input className="input text-center" type="number" min={0} value={lrHs} onChange={(e) => setLrHs(e.target.value)} />
            </div>
            <div className="grid grid-cols-[1fr_60px] gap-2">
              <input className="input" placeholder="Away team" value={lrAway} onChange={(e) => setLrAway(e.target.value)} />
              <input className="input text-center" type="number" min={0} value={lrAs} onChange={(e) => setLrAs(e.target.value)} />
            </div>
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="font-bold text-xs uppercase tracking-wider text-[#E11B22]">Next game</legend>
            <input type="datetime-local" className="input" value={nfWhen} onChange={(e) => setNfWhen(e.target.value)} />
            <input className="input" placeholder="Competition" value={nfComp} onChange={(e) => setNfComp(e.target.value)} />
            <input className="input" placeholder="Home team" value={nfHome} onChange={(e) => setNfHome(e.target.value)} />
            <input className="input" placeholder="Away team" value={nfAway} onChange={(e) => setNfAway(e.target.value)} />
            <input className="input" placeholder="Venue (optional)" value={nfVenue ?? ""} onChange={(e) => setNfVenue(e.target.value)} />
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="font-bold text-xs uppercase tracking-wider text-[#E11B22]">League position</legend>
            <input className="input" placeholder="Competition" value={lpComp} onChange={(e) => setLpComp(e.target.value)} />
            <div className="grid grid-cols-4 gap-2">
              <label className="text-[10px]">Pos<input className="input" type="number" value={lpPos} onChange={(e) => setLpPos(e.target.value)} /></label>
              <label className="text-[10px]">P<input className="input" type="number" value={lpP} onChange={(e) => setLpP(e.target.value)} /></label>
              <label className="text-[10px]">W<input className="input" type="number" value={lpW} onChange={(e) => setLpW(e.target.value)} /></label>
              <label className="text-[10px]">D<input className="input" type="number" value={lpD} onChange={(e) => setLpD(e.target.value)} /></label>
              <label className="text-[10px]">L<input className="input" type="number" value={lpL} onChange={(e) => setLpL(e.target.value)} /></label>
              <label className="text-[10px]">GD<input className="input" type="number" value={lpGd} onChange={(e) => setLpGd(e.target.value)} /></label>
              <label className="text-[10px]">Pts<input className="input" type="number" value={lpPts} onChange={(e) => setLpPts(e.target.value)} /></label>
            </div>
          </fieldset>

          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <button onClick={onClose} className="px-3 py-1.5 rounded-md border border-border text-sm">Cancel</button>
            <button
              disabled={busy}
              onClick={submit}
              className="px-3 py-1.5 rounded-md bg-[#E11B22] text-white text-sm font-bold flex items-center gap-2 disabled:opacity-60"
            >
              {busy && <Loader2 className="size-3.5 animate-spin" />} Save
            </button>
          </div>
        </div>
        <style>{`.input{width:100%;padding:0.4rem 0.6rem;border-radius:6px;border:1px solid var(--border);background:var(--surface-2);color:inherit;font-size:0.875rem}`}</style>
      </div>
    </div>
  );
}
