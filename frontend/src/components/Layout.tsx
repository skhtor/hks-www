import { Link, Outlet } from 'react-router-dom';

export default function Layout() {
  return (
    <div className="min-h-screen flex flex-col">
      <nav className="bg-white shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/" className="text-xl font-bold text-purple-700">Dance School</Link>
          <div className="flex gap-6 text-sm font-medium text-gray-600">
            <Link to="/" className="hover:text-purple-700">Home</Link>
            <Link to="/timetable" className="hover:text-purple-700">Timetable</Link>
            <Link to="/pricing" className="hover:text-purple-700">Pricing</Link>
            <Link to="/about" className="hover:text-purple-700">About</Link>
            <Link to="/contact" className="hover:text-purple-700">Contact</Link>
          </div>
        </div>
      </nav>
      <main className="flex-1">
        <Outlet />
      </main>
      <footer className="bg-gray-800 text-gray-300 text-sm text-center py-4">
        © {new Date().getFullYear()} Dance School. All rights reserved.
      </footer>
    </div>
  );
}
