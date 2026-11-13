import { useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { Mail, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { sendManualCheckoutEmail } from '@/lib/manual-checkout-email.functions';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

type Order = { id: string; ref: string; name: string; linked: boolean };
export function ManualCheckoutEmailButton({ customerId, name }: { customerId: string; name: string }) {
  const send = useServerFn(sendManualCheckoutEmail);
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]), [orderId, setOrderId] = useState('');
  const [requestId, setRequestId] = useState('');
  async function show() {
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc('admin_manual_customer_checkout_options', { p_customer_id: customerId });
      if (error) throw error;
      const rows = (data || []) as unknown as Order[];
      setOrders(rows); setOrderId(rows.filter(o => o.linked).length === 1 ? rows.find(o => o.linked)?.id || '' : '');
      setRequestId(crypto.randomUUID()); setOpen(true);
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not load manual orders'); }
    finally { setBusy(false); }
  }
  async function submit() {
    setBusy(true);
    try {
      const result = await send({ data: { customerId, orderId, requestId } });
      if (result.sent) { toast.success('Secure checkout link and order password emailed.'); setOpen(false); }
      else toast.warning('Email blocked because this recipient cannot receive app emails.');
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Email could not be sent'); }
    finally { setBusy(false); }
  }
  return <><Button variant="ghost" size="icon" className="shrink-0" disabled={busy} title="Email secure checkout" aria-label={`Email secure checkout to ${name}`} onClick={() => void show()}>{busy ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" />}</Button><Dialog open={open} onOpenChange={value => { if (!busy) setOpen(value); }}><DialogContent><DialogHeader><DialogTitle>Email secure checkout · {name}</DialogTitle></DialogHeader><label className="space-y-2 text-sm">Order<select aria-label="Secure checkout order" className="h-10 w-full rounded-md border border-input bg-background px-3" value={orderId} onChange={e => { setOrderId(e.target.value); setRequestId(crypto.randomUUID()); }}><option value="">Choose order</option>{orders.map(o => <option key={o.id} value={o.id}>{o.ref} · {o.name}{o.linked ? ' · Linked' : ''}</option>)}</select></label><p className="text-sm text-muted-foreground">The customer receives their checkout link and order password. No website account is created.</p><DialogFooter><Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>Cancel</Button><Button disabled={busy || !orderId} onClick={() => void submit()}><Mail className="size-4" />{busy ? 'Sending…' : 'Send checkout email'}</Button></DialogFooter></DialogContent></Dialog></>;
}