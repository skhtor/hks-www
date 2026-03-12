import { Link } from 'react-router-dom';

export default function HomePage() {
  return (
    <div>
      {/* Hero */}
      <section className="bg-purple-700 text-white py-24 px-4 text-center">
        <h1 className="text-4xl font-bold mb-4">Welcome to Dance School</h1>
        <p className="text-lg mb-8 text-purple-100">
          Discover the joy of dance. Classes for all ages and skill levels.
        </p>
        <Link
          to="/timetable"
          className="bg-white text-purple-700 font-semibold px-6 py-3 rounded-lg hover:bg-purple-50 transition"
        >
          View Timetable
        </Link>
      </section>

      {/* Quick links */}
      <section className="max-w-4xl mx-auto py-16 px-4 grid grid-cols-1 sm:grid-cols-3 gap-8 text-center">
        <div className="p-6 bg-white rounded-xl shadow-sm">
          <h2 className="text-lg font-semibold mb-2">Classes</h2>
          <p className="text-gray-500 text-sm mb-4">Ballet, jazz, hip-hop and more.</p>
          <Link to="/timetable" className="text-purple-600 text-sm font-medium hover:underline">See schedule →</Link>
        </div>
        <div className="p-6 bg-white rounded-xl shadow-sm">
          <h2 className="text-lg font-semibold mb-2">Pricing</h2>
          <p className="text-gray-500 text-sm mb-4">Flexible plans for every budget.</p>
          <Link to="/pricing" className="text-purple-600 text-sm font-medium hover:underline">View pricing →</Link>
        </div>
        <div className="p-6 bg-white rounded-xl shadow-sm">
          <h2 className="text-lg font-semibold mb-2">Get in Touch</h2>
          <p className="text-gray-500 text-sm mb-4">Questions? We'd love to hear from you.</p>
          <Link to="/contact" className="text-purple-600 text-sm font-medium hover:underline">Contact us →</Link>
        </div>
      </section>
    </div>
  );
}
