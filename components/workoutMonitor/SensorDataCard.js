export default function SensorDataCard({ title, data }) {
  const colors = {
    X: 'text-blue-400',
    Y: 'text-green-400',
    Z: 'text-purple-400',
    Mag: 'text-yellow-400'
  };

  return (
    <div className="rounded-xl bg-white/5 p-4 border border-white/10">
      <h3 className="text-xs font-semibold text-white/70 mb-2">{title}</h3>
      <div className="space-y-1 text-sm">
        {Object.entries(data).map(([key, value]) => (
          <div key={key}>
            {key}: <span className={`font-bold ${colors[key] || 'text-white'}`}>
              {typeof value === 'number' ? value.toFixed(2) : value}
            </span> {typeof value === 'number' && (key === 'Mag' || key === 'X' || key === 'Y' || key === 'Z') ? 'm/s²' : ''}
          </div>
        ))}
      </div>
    </div>
  );
}
