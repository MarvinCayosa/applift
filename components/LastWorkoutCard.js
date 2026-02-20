import { useRouter } from 'next/router';

export default function LastWorkoutCard({ equipment, equipmentColor }) {
  const router = useRouter();

  return (
    <div
      onClick={() => router.push('/statistics')}
      className="rounded-2xl px-5 py-4 flex items-center justify-between cursor-pointer hover:scale-[1.02] transition-all"
      style={{
        backgroundColor: 'rgba(60, 60, 60, 0.8)',
      }}
    >
      <div>
        <p className="text-xs text-white/40 mb-1">Last {equipment} Workout</p>
        <p className="text-lg font-bold text-white mb-1">Load Lifted</p>
        <p className="text-xs text-white/40 mt-1">3 Sets | 12 to 15 Reps</p>
      </div>
      <div className="flex items-center gap-3">
        <p className="text-2xl font-bold text-white">
          55<span className="text-sm text-white/70 ml-1">kg</span>
        </p>
        <svg 
          className="w-4 h-4 opacity-60" 
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 18l6-6-6-6" />
        </svg>
      </div>
    </div>
  );
}
