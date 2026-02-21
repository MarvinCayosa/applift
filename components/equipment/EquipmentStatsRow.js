/**
 * Stats row with:
 * - Blue rounded box for Total Sessions
 * - Dark rectangle with divider for Load Lifted + Avg Per Session
 */
export default function EquipmentStatsRow({ stats, primaryColor }) {
  // Format avgSessionMin to m:ss
  const formatTime = (totalMin) => {
    const mins = Math.floor(totalMin)
    const secs = Math.round((totalMin - mins) * 60)
    return { mins, secs }
  }
  const time = formatTime(stats.avgSessionMin)

  return (
    <div className="flex gap-2">
      {/* Total Sessions - primary color box */}
      <div
        className="rounded-2xl py-6 px-4 text-center flex flex-col justify-center"
        style={{ backgroundColor: primaryColor, minWidth: '90px' }}
      >
        <p className="text-4xl font-bold text-white leading-none">{stats.totalSessions}</p>
        <p className="text-[10px] text-white/70 mt-1">Total Sessions</p>
      </div>

      {/* Load Lifted + Avg Per Session - single dark container with divider */}
      <div
        className="flex-1 rounded-2xl flex overflow-hidden backdrop-blur-md"
        style={{ backgroundColor: 'rgba(0,0,0,0.3)' }}
      >
        {/* Load Lifted */}
        <div className="flex-1 py-6 px-6 text-center">
          <p className="font-bold text-white leading-none">
            <span className="text-4xl">{stats.totalLoad}</span>
            <span className="text-xs font-medium text-white/50 ml-0.5">kg</span>
          </p>
          <p className="text-[10px] text-white/50 mt-1">Load Lifted</p>
        </div>

        {/* Divider */}
        <div className="w-px bg-white/10 my-3" />

        {/* Avg Per Session */}
        <div className="flex-1 py-6 px-6 text-center">
          <p className="font-bold text-white leading-none">
            <span className="text-4xl">{time.mins}</span>
            <span className="text-xs font-medium text-white/50 ml-0.5">min</span>
          </p>
          <p className="text-[10px] text-white/50 mt-1">Avg Per Session</p>
        </div>
      </div>
    </div>
  )
}
