import { useEffect, useState } from "react";
import { Loader2, Trophy } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  getBoroFullLeagueTable,
  type FullLeagueRow,
} from "@/lib/boro-league-table.functions";

export function BoroFullLeagueTableDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [rows, setRows] = useState<FullLeagueRow[] | null>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setRows(null);
    void getBoroFullLeagueTable()
      .then((r) => alive && setRows(r))
      .catch(() => alive && setRows([]));
    return () => {
      alive = false;
    };
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl p-0 overflow-hidden border-[#E11B22]/40">
        <DialogHeader className="px-5 py-4 bg-gradient-to-r from-[#E11B22] to-[#8B0F14] text-white space-y-0.5">
          <DialogTitle className="font-display font-black tracking-wide flex items-center gap-2 text-white">
            <Trophy className="size-4" /> EFL Championship table
          </DialogTitle>
          <DialogDescription className="text-white/80 text-xs">
            Full standings — Middlesbrough highlighted.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[70vh] overflow-y-auto">
          {rows === null ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Loading table…
            </div>
          ) : rows.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground italic">
              Table unavailable right now.
            </div>
          ) : (
            <table className="w-full text-xs sm:text-sm font-mono tabular-nums">
              <thead className="sticky top-0 bg-surface-1 text-muted-foreground text-[11px] uppercase">
                <tr>
                  <th className="px-2 py-2 text-left w-8">#</th>
                  <th className="px-2 py-2 text-left font-sans">Team</th>
                  <th className="px-1.5 py-2 text-center">P</th>
                  <th className="px-1.5 py-2 text-center">W</th>
                  <th className="px-1.5 py-2 text-center">D</th>
                  <th className="px-1.5 py-2 text-center">L</th>
                  <th className="px-1.5 py-2 text-center hidden sm:table-cell">GF</th>
                  <th className="px-1.5 py-2 text-center hidden sm:table-cell">GA</th>
                  <th className="px-1.5 py-2 text-center">GD</th>
                  <th className="px-2 py-2 text-center font-bold">Pts</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={`${r.position}-${r.team}`}
                    className={
                      r.isBoro
                        ? "bg-[#E11B22]/20 text-foreground font-bold ring-1 ring-inset ring-[#E11B22]/60"
                        : "text-muted-foreground border-t border-border/50"
                    }
                  >
                    <td className="px-2 py-1.5">{r.position}</td>
                    <td className="px-2 py-1.5 font-sans">
                      <span className="flex items-center gap-2 min-w-0">
                        {r.logo && (
                          <img
                            src={r.logo}
                            alt=""
                            className="size-4 sm:size-5 object-contain shrink-0"
                            loading="lazy"
                          />
                        )}
                        <span className="truncate">{r.team}</span>
                      </span>
                    </td>
                    <td className="px-1.5 py-1.5 text-center">{r.played}</td>
                    <td className="px-1.5 py-1.5 text-center">{r.won}</td>
                    <td className="px-1.5 py-1.5 text-center">{r.drawn}</td>
                    <td className="px-1.5 py-1.5 text-center">{r.lost}</td>
                    <td className="px-1.5 py-1.5 text-center hidden sm:table-cell">{r.goalsFor}</td>
                    <td className="px-1.5 py-1.5 text-center hidden sm:table-cell">{r.goalsAgainst}</td>
                    <td className="px-1.5 py-1.5 text-center">
                      {r.goalDifference > 0 ? `+${r.goalDifference}` : r.goalDifference}
                    </td>
                    <td className="px-2 py-1.5 text-center font-bold text-foreground">{r.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
