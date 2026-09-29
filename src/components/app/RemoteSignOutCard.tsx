import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { LogOut, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { getRemoteSignOutInfo, remoteSignOutUser } from "@/lib/remote-signout.functions";

type P = { id: string; display_name: string | null; username: string | null; avatar_url: string | null };
type Info = { sessionCount: number; lastSignIn: string | null; lastRemoteSignOut: string | null };

const fmt = (s: string | null) => (s ? new Date(s).toLocaleString("en-GB") : "Never");

export function RemoteSignOutCard() {
  const { user } = useAuth();
  const infoFn = useServerFn(getRemoteSignOutInfo);
  const signOutFn = useServerFn(remoteSignOutUser);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<P[]>([]);
  const [picked, setPicked] = useState<P | null>(null);
  const [info, setInfo] = useState<Info | null>(null);
  const [keep, setKeep] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return setResults([]);
    const t = setTimeout(async () => {
      const like = `%${term.replace(/[%_,]/g, "")}%`;
      const { data } = await supabase
        .from("profiles")
        .select("id, display_name, username, avatar_url")
        .or(`display_name.ilike.${like},username.ilike.${like}`)
        .limit(10);
      setResults((data as P[]) ?? []);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const load = async (p: P) => {
    setPicked(p);
    setInfo(null);
    try {
      setInfo(await infoFn({ data: { targetId: p.id } }));
    } catch (e: any) {
      toast.error(e?.message ?? "Couldn't load devices");
    }
  };

  const isSelf = picked?.id === user?.id;
  const name = picked?.display_name || picked?.username || "this user";

  const run = async () => {
    if (!picked) return;
    if (!window.confirm(`Sign out ${name} from all devices${isSelf && keep ? " except this one" : ""}?`)) return;
    setBusy(true);
    try {
      const r = await signOutFn({ data: { targetId: picked.id, keepThisDevice: isSelf && keep } });
      toast.success(`Signed out ${name} (${r.revoked} device${r.revoked === 1 ? "" : "s"})`);
      await load(picked);
    } catch (e: any) {
      toast.error(e?.message ?? "Sign out failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-surface-1 p-5 space-y-4">
      <div>
        <h2 className="font-display font-bold text-lg">Sign out devices</h2>
        <p className="text-xs text-muted-foreground">Sign an account out of every phone, browser and app it's signed in on. Their password isn't changed.</p>
      </div>
      <div className="relative">
        <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search members by name…"
          className="w-full h-10 pl-9 pr-3 rounded-lg bg-surface-2 border border-border text-sm"
        />
      </div>
      {results.length > 0 && (
        <div className="rounded-lg border border-border divide-y divide-border max-h-64 overflow-auto">
          {results.map((p) => (
            <button key={p.id} type="button" onClick={() => { load(p); setResults([]); setQ(""); }}
              className="w-full flex items-center gap-3 px-3 py-2 text-left text-sm hover:bg-surface-2">
              {p.avatar_url ? <img src={p.avatar_url} alt="" className="size-7 rounded-full object-cover" /> : <div className="size-7 rounded-full bg-surface-2" />}
              <span className="truncate">{p.display_name || p.username || "Unnamed"}</span>
            </button>
          ))}
        </div>
      )}
      {picked && (
        <div className="rounded-xl border border-border bg-surface-2 p-4 space-y-3">
          <div className="font-semibold">{name}{isSelf && " (you)"}</div>
          {info ? (
            <div className="text-sm text-muted-foreground space-y-1">
              <div>Devices signed in: <span className="text-foreground font-medium">{info.sessionCount}</span></div>
              <div>Last sign-in: <span className="text-foreground">{fmt(info.lastSignIn)}</span></div>
              <div>Last remote sign-out: <span className="text-foreground">{fmt(info.lastRemoteSignOut)}</span></div>
            </div>
          ) : (
            <Loader2 className="size-4 animate-spin" />
          )}
          {isSelf && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} />
              Keep this device signed in
            </label>
          )}
          <button type="button" onClick={run} disabled={busy}
            className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-destructive text-destructive-foreground text-sm font-medium disabled:opacity-60">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <LogOut className="size-4" />}
            Sign out everywhere
          </button>
        </div>
      )}
    </div>
  );
}
