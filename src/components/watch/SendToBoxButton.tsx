import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { Cast, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { listMyBoxes, sendToBox } from '@/lib/send-to-box.functions';

type Props = { kind: 'movie' | 'series'; itemId: string | null; title: string };

/** Small "Watch on my box" button: asks which box when there are several, refuses boxes that aren't on. */
export function SendToBoxButton({ kind, itemId, title }: Props) {
  const list = useServerFn(listMyBoxes);
  const send = useServerFn(sendToBox);
  const [choosing, setChoosing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const boxes = useQuery({ queryKey: ['my-boxes'], queryFn: () => list(), enabled: choosing, staleTime: 0 });

  async function go(deviceId: string, name: string) {
    setBusy(deviceId); setNote(null);
    try {
      const r = await send({ data: { deviceId, kind, itemId, title } });
      setNote(r.ok ? { ok: true, text: `Sent to ${name}. It will open in a few seconds.` } : { ok: false, text: r.error ?? 'Could not send.' });
      if (r.ok) setChoosing(false);
    } catch { setNote({ ok: false, text: 'Could not send to your box. Please try again.' }); }
    finally { setBusy(null); }
  }
  async function start() {
    setNote(null); setChoosing(true);
    const r = await boxes.refetch();
    const all = r.data ?? [];
    if (all.length === 1) {
      if (!all[0].on) { setNote({ ok: false, text: 'Your box is not on. Turn it on and open BM Player, then try again.' }); setChoosing(false); return; }
      await go(all[0].id, all[0].name);
    }
  }

  const all = boxes.data ?? [];
  return <div className="space-y-2">
    {!(choosing && all.length > 1) && <Button size="sm" variant="outline" onClick={start} disabled={boxes.isFetching || !!busy}>
      {boxes.isFetching || busy ? <Loader2 className="size-4 animate-spin" /> : <Cast className="size-4" />}Watch on my box
    </Button>}
    {choosing && !boxes.isFetching && all.length === 0 && <p className="text-xs text-muted-foreground">No BM Player box is linked to your account yet.</p>}
    {choosing && all.length > 1 && <div className="space-y-1.5">
      <p className="text-xs font-medium">Which box?</p>
      <div className="flex flex-wrap gap-2">
        {all.map(b => <Button key={b.id} size="sm" variant="secondary" disabled={!!busy}
          onClick={() => b.on ? go(b.id, b.name) : setNote({ ok: false, text: `${b.name} is not on. Turn it on and open BM Player, then try again.` })}>
          {busy === b.id && <Loader2 className="size-4 animate-spin" />}{b.name} · {b.type}{!b.on && ' (off)'}
        </Button>)}
        <Button size="sm" variant="ghost" onClick={() => { setChoosing(false); setNote(null); }}>Cancel</Button>
      </div>
    </div>}
    {note && <p role="status" className={`text-xs ${note.ok ? 'text-primary-glow' : 'text-destructive'}`}>{note.text}</p>}
  </div>;
}
