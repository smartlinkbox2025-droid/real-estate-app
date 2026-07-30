import { NavLink, useLocation, Outlet } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, Building2, Users, FileText, Wallet, Settings,
  Bell, Sun, Moon, WifiOff, Wifi, Download, RefreshCw,
  BarChart3, HomeIcon, Wrench, CheckSquare, CalendarDays, FolderOpen, Activity,
  Database, ChevronDown,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, ensureDefaults } from '../database/db';
import { AR } from '../constants/arabicTerms';
import { usePWA } from '../hooks/usePWA';
import { Button } from '../components/ui/button';
import { ensureContractNumbers, seedDemoData, refreshOverdueInvoices } from '../database/queries';

const NAV_MAIN = [
  { to: '/', label: AR.nav.dashboard, icon: LayoutDashboard, exact: true },
  { to: '/properties', label: AR.nav.properties, icon: Building2 },
  { to: '/customers', label: AR.nav.customers, icon: Users },
  { to: '/contracts', label: AR.nav.contracts, icon: FileText },
  { to: '/payments', label: AR.nav.payments, icon: Wallet },
  { to: '/maintenance', label: AR.nav.maintenance, icon: Wrench },
  { to: '/tasks', label: AR.nav.tasks, icon: CheckSquare },
  { to: '/calendar', label: AR.nav.calendar, icon: CalendarDays },
  { to: '/documents', label: AR.nav.documents, icon: FolderOpen },
  { to: '/activity', label: AR.nav.activityLog, icon: Activity },
];

const NAV_REPORTS = [
  { to: '/reports/financial', label: AR.nav.financialReport, icon: BarChart3 },
  { to: '/reports/vacancy', label: AR.nav.vacancyTracker, icon: HomeIcon },
];

const NAV_SYSTEM = [
  { to: '/backup', label: AR.nav.backup, icon: Database },
  { to: '/settings', label: AR.nav.settings, icon: Settings },
];

// Bottom nav (mobile) — 5 most important
const NAV_BOTTOM = NAV_MAIN.slice(0, 5);

function NavItem({ to, label, icon: Icon, exact, onClick }: { to: string; label: string; icon: any; exact?: boolean; onClick?: () => void }) {
  return (
    <NavLink
      to={to}
      end={exact}
      onClick={onClick}
      className={({ isActive }) =>
        `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all
         hover:bg-sidebar-accent hover:text-sidebar-accent-foreground
         ${isActive
           ? 'bg-sidebar-primary/20 text-sidebar-primary font-semibold'
           : 'text-sidebar-foreground/75 font-medium'
         }`
      }
    >
      <Icon className="h-4.5 w-4.5 shrink-0" />
      <span>{label}</span>
    </NavLink>
  );
}

type NavItem = { to: string; label: string; icon: any; exact?: boolean };
function NavGroup({ label, items }: { label: string; items: NavItem[] }) {
  const location = useLocation();
  const isAnyActive = items.some((i) => location.pathname.startsWith(i.to));
  const [open, setOpen] = useState(isAnyActive);

  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-3 py-1.5 text-xs font-semibold text-sidebar-foreground/40 uppercase tracking-widest hover:text-sidebar-foreground/60 transition-colors"
      >
        {label}
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="space-y-0.5 mt-1">
          {items.map((item) => (
            <NavItem key={item.to} {...item} />
          ))}
        </div>
      )}
    </div>
  );
}

function currentPageTitle(pathname: string): string {
  const all: Array<{ to: string; label: string; icon: any; exact?: boolean }> = [...NAV_MAIN, ...NAV_REPORTS, ...NAV_SYSTEM];
  const found = all.find((n) => (n.exact ? pathname === n.to : pathname.startsWith(n.to)));
  if (found) return found.label;
  return AR.app.title;
}

export default function MainLayout() {
  const location = useLocation();
  const { isOnline, canInstall, promptInstall, needRefresh, applyUpdate } = usePWA();
  const [themeDark, setThemeDark] = useState<boolean>(document.documentElement.classList.contains('dark'));
  const [mobileSidebar, setMobileSidebar] = useState(false);

  const notifCount = useLiveQuery(async () => {
    return await db.notifications.filter((n) => !n.isRead).count().catch(() => 0);
  }, []) ?? 0;

  // Initialize app
  useEffect(() => {
    // Set theme from storage
    const saved = localStorage.getItem('sre_theme');
    if (saved === 'dark') {
      document.documentElement.classList.add('dark');
      setThemeDark(true);
    }
    (async () => {
      await ensureDefaults();
      await seedDemoData();
      await ensureContractNumbers();
      await refreshOverdueInvoices();
    })();
  }, []);

  // Close mobile sidebar on route change
  useEffect(() => { setMobileSidebar(false); }, [location.pathname]);

  const toggleTheme = () => {
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('sre_theme', isDark ? 'dark' : 'light');
    setThemeDark(isDark);
    db.settings.update('singleton', { theme: isDark ? 'dark' : 'light' }).catch(() => {});
  };

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Brand */}
      <div className="flex items-center gap-3 mb-6 px-1">
        <div className="h-10 w-10 rounded-xl bg-sidebar-primary text-sidebar-primary-foreground grid place-items-center font-bold text-lg shrink-0">
          م
        </div>
        <div className="overflow-hidden">
          <h1 className="text-sm font-bold leading-tight text-sidebar-foreground truncate">{AR.app.title}</h1>
          <p className="text-[11px] text-sidebar-foreground/50 truncate">{AR.app.tagline}</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto space-y-4 pb-2">
        <div className="space-y-0.5">
          {NAV_MAIN.slice(0, 5).map((item) => (
            <NavItem key={item.to} {...item} />
          ))}
        </div>

        <NavGroup label="الإدارة" items={NAV_MAIN.slice(5)} />
        <NavGroup label="التقارير" items={NAV_REPORTS} />
        <NavGroup label="النظام" items={NAV_SYSTEM} />
      </nav>

      {/* Status */}
      <div className="mt-4 pt-4 border-t border-sidebar-border/40 space-y-1.5">
        <div className="flex items-center gap-2 px-2 text-xs text-sidebar-foreground/50">
          {isOnline
            ? <><Wifi className="h-3.5 w-3.5 text-green-400" /><span>{AR.online}</span></>
            : <><WifiOff className="h-3.5 w-3.5 text-amber-400" /><span>{AR.offline}</span></>
          }
        </div>
        <p className="px-2 text-[11px] text-sidebar-foreground/30">© {new Date().getFullYear()} {AR.app.shortTitle}</p>
      </div>
    </div>
  );

  return (
    <div className="app-shell w-full min-w-0 bg-background text-foreground">
      {/* Ambient blobs */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden -z-10">
        <div className="absolute -top-40 -right-40 h-96 w-96 rounded-full bg-accent/8 blur-3xl" />
        <div className="absolute bottom-0 -left-40 h-96 w-96 rounded-full bg-success/6 blur-3xl" />
      </div>

      {/* Mobile sidebar overlay */}
      <AnimatePresence>
        {mobileSidebar && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-background/60 backdrop-blur-sm lg:hidden"
              onClick={() => setMobileSidebar(false)}
            />
            <motion.aside
              initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="mobile-sidebar-safe fixed top-0 right-0 bottom-0 z-50 w-[min(18rem,calc(100vw-1rem))] bg-sidebar lg:hidden shadow-2xl"
            >
              <SidebarContent />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Desktop sidebar */}
      <aside
        className="hidden lg:flex fixed inset-y-0 right-0 w-64 flex-col p-4 z-30 bg-sidebar border-l border-sidebar-border"
        data-testid="main-sidebar"
      >
        <SidebarContent />
      </aside>

      {/* Main */}
      <main className="min-w-0 max-w-full flex-1 lg:mr-64 pb-[calc(6rem+env(safe-area-inset-bottom,0px))] lg:pb-8">
        {/* Top bar */}
        <header className="app-topbar sticky top-0 z-20 backdrop-blur-xl bg-background/80 border-b border-border/40 shadow-sm">
          <div className="flex items-center justify-between gap-3 px-4 lg:px-6 py-3">
            <div className="flex items-center gap-3">
              {/* Mobile menu button */}
              <button
                className="lg:hidden p-1.5 rounded-lg hover:bg-muted transition-colors"
                onClick={() => setMobileSidebar(true)}
                aria-label="القائمة"
              >
                <div className="w-5 space-y-1.5">
                  <span className="block h-0.5 bg-foreground rounded-full" />
                  <span className="block h-0.5 bg-foreground/70 rounded-full w-3/4" />
                  <span className="block h-0.5 bg-foreground rounded-full" />
                </div>
              </button>
              <div className="hidden lg:block">
                <h2 className="text-base font-bold">{currentPageTitle(location.pathname)}</h2>
              </div>
              <div className="lg:hidden flex items-center gap-2">
                <span className="font-bold text-sm">{AR.app.shortTitle}</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {canInstall && (
                <Button onClick={promptInstall} size="sm" variant="outline" className="rounded-full gap-1.5 h-8" data-testid="install-app-button">
                  <Download className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline text-xs">{AR.actions.installApp}</span>
                </Button>
              )}
              <Button onClick={toggleTheme} variant="outline" size="icon" className="rounded-full h-8 w-8" data-testid="theme-toggle-button" aria-label={AR.common.theme}>
                {themeDark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
              </Button>
              <div className="relative">
                <Button variant="outline" size="icon" className="rounded-full h-8 w-8" data-testid="notifications-button">
                  <Bell className="h-3.5 w-3.5" />
                </Button>
                {notifCount > 0 && (
                  <span className="absolute -top-1 -right-1 h-4 min-w-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] grid place-items-center num">
                    {notifCount}
                  </span>
                )}
              </div>
            </div>
          </div>
          {needRefresh && (
            <div className="bg-accent/10 border-t border-accent/30 px-4 py-2 flex items-center justify-between text-xs">
              <span>{AR.updated}</span>
              <Button size="sm" variant="ghost" onClick={applyUpdate} className="gap-1 h-7">
                <RefreshCw className="h-3.5 w-3.5" /> {AR.actions.apply}
              </Button>
            </div>
          )}
        </header>

        {/* Page content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            className="app-page-content pt-4 sm:pt-5 pb-8 lg:px-6"
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Bottom nav (mobile) */}
      <nav
        className="mobile-bottom-nav-safe lg:hidden fixed bottom-0 inset-x-0 z-30 border-t border-border/40 bg-background/90 backdrop-blur-xl"
        data-testid="mobile-bottom-nav"
      >
        <div className="grid grid-cols-5">
          {NAV_BOTTOM.map((item) => {
            const Icon = item.icon;
            const active = item.exact ? location.pathname === item.to : location.pathname.startsWith(item.to);
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.exact}
                className={`flex flex-col items-center justify-center gap-0.5 py-2.5 text-[10px] transition-colors ${
                  active ? 'text-accent font-semibold' : 'text-muted-foreground'
                }`}
              >
                <Icon className={`h-5 w-5 ${active ? 'text-accent' : ''}`} />
                <span className="font-medium leading-tight">{item.label}</span>
              </NavLink>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
