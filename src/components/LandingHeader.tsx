import { Link, useRouterState } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/packages", label: "Packages" },
  { to: "/faq", label: "FAQ" },
  { to: "/about", label: "About" },
  { to: "/contact", label: "Contact us" },
];

export function LandingHeader() {
  const path = useRouterState({ select: (r) => r.location.pathname });

  return (
    <header className="px-8 py-5 flex items-center justify-between border-b border-border">
      <Link to="/" className="flex items-center gap-2">
        <div className="size-9 rounded-xl bg-gradient-to-br from-violet-600 to-blue-600 shadow-[0_0_30px_rgba(220,38,38,0.6)] grid place-items-center font-display font-bold text-[13px] text-white">
          BM
        </div>
        <span className="font-display font-bold text-lg">Support</span>
      </Link>
      <nav className="flex items-center gap-1">
        {navItems.map((item) => {
          const isActive = path === item.to;
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "text-sm px-4 py-2 rounded-lg transition-all",
                isActive
                  ? "font-medium text-foreground bg-primary/10 border border-primary/30 shadow-[0_0_12px_rgba(220,38,38,0.15)]"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )}
            >
              {item.label}
            </Link>
          );
        })}
        <Link
          to="/login"
          className={cn(
            "text-sm px-4 py-2 rounded-lg transition-all",
            path === "/login"
              ? "font-medium text-foreground bg-primary/10 border border-primary/30 shadow-[0_0_12px_rgba(220,38,38,0.15)]"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
          )}
        >
          Sign in
        </Link>
        <Link
          to="/signup"
          className="text-sm font-medium px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-500 shadow-[0_0_24px_rgba(220,38,38,0.55)] transition-all ml-1"
        >
          Request access
        </Link>
      </nav>
    </header>
  );
}
