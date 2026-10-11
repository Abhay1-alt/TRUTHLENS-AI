import {
  Activity,
  BarChart3,
  BookOpen,
  Clock,
  FileSearch,
  Home,
  ShieldAlert,
} from 'lucide-react';
import { ActiveView } from './Navbar.tsx';
import { ThemeToggle } from './ThemeToggle.tsx';

interface SidebarProps {
  activeView: ActiveView;
  onNavigate: (view: ActiveView) => void;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  totalAnalysesCount: number;
  userEmail: string | null;
}

export function Sidebar({
  activeView,
  onNavigate,
  theme,
  onToggleTheme,
  totalAnalysesCount,
  userEmail,
}: SidebarProps) {
  const links: {
    id: ActiveView;
    label: string;
    icon: typeof FileSearch;
    count?: number;
  }[] = [
    { id: 'landing', label: 'Overview', icon: Home },
    { id: 'analyzer', label: 'Content Analyzer', icon: FileSearch },
    { id: 'history', label: 'Analysis History', icon: Clock, count: totalAnalysesCount },
    { id: 'admin', label: 'Observability & Metrics', icon: BarChart3 },
    { id: 'health', label: 'System Health', icon: Activity },
    { id: 'docs', label: 'API Reference', icon: BookOpen },
  ];

  return (
    <aside
      aria-label="Workspace sidebar"
      className="w-full lg:w-64 shrink-0 border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-slate-800/90 bg-slate-50/60 dark:bg-slate-950/60 flex flex-col justify-between p-4 lg:min-h-[calc(100vh-65px)]"
    >
      <div className="space-y-6">
        <div className="px-2 pt-1 flex items-center justify-between lg:block">
          <div>
            <p className="text-xs font-semibold text-slate-900 dark:text-slate-200">
              Forensic Workspace
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
              {userEmail ? `Signed in · ${userEmail}` : 'Guest Session · Rate Limited'}
            </p>
          </div>
          <div className="lg:hidden">
            <ThemeToggle theme={theme} onToggle={onToggleTheme} />
          </div>
        </div>

        <nav className="flex lg:flex-col gap-1 overflow-x-auto pb-1 lg:pb-0">
          {links.map((item) => {
            const Icon = item.icon;
            const active = activeView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                className={`flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  active
                    ? 'bg-sky-600 text-white'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/70 dark:hover:bg-slate-900 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </span>
                {typeof item.count === 'number' && (
                  <span
                    className={`font-mono text-xs tabular-nums ${
                      active ? 'text-sky-100' : 'text-slate-400 dark:text-slate-500'
                    }`}
                  >
                    {item.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="hidden lg:flex flex-col gap-4 pt-6 border-t border-slate-200 dark:border-slate-800/80">
        <div className="px-2 space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300">
            <ShieldAlert className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <span>Responsible AI Notice</span>
          </div>
          <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
            Assessments are probabilistic indicators, never absolute forensic proof. Always verify primary sources.
          </p>
        </div>

        <div className="px-2 flex items-center justify-between">
          <span className="text-xs text-slate-500 dark:text-slate-400">Appearance</span>
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
        </div>
      </div>
    </aside>
  );
}
