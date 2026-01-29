export default function StatCard({ title, value, unit, color = 'white' }) {
  return (
    <div className="rounded-xl bg-white/5 p-4">
      <h3 className="text-xs font-semibold text-white/70 mb-2">{title}</h3>
      <div className="flex items-baseline gap-1">
        <span className={`text-2xl font-bold text-${color}-400`}>{value}</span>
        {unit && <span className="text-sm text-white/50">{unit}</span>}
      </div>
    </div>
  );
}
