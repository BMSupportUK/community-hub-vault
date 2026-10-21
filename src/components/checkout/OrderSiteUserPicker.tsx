import { useState } from "react";
import { Users, Search, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";

export type OrderSiteUser = { id: string; username: string | null; display_name: string | null; email: string | null };

export function OrderSiteUserPicker({ selected, onSelect }: { selected: OrderSiteUser | null; onSelect: (user: OrderSiteUser | null) => void }) {
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState<OrderSiteUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const show = async () => {
    setOpen(true); setLoading(true); setError("");
    const { data, error } = await supabase.rpc("admin_order_site_users");
    setUsers(data ?? []); setError(error?.message ?? ""); setLoading(false);
  };
  const matches = users.filter((user) => [user.username, user.display_name, user.email].some((value) => value?.toLowerCase().includes(search.trim().toLowerCase())));
  return <>
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="outline" onClick={() => void show()}><Users className="size-4" />{selected ? "Change site user" : "Choose site user"}</Button>
      {selected && <><span className="text-sm font-medium break-words">{selected.username || selected.display_name}</span><Button variant="ghost" size="sm" onClick={() => onSelect(null)}>Remove</Button></>}
    </div>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[85dvh] flex flex-col sm:max-w-lg"><DialogHeader><DialogTitle>Choose site user</DialogTitle></DialogHeader>
      <div className="relative"><Search className="absolute left-3 top-3 size-4 text-muted-foreground" /><input aria-label="Search site users" placeholder="Search username, name or email" value={search} onChange={(event) => setSearch(event.target.value)} className="h-10 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm" /></div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="min-h-0 overflow-y-auto divide-y divide-border">
        {loading ? <div role="status" className="flex items-center gap-2 py-4 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Loading site users…</div> : matches.map((user) => <Button key={user.id} variant="ghost" className="h-auto w-full justify-start whitespace-normal py-3 text-left" onClick={() => { onSelect(user); setOpen(false); }}><span className="min-w-0"><span className="block font-semibold break-words">{user.username || user.display_name}</span>{user.display_name && user.username && <span className="block text-sm text-muted-foreground break-words">{user.display_name}</span>}<span className="block text-xs text-muted-foreground break-all">{user.email}</span></span></Button>)}
        {!loading && !error && !matches.length && <p className="py-4 text-sm text-muted-foreground">No site users found.</p>}
      </div>
    </DialogContent></Dialog>
  </>;
}