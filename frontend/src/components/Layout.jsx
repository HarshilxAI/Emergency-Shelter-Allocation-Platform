import { useState } from 'react';
import { Link, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

/** Shield mark -- official ESAP hand-house-hand symbol from Favicon.png */
function Mark({ size = 36 }) {
  return (
    <img
      src="/favicon.png"
      alt="ESAP"
      width={size}
      height={size}
      style={{
        objectFit: 'contain',
        display: 'inline-block',
        verticalAlign: 'middle',
        borderRadius: 0,
        flexShrink: 0
      }}
      className="nav__mark"
    />
  );
}

/** "Light" / "Dark" toggle shown on every locked screen. */
export function ThemeToggle({ className = '' }) {
  const { theme, toggle } = useTheme();
  return (
    <button
      type="button"
      className={`theme-toggle ${className}`.trim()}
      onClick={toggle}
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
    >
      {theme === 'dark' ? '\u2600 Light' : '\u263E Dark'}
    </button>
  );
}

const ADMIN_NAV = [
  { to: '/admin', label: 'Dashboard', end: true },
  { to: '/admin/shelters', label: 'Shelters' },
  { to: '/admin/requests', label: 'Requests' },
  { to: '/admin/allocations', label: 'Allocations' },
  { to: '/admin/history', label: 'History' }
];

export function Navbar() {
  const { user, isAuthenticated, isAdmin, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const close = () => setOpen(false);

  const inAdminArea = location.pathname.startsWith('/admin');
  const isAuthPage = location.pathname === '/login' || location.pathname === '/register';

  const handleSignOut = () => {
    signOut();
    close();
    navigate('/');
  };

  return (
    <header className="nav">
      <div className="shell nav__inner">
        <Link to={isAuthenticated ? (isAdmin ? '/admin' : '/dashboard') : '/'} className="nav__brand" onClick={close}>
          <Mark />
          <span>Shelter Allocation</span>
        </Link>

        {isAuthPage ? (
          <div className="nav__auth-right" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <ThemeToggle />
            <Link to="/" className="btn btn-sm btn-secondary" onClick={close}>
              Back to home
            </Link>
          </div>
        ) : (
          <>
            <button
              type="button"
              className="nav__toggle"
              aria-expanded={open}
              aria-label={open ? 'Close menu' : 'Open menu'}
              onClick={() => setOpen((v) => !v)}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d={open ? 'M6 6l12 12M18 6L6 18' : 'M3 6h18M3 12h18M3 18h18'}
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </button>

            <nav className={`nav__center-links${open ? ' is-open' : ''}`}>
              {isAuthenticated ? (
                isAdmin && inAdminArea ? (
                  ADMIN_NAV.map((item) => (
                    <NavLink key={item.to} to={item.to} end={item.end} className="nav__link" onClick={close}>
                      {item.label}
                    </NavLink>
                  ))
                ) : (
                  <>
                    <NavLink to="/dashboard" className="nav__link" onClick={close}>Dashboard</NavLink>
                    <NavLink to="/request/new" className="nav__link" onClick={close}>Find shelter</NavLink>
                    <NavLink to="/shelters" className="nav__link" onClick={close}>Shelters</NavLink>
                    <NavLink to="/requests" className="nav__link" onClick={close}>My requests</NavLink>
                    {isAdmin && (
                      <NavLink to="/admin" className="nav__link" onClick={close}>Admin</NavLink>
                    )}
                  </>
                )
              ) : (
                <>
                  <a href="/#how-it-works" className="nav__link" onClick={close}>How it works</a>
                  <a href="/#scoring" className="nav__link" onClick={close}>Scoring</a>
                  <a href="/#about" className="nav__link" onClick={close}>About</a>
                </>
              )}
            </nav>

            <div className={`nav__right-group${open ? ' is-open' : ''}`}>
              {isAuthenticated ? (
                <>
                  <div className="nav__v-sep" />
                  <span className="nav__user-name">{isAdmin ? (user?.name && user.name.length <= 10 ? `${user.name} · Admin` : 'Admin') : user?.name}</span>
                  <ThemeToggle />
                  <button type="button" className="btn btn-sm btn-secondary" onClick={handleSignOut}>
                    Sign out
                  </button>
                </>
              ) : (
                <>
                  <ThemeToggle />
                  <NavLink to="/login" className="nav__link" onClick={close}>Log in</NavLink>
                  <Link to="/register" className="btn btn-sm btn-primary" onClick={close}>Create account</Link>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </header>
  );
}

export function DemoNotice() {
  return null;
}

export function Footer({ app = false }) {
  return (
    <footer className={`footer${app ? ' footer-app' : ''}`}>
      <div className="shell footer-row">
        <span>Emergency Shelter Allocation Platform</span>
        <span className="sep">&bull;</span>
        <span>Rights reserved with Team Deccan Chargers</span>
        <span className="sep">&bull;</span>
        <span>Maps &copy; OpenStreetMap contributors. Routing by OSRM.</span>
        <span className="sep">&bull;</span>
        <span>&copy; 2026</span>
      </div>
    </footer>
  );
}
