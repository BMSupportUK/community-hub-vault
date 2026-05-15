import { useState } from "react";
import {
  Hash, Megaphone, Bell, Star, Heart, Flag, Bookmark, Pin, Trophy,
  Gamepad2, Music, Film, Tv, Camera, Image as ImageIcon, Mic,
  Headphones, MessageSquare, MessageCircle, Users, UserPlus, Coffee,
  Code, Terminal, Bug, Wrench, Cog, Shield, Lock, Key, Mail,
  Calendar, Clock, MapPin, Globe, Compass, Rocket, Zap, Flame,
  Sparkles, Sun, Moon, Cloud, CircleHelp, Lightbulb, BookOpen, FileText,
  Folder, Briefcase, ShoppingBag, ShoppingCart, CreditCard, DollarSign,
  Gift, PartyPopper, Cake, Pizza, Utensils, Beer, Dog, Cat,
} from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Hash, Megaphone, Bell, Star, Heart, Flag, Bookmark, Pin, Trophy,
  Gamepad2, Music, Film, Tv, Camera, Image: ImageIcon, Mic,
  Headphones, MessageSquare, MessageCircle, Users, UserPlus, Coffee,
  Code, Terminal, Bug, Wrench, Cog, Shield, Lock, Key, Mail,
  Calendar, Clock, MapPin, Globe, Compass, Rocket, Zap, Flame,
  Sparkles, Sun, Moon, Cloud, CircleHelp, Lightbulb, BookOpen, FileText,
  Folder, Briefcase, ShoppingBag, ShoppingCart, CreditCard, DollarSign,
  Gift, PartyPopper, Cake, Pizza, Utensils, Beer, Dog, Cat,
};

export const ICON_NAMES = Object.keys(ICON_MAP);

export function getIcon(name: string | null | undefined): React.ComponentType<{ className?: string }> {
  return (name && ICON_MAP[name]) || Hash;
}

export function IconPicker({
  open,
  onOpenChange,
  title,
  current,
  onSave,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  current?: string | null;
  onSave: (iconName: string) => void | Promise<void>;
}) {
  const [selected, setSelected] = useState<string>(current || "Hash");
  const [query, setQuery] = useState("");
  const filtered = ICON_NAMES.filter((n) => n.toLowerCase().includes(query.toLowerCase()));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <Input
          autoFocus
          placeholder="Search icons…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="grid grid-cols-8 gap-1 max-h-[280px] overflow-y-auto scrollbar-thin py-1">
          {filtered.map((name) => {
            const Ico = ICON_MAP[name];
            const active = selected === name;
            return (
              <button
                key={name}
                type="button"
                onClick={() => setSelected(name)}
                title={name}
                className={cn(
                  "aspect-square rounded-md grid place-items-center border transition-colors",
                  active
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border text-muted-foreground hover:bg-surface-2 hover:text-foreground",
                )}
              >
                <Ico className="size-4" />
              </button>
            );
          })}
          {filtered.length === 0 && (
            <div className="col-span-8 text-xs text-muted-foreground text-center py-6">No icons match.</div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={async () => { await onSave(selected); onOpenChange(false); }}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}