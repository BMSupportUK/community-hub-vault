import { useState } from 'react';
import { Eye, EyeOff, Copy, ChevronDown, ChevronRight, KeyRound, Pencil } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { formatCredentialTime } from '@/lib/credential-time';
import type { ManualCredentialCustomer } from '@/lib/manual-credentials-schema';
import { toast } from 'sonner';

export function ManualCredentialCards({ customers, onSaved }: { customers: ManualCredentialCustomer[]; onSaved?: () => void }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const save = async (id: string) => {
    if (!login.trim()) { toast.error('Enter a username'); return; }
    setSaving(true);
    const { error } = await supabase.rpc('admin_set_manual_customer_login', { p_order_id: id, p_login_name: login.trim(), p_password: password || undefined });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Login details saved'); setEditing(null); onSaved?.();
  };
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  return <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">{customers.map(customer => <article key={customer.userId} className="rounded-lg border border-border bg-surface p-4">
    <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="font-display font-semibold break-words">{customer.displayName || customer.username || 'Manual customer'}</h2><span className="text-xs text-muted-foreground">No site account</span></div><span className="shrink-0 text-xs text-primary">{customer.accounts.length} {customer.accounts.length === 1 ? 'account' : 'accounts'}</span></div>
    <Button variant="ghost" size="sm" className="mt-3" onClick={() => setExpanded(s => ({ ...s, [customer.userId]: !s[customer.userId] }))}>{expanded[customer.userId] ? <ChevronDown /> : <ChevronRight />}{expanded[customer.userId] ? 'Hide credentials' : 'Show credentials'}</Button>
    {expanded[customer.userId] && <div className="mt-3 divide-y divide-border">{customer.accounts.map((account, i) => <section key={account.id} className="py-4 space-y-3">
      <h3 className="flex items-center gap-2 font-semibold text-sm"><KeyRound className="size-4 text-primary" />Account {i + 1}<Button variant="ghost" size="icon" className="ml-auto" aria-label="Edit login details" title="Edit login details" onClick={() => { setEditing(account.id); setLogin(account.login || ''); setPassword(''); }}><Pencil className="size-4" /></Button></h3>
      {editing === account.id && <div className="space-y-2 rounded-md border border-border p-3"><Input placeholder="Username" value={login} onChange={e => setLogin(e.target.value)} /><Input placeholder={account.password ? 'New password (leave blank to keep)' : 'Password'} value={password} onChange={e => setPassword(e.target.value)} /><div className="flex gap-2"><Button size="sm" disabled={saving} onClick={() => void save(account.id)}>{saving ? 'Saving…' : 'Save'}</Button><Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button></div></div>}
      <dl className="grid gap-2 text-sm"><div><dt className="text-xs text-muted-foreground">Username</dt><dd className="break-all font-mono">{account.login || 'Not recorded'}</dd></div><div><dt className="text-xs text-muted-foreground">Package</dt><dd>{account.package || ({ single: 'Single account', multi: 'Multi-room account', triple: 'Triple-room account' }[account.accountType || 'single'] || 'Not recorded')}</dd></div><div><dt className="text-xs text-muted-foreground">Runs out</dt><dd>{account.expiresAt ? formatCredentialTime(account.expiresAt) : 'Not recorded'}</dd></div></dl>
      <div className="flex min-w-0 items-center gap-2 border border-border rounded-md bg-surface-2 p-2"><span className="min-w-0 flex-1 break-all font-mono text-xs">{!account.password ? 'Not recorded' : revealed[account.id] ? account.password : '••••••••••••'}</span><Button disabled={!account.password} variant="ghost" size="icon" aria-label={revealed[account.id] ? 'Hide password' : 'Show password'} title={revealed[account.id] ? 'Hide password' : 'Show password'} onClick={() => setRevealed(s => ({ ...s, [account.id]: !s[account.id] }))}>{revealed[account.id] ? <EyeOff /> : <Eye />}</Button><Button disabled={!account.password} variant="ghost" size="icon" aria-label="Copy password" title="Copy password" onClick={async () => { if (account.password) { try { await navigator.clipboard.writeText(account.password); toast.success('Copied'); } catch { toast.error('Could not copy'); } } }}><Copy /></Button></div>
    </section>)}</div>}
  </article>)}</div>;
}