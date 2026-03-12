const plans = [
  {
    name: 'Casual',
    price: '$25',
    per: 'per class',
    features: ['Drop-in any class', 'No commitment', 'Subject to availability'],
  },
  {
    name: 'Term',
    price: '$180',
    per: 'per term',
    features: ['One class per week', 'Priority enrolment', 'Discounted rate'],
    highlight: true,
  },
  {
    name: 'Unlimited',
    price: '$320',
    per: 'per term',
    features: ['Unlimited classes', 'Priority enrolment', 'Best value'],
  },
];

export default function PricingPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-16">
      <h1 className="text-3xl font-bold text-center mb-4">Pricing</h1>
      <p className="text-center text-gray-500 mb-12">Flexible options to suit every dancer.</p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        {plans.map((plan) => (
          <div
            key={plan.name}
            className={`rounded-2xl p-6 border ${plan.highlight ? 'border-purple-500 bg-purple-50' : 'border-gray-200 bg-white'}`}
          >
            <h2 className="text-xl font-bold mb-1">{plan.name}</h2>
            <p className="text-3xl font-extrabold text-purple-700 mb-1">{plan.price}</p>
            <p className="text-sm text-gray-400 mb-4">{plan.per}</p>
            <ul className="space-y-2 text-sm text-gray-600">
              {plan.features.map((f) => (
                <li key={f} className="flex items-center gap-2">
                  <span className="text-purple-500">✓</span> {f}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <p className="text-center text-sm text-gray-400 mt-10">
        Family discounts available. Contact us for details.
      </p>
    </div>
  );
}
