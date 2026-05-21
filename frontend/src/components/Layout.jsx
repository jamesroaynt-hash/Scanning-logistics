/**
 * Layout — persistent sidebar nav + topbar with theme toggle.
 * Collapses to a bottom bar on mobile for warehouse tablet use.
 */
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useTheme } from '../context/ThemeContext.jsx';

const NAV = [
  { to: '/scan', label: 'Scan', icon: '◎' },
  { to: '/dashboard', label: 'Dashboard', icon: '▦' },
  { to: '/search', label: 'Search', icon: '⌕' },
  { to: '/scanned', label: 'Scanned', icon: '☑' },
  { to: '/history', label: 'History', icon: '⟲' },
  { to: '/inventory', label: 'Inventory', icon: '▣' },
];

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      {/* Sidebar */}
      <aside className="hidden md:flex md:flex-col w-60 border-r border-ink-700 bg-ink-900/60 backdrop-blur">
        <div className="px-6 py-6 border-b border-ink-700">
          <div className="flex items-center gap-2">
            <span className="text-accent text-2xl font-display font-bold">
              ◳
            </span>
            <div>
              <h1 className="font-display font-bold text-lg leading-none">
                ParcelScan
              </h1>
              <p className="text-[10px] uppercase tracking-widest text-slate-500 mt-1">
                Logistics OS
              </p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-lg font-display text-sm transition ${
                  isActive
                    ? 'bg-accent text-ink-950 font-semibold'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-ink-700'
                }`
              }
            >
              <span className="text-lg">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="p-3 border-t border-ink-700">
          <div className="px-4 py-2 mb-2">
            <p className="text-sm font-medium">{user?.username}</p>
            <p className="text-[10px] uppercase tracking-wide text-accent">
              {user?.role}
            </p>
          </div>
          <button onClick={handleLogout} className="btn-ghost w-full">
            Sign out
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="flex items-center justify-between px-5 py-3 border-b border-ink-700 bg-ink-900/40 backdrop-blur sticky top-0 z-10">
          <p className="text-xs text-slate-500 font-mono">
            {new Date().toLocaleDateString(undefined, {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
            })}
          </p>
          <button
            onClick={toggle}
            className="btn-ghost !px-3 !py-2"
            title="Toggle theme"
          >
            {theme === 'dark' ? '☀ Light' : '☾ Dark'}
          </button>
        </header>

        <main className="flex-1 p-4 md:p-6 overflow-auto">{children}</main>

        {/* Mobile bottom nav */}
        <nav className="md:hidden flex border-t border-ink-700 bg-ink-900">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex-1 flex flex-col items-center gap-0.5 py-2.5 text-xs ${
                  isActive ? 'text-accent' : 'text-slate-500'
                }`
              }
            >
              <span className="text-lg">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}
