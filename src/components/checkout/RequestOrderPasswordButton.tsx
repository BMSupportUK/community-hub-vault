import { useState } from 'react';
import { KeyRound, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export function RequestOrderPasswordButton({ orderId, label = 'Request order password', className, title = 'Request the order password by email notification' }: { orderId: string; label?: string; className?: string; title?: string }) {
  const [busy, setBusy] = useState(false);
  async function request() {
    if (busy) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc('request_my_order_password', { p_order_id: orderId });
      if (error) throw new Error('The order password could not be requested. Please try again.');
      toast.success(data ? 'Password notification sent — check your notifications.' : 'Your password notification was just sent — check your notifications.');
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Please try again.');
    } finally { setBusy(false); }
  }
  return <Button variant="secondary" size="sm" disabled={busy} onClick={() => void request()} className={className} title={title}>
    {busy ? <Loader2 className="size-3.5 animate-spin" /> : <KeyRound className="size-3.5" />} {label}
  </Button>;
}