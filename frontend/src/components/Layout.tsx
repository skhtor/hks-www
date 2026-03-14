import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  const navLinks = [
    { to: '/', label: 'Home' },
    { to: '/timetable', label: 'Timetable' },
    { to: '/pricing', label: 'Pricing' },
    { to: '/about', label: 'About' },
    { to: '/contact', label: 'Contact' },
  ];

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const dashboardPath =
    user?.role === 'ADMIN'
      ? '/admin/dashboard'
      : user?.role === 'TEACHER'
      ? '/teacher/dashboard'
      : '/dashboard';

  return (
    <div className="min-h-screen flex flex-col">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:bg-purple-700 focus:text-white focus:rounded focus:outline-none"
      >
        Skip to main content
      </a>

      <nav className="bg-white shadow-sm" role="navigation" aria-label="Main navigation">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link
            to="/"
            className="text-xl font-bold text-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 rounded"
            aria-label="Dance School - Home"
          >
            Dance School
          </Link>

          {/* Desktop nav */}
          <div className="hidden sm:flex items-center gap-6 text-sm font-medium text-gray-600">
            {navLinks.map(({ to, label }) => (
              <Link
                key={to}
                to={to}
                aria-current={location.pathname === to ? 'page' : undefined}
                className="hover:text-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 rounded px-1"
              >
                {label}
              </Link>
            ))}
            {user ? (
              <>
                {user.role !== 'ADMIN' && (
                  <Link
                    to={dashboardPath}
                    className="hover:text-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 rounded px-1"
                  >
                    Dashboard
                  </Link>
                )}
                {user.role === 'ADMIN' && (
                  <Link
                    to="/admin/dashboard"
                    className="hover:text-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 rounded px-1"
                  >
                    Administration
                  </Link>
                )}
                <button
                  onClick={handleLogout}
                  className="bg-purple-600 text-white px-3 py-1.5 rounded-md hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2"
                >
                  Logout
                </button>
              </>
            ) : (
              <>
                <Link
                  to="/login"
                  className="hover:text-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 rounded px-1"
                >
                  Login
                </Link>
                <Link
                  to="/register"
                  className="bg-purple-600 text-white px-3 py-1.5 rounded-md hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2"
                >
                  Register
                </Link>
              </>
            )}
          </div>

          {/* Mobile hamburger */}
          <button
            className="sm:hidden p-2 rounded-md text-gray-600 hover:text-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500"
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            aria-label="Toggle navigation menu"
            onClick={() => setMenuOpen((o) => !o)}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              {menuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>

        {/* Mobile menu */}
        {menuOpen && (
          <div id="mobile-menu" className="sm:hidden border-t border-gray-100 px-4 py-2">
            {navLinks.map(({ to, label }) => (
              <Link
                key={to}
                to={to}
                aria-current={location.pathname === to ? 'page' : undefined}
                className="block py-2 text-sm font-medium text-gray-600 hover:text-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 rounded"
                onClick={() => setMenuOpen(false)}
              >
                {label}
              </Link>
            ))}
            {user ? (
              <>
                {user.role !== 'ADMIN' && (
                  <Link
                    to={dashboardPath}
                    className="block py-2 text-sm font-medium text-gray-600 hover:text-purple-700"
                    onClick={() => setMenuOpen(false)}
                  >
                    Dashboard
                  </Link>
                )}
                {user.role === 'ADMIN' && (
                  <Link
                    to="/admin/dashboard"
                    className="block py-2 text-sm font-medium text-gray-600 hover:text-purple-700"
                    onClick={() => setMenuOpen(false)}
                  >
                    Administration
                  </Link>
                )}
                <button
                  onClick={() => { setMenuOpen(false); handleLogout(); }}
                  className="block w-full text-left py-2 text-sm font-medium text-gray-600 hover:text-purple-700"
                >
                  Logout
                </button>
              </>
            ) : (
              <>
                <Link
                  to="/login"
                  className="block py-2 text-sm font-medium text-gray-600 hover:text-purple-700"
                  onClick={() => setMenuOpen(false)}
                >
                  Login
                </Link>
                <Link
                  to="/register"
                  className="block py-2 text-sm font-medium text-gray-600 hover:text-purple-700"
                  onClick={() => setMenuOpen(false)}
                >
                  Register
                </Link>
              </>
            )}
          </div>
        )}
      </nav>

      <main id="main-content" className="flex-1" tabIndex={-1}>
        <Outlet />
      </main>

      <footer className="bg-gray-800 text-gray-300 text-sm text-center py-4" role="contentinfo">
        © {new Date().getFullYear()} Dance School. All rights reserved.
      </footer>
    </div>
  );
}
