import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { LayoutDashboard, Radio, Briefcase, TrendingUp, LogOut } from "lucide-react";
import ThemeToggle from "./ThemeToggle";
import { Button } from "@/components/ui/button";
import { authSession, SESSION_EVENT } from "@/lib/api";

const navItems = [
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/live', label: 'Live Data', icon: Radio },
  { path: '/portfolio', label: 'Portfolio', icon: Briefcase },
  { path: '/market', label: 'Market', icon: TrendingUp },
];

export default function Navbar() {
  const [location, navigate] = useLocation();
  const [session, setSession] = useState(() => authSession.getUser());

  useEffect(() => {
    if (typeof window === "undefined") return;

    const syncSession = () => setSession(authSession.getUser());
    const handleSessionEvent = () => syncSession();
    syncSession();

    window.addEventListener("storage", syncSession);
    window.addEventListener(SESSION_EVENT, handleSessionEvent);
    return () => {
      window.removeEventListener("storage", syncSession);
      window.removeEventListener(SESSION_EVENT, handleSessionEvent);
    };
  }, []);

  const handleSignOut = () => {
    authSession.clear();
    setSession(null);
    navigate("/");
  };

  return (
    <nav className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-8">
            <Link
              href="/dashboard"
              className="flex items-center gap-2 font-bold text-xl text-foreground"
              aria-label="NFLXchange home"
            >
              <img
                src="/logo.svg"
                alt="NFLXchange logo"
                className="h-9 w-auto transition-[filter] duration-200 dark:invert"
                loading="eager"
                decoding="async"
              />
              <span className="text-primary font-mono text-lg tracking-tight">
                NFLSE
              </span>
            </Link>
            
            <div className="hidden md:flex items-center gap-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = location === item.path;
                return (
                  <Link
                    key={item.path}
                    href={item.path}
                    className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors hover-elevate ${
                      isActive
                        ? 'bg-accent text-accent-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                    data-testid={`nav-link-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                  >
                    <Icon className="w-4 h-4" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-3">
            {session && (
              <div className="flex flex-col text-xs sm:text-sm text-muted-foreground leading-tight max-w-[220px] truncate">
                <span className="font-semibold text-foreground truncate">{session.email}</span>
                <span className="uppercase tracking-wide text-[10px] text-muted-foreground/80">
                  Trader
                </span>
              </div>
            )}
            <Button
              variant={session ? "outline" : "ghost"}
              size="sm"
              className="gap-1 text-xs"
              onClick={handleSignOut}
              disabled={!session}
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{session ? "Sign out" : "Sign in"}</span>
            </Button>
            <ThemeToggle />
          </div>
        </div>

        <div className="md:hidden flex border-t">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location === item.path;
            return (
              <Link
                key={item.path}
                href={item.path}
                className={`flex-1 flex flex-col items-center gap-1 py-3 text-xs font-medium transition-colors ${
                  isActive ? 'text-primary' : 'text-muted-foreground'
                }`}
                data-testid={`nav-mobile-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
              >
                <Icon className="w-5 h-5" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
