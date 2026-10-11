export type ActiveView =
  | 'landing'
  | 'analyzer'
  | 'history'
  | 'health'
  | 'admin'
  | 'docs';

interface NavbarProps {
  activeView: ActiveView;
  onNavigate: (view: ActiveView) => void;
  userEmail: string | null;
  onOpenAuth: () => void;
  onSignOut: () => void;
}

/**
 * Strictly adheres to the 3-Zone Top Bar Contract:
 * Zone 1: Single text element wordmark
 * Zone 2: 4–5 concise single-line navigation links
 * Zone 3: 1 primary action button
 */
export function Navbar({
  activeView,
  onNavigate,
  userEmail,
  onOpenAuth,
  onSignOut,
}: NavbarProps) {
  const navItems: { id: ActiveView; label: string }[] = [
    { id: 'analyzer', label: 'Analyzer' },
    { id: 'history', label: 'History' },
    { id: 'admin', label: 'Analytics' },
    { id: 'health', label: 'System Status' },
    { id: 'docs', label: 'API Docs' },
  ];

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between gap-8 px-6 py-4 bg-white/95 dark:bg-slate-950/95 backdrop-blur border-b border-slate-200 dark:border-slate-800/90">
      {/* Zone 1: Brand Wordmark (single text element) */}
      <a
        href="#top"
        onClick={(e) => {
          e.preventDefault();
          onNavigate('landing');
        }}
        className="font-display text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-sky-500"
      >
        TruthLens AI
      </a>

      {/* Zone 2: 5 concise single-line navigation links */}
      <nav
        aria-label="Primary navigation"
        className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600 dark:text-slate-400"
      >
        {navItems.map((item) => {
          const isActive = activeView === item.id;
          return (
            <a
              key={item.id}
              href={`#${item.id}`}
              onClick={(e) => {
                e.preventDefault();
                onNavigate(item.id);
              }}
              className={`whitespace-nowrap shrink-0 transition-colors py-0.5 ${
                isActive
                  ? 'text-slate-900 dark:text-white underline decoration-sky-500 decoration-2 underline-offset-8'
                  : 'hover:text-slate-900 dark:hover:text-slate-200 hover:underline hover:underline-offset-8'
              }`}
            >
              {item.label}
            </a>
          );
        })}
      </nav>

      {/* Zone 3: 1 primary action */}
      <div className="flex items-center shrink-0">
        {userEmail ? (
          <button
            type="button"
            onClick={onSignOut}
            className="px-4 py-2 text-xs font-semibold text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Sign Out ({userEmail.split('@')[0]})
          </button>
        ) : (
          <button
            type="button"
            onClick={onOpenAuth}
            className="px-4 py-2 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-500 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-sky-400"
          >
            Sign In
          </button>
        )}
      </div>
    </header>
  );
}
