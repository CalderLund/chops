import { useState } from 'react';
import { Routes, Route, NavLink, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getStreakInfo } from './api/client';
import PracticePage from './pages/PracticePage';
import ProgressPage from './pages/ProgressPage';
import SettingsPage from './pages/SettingsPage';
import { ThemeProvider } from './components/ThemeProvider';

const navLinks = [
  { to: '/', label: 'Practice', end: true },
  { to: '/progress', label: 'Progress', end: false },
];

function StreakBadge() {
  const { data: streak } = useQuery({
    queryKey: ['streak'],
    queryFn: getStreakInfo,
    staleTime: 60000,
    refetchOnWindowFocus: false,
  });

  if (!streak || streak.currentStreak === 0) return null;

  return (
    <div
      className="flex items-center gap-1.5 px-3 py-1 rounded-full"
      style={{
        backgroundColor: 'color-mix(in srgb, var(--accent-primary) 15%, transparent)',
        border: '1px solid color-mix(in srgb, var(--accent-primary) 30%, transparent)',
      }}
    >
      <span className="font-bold" style={{ color: 'var(--accent-primary)' }}>*</span>
      <span className="text-sm font-semibold" style={{ color: 'var(--accent-primary)' }}>{streak.currentStreak}d</span>
      {streak.streakFreezes > 0 && (
        <span
          className="text-xs ml-1"
          style={{ color: 'var(--status-expanded-border)' }}
          title={`${streak.streakFreezes} streak freeze${streak.streakFreezes > 1 ? 's' : ''}`}
        >
          +{streak.streakFreezes}
        </span>
      )}
    </div>
  );
}

function GearIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.004.828c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
      />
    </svg>
  );
}

function App() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();
  const isSettingsActive = location.pathname === '/settings';

  return (
    <ThemeProvider>
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-deep)' }}>
      {/* Header */}
      <header
        className="backdrop-blur-sm sticky top-0 z-50"
        style={{
          backgroundColor: 'color-mix(in srgb, var(--bg-surface) 80%, transparent)',
          backgroundImage: 'var(--header-gradient)',
          borderBottom: '1px solid var(--border)',
          boxShadow: '0 1px 0 var(--header-border-accent)',
        }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold" style={{ color: 'var(--accent-primary)' }}>#</span>
              <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Chops</h1>
            </div>

            {/* Desktop navigation - centered */}
            <nav className="hidden md:flex gap-1">
              {navLinks.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  end={link.end}
                  className="px-5 py-2 rounded-lg text-sm font-medium transition-colors"
                  style={({ isActive }) =>
                    isActive
                      ? { backgroundColor: 'var(--accent-primary)', color: 'var(--bg-deep)' }
                      : { color: 'var(--text-secondary)' }
                  }
                >
                  {link.label}
                </NavLink>
              ))}
            </nav>

            {/* Right side: streak + settings */}
            <div className="hidden md:flex items-center gap-3">
              <StreakBadge />
              <NavLink
                to="/settings"
                className="p-2 rounded-lg transition-colors"
                style={{
                  color: isSettingsActive ? 'var(--text-primary)' : 'var(--text-muted)',
                  backgroundColor: isSettingsActive ? 'var(--bg-elevated)' : 'transparent',
                }}
              >
                <GearIcon />
              </NavLink>
            </div>

            {/* Mobile: streak + menu button */}
            <div className="flex md:hidden items-center gap-2">
              <StreakBadge />
              <button
                className="p-2 rounded-lg transition-colors"
                style={{ color: 'var(--text-secondary)' }}
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                aria-label="Toggle menu"
              >
                {mobileMenuOpen ? (
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                ) : (
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 6h16M4 12h16M4 18h16"
                    />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile navigation dropdown */}
        {mobileMenuOpen && (
          <nav
            className="md:hidden backdrop-blur-sm"
            style={{
              backgroundColor: 'color-mix(in srgb, var(--bg-surface) 95%, transparent)',
              borderTop: '1px solid var(--border)',
            }}
          >
            <div className="px-4 py-2 space-y-1">
              {navLinks.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  end={link.end}
                  onClick={() => setMobileMenuOpen(false)}
                  className="block px-4 py-3 rounded-lg text-sm font-medium transition-colors"
                  style={({ isActive }) =>
                    isActive
                      ? { backgroundColor: 'var(--accent-primary)', color: 'var(--bg-deep)' }
                      : { color: 'var(--text-secondary)' }
                  }
                >
                  {link.label}
                </NavLink>
              ))}
              <NavLink
                to="/settings"
                onClick={() => setMobileMenuOpen(false)}
                className="block px-4 py-3 rounded-lg text-sm font-medium transition-colors"
                style={({ isActive }) =>
                  isActive
                    ? { backgroundColor: 'var(--accent-primary)', color: 'var(--bg-deep)' }
                    : { color: 'var(--text-secondary)' }
                }
              >
                Settings
              </NavLink>
            </div>
          </nav>
        )}
      </header>

      {/* Main content */}
      <main>
        <Routes>
          <Route path="/" element={<PracticePage />} />
          <Route
            path="/progress"
            element={
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                <ProgressPage />
              </div>
            }
          />
          <Route
            path="/settings"
            element={
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                <SettingsPage />
              </div>
            }
          />
        </Routes>
      </main>
    </div>
    </ThemeProvider>
  );
}

export default App;
