const teachers = [
  { name: 'Sarah Mitchell', role: 'Ballet & Contemporary', bio: 'Trained at the Royal Academy of Dance with 15 years of teaching experience.' },
  { name: 'James Torres', role: 'Hip-Hop & Street Dance', bio: 'Professional dancer and choreographer with a passion for urban styles.' },
  { name: 'Lily Chen', role: 'Jazz & Musical Theatre', bio: 'West End performer turned teacher, bringing energy and technique to every class.' },
];

export default function AboutPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-16">
      <h1 className="text-3xl font-bold mb-4">About Us</h1>
      <p className="text-gray-600 mb-12 max-w-2xl">
        We are a community dance school dedicated to nurturing talent and a love of movement in students of all ages.
        Founded in 2005, we offer a welcoming environment where everyone can grow as a dancer.
      </p>

      <h2 className="text-2xl font-bold mb-6">Our Teachers</h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        {teachers.map((t) => (
          <div key={t.name} className="bg-white border rounded-xl p-5">
            <div className="w-14 h-14 rounded-full bg-purple-100 flex items-center justify-center text-purple-700 font-bold text-xl mb-3">
              {t.name[0]}
            </div>
            <h3 className="font-semibold text-gray-900">{t.name}</h3>
            <p className="text-sm text-purple-600 mb-2">{t.role}</p>
            <p className="text-sm text-gray-500">{t.bio}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
