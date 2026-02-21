import Head from 'next/head'
import { useRouter } from 'next/router'
import { useMemo } from 'react'
import BottomNav from '../../../../components/BottomNav'
import { equipmentConfig } from '../../../../components/equipment'
import useEquipmentData from '../../../../components/equipment/useEquipmentData'

/**
 * Exercise detail page – shows all past workout sessions for a
 * specific exercise within an equipment type.
 *
 * Route: /equipment/[type]/[exercise]
 * e.g.  /equipment/dumbbell/concentration-curls
 */
export default function ExerciseDetailPage() {
  const router = useRouter()
  const { type, exercise: exerciseSlug } = router.query
  const slug = typeof type === 'string' ? type : ''

  const config = equipmentConfig[slug]
  const { exerciseLogs, loading } = useEquipmentData(slug)

  // Find the exercise config entry
  const exerciseCfg = config?.exercises.find((e) => e.key === exerciseSlug)

  // Get logs for this exercise, sorted newest‑first
  const sessions = useMemo(() => {
    if (!exerciseCfg) return []
    const raw = exerciseLogs[exerciseCfg.key] || []
    return [...raw].sort((a, b) => {
      const da = a.timestamps?.started?.toDate?.() || new Date(0)
      const db = b.timestamps?.started?.toDate?.() || new Date(0)
      return db - da
    })
  }, [exerciseLogs, exerciseCfg])

  // Guard
  if (!config || !exerciseCfg) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <p className="text-white/50">Exercise not found</p>
      </div>
    )
  }

  const primary = config.primary
  const bgColor = exerciseCfg.variant === 'primary' ? primary : config.primaryDark

  const formatDuration = (ms, sec) => {
    const totalSec = ms ? Math.round(ms / 1000) : sec || 0
    const m = Math.floor(totalSec / 60)
    const s = totalSec % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  // Computed stats
  const totalReps = sessions.reduce((s, l) => s + (l.results?.totalReps || l.results?.completedReps || 0), 0)
  const totalLoad = sessions.reduce((s, l) => {
    const r = l.results?.totalReps || l.results?.completedReps || 0
    const w = l.planned?.weight || l.exercise?.weight || 0
    return s + r * w
  }, 0)

  // Navigate to session summary
  const handleSessionClick = (log) => {
    const logId = log.id
    if (!logId) return

    router.push({
      pathname: `/equipment/${slug}/${exerciseSlug}/session`,
      query: {
        logId,
        eq: log._equipment || '',
        ex: log._exercise || '',
      }
    })
  }

  return (
    <>
      <Head>
        <title>{exerciseCfg.name} | {config.label} | AppLift</title>
      </Head>

      <div className="min-h-screen bg-black text-white pb-28" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        {/* Hero with exercise image */}
        <div className="relative w-full h-56 overflow-hidden">
          <img
            src={exerciseCfg.image}
            alt={exerciseCfg.name}
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/30 to-black" />

          {/* Top row: back button + title aligned */}
          <div className="absolute top-4 left-4 right-4 flex items-center z-10">
            <button
              onClick={() => router.back()}
              className="p-2"
            >
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div className="flex-1 text-center pr-9">
              <h1 className="text-xl font-bold text-white">{exerciseCfg.name}</h1>
              <p className="text-xs text-white/60">{config.label}</p>
            </div>
          </div>
        </div>

        {/* Content - overlaps hero */}
        <div className="px-4 space-y-6 relative z-10" style={{ marginTop: '-120px' }}>
          {/* Stats row - same layout as equipment page */}
          <div className="flex gap-2 content-fade-up-1">
            {/* Sessions - primary color box */}
            <div
              className="rounded-2xl py-6 px-6 text-center flex flex-col justify-center"
              style={{ backgroundColor: bgColor, minWidth: '90px' }}
            >
              <p className="text-4xl font-bold text-white leading-none">{sessions.length}</p>
              <p className="text-[10px] text-white/70 mt-1">Sessions</p>
            </div>

            {/* Total Reps + Total Load - dark container with divider */}
            <div
              className="flex-1 rounded-2xl flex overflow-hidden backdrop-blur-md"
              style={{ backgroundColor: 'rgba(0,0,0,0.3)' }}
            >
              <div className="flex-1 py-6 px-6 text-center">
                <p className="font-bold text-white leading-none">
                  <span className="text-4xl">{totalReps}</span>
                </p>
                <p className="text-[10px] text-white/50 mt-1">Total Reps</p>
              </div>
              <div className="w-px bg-white/10 my-3" />
              <div className="flex-1 py-6 px-6 text-center">
                <p className="font-bold text-white leading-none">
                  <span className="text-4xl">{totalLoad}</span>
                  <span className="text-xs font-medium text-white/50 ml-0.5">kg</span>
                </p>
                <p className="text-[10px] text-white/50 mt-1">Total Load</p>
              </div>
            </div>
          </div>

          {/* Session list */}
          <section className="content-fade-up-2">
            <h2 className="text-lg font-bold text-white mb-3">Workout History</h2>

            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="bg-white/[0.05] rounded-2xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="h-4 w-28 bg-white/10 rounded animate-pulse" />
                      <div className="h-5 w-12 bg-white/10 rounded-full animate-pulse" />
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      {[1, 2, 3, 4].map((j) => (
                        <div key={j} className="text-center space-y-1">
                          <div className="h-6 w-8 bg-white/10 rounded animate-pulse mx-auto" />
                          <div className="h-3 w-10 bg-white/10 rounded animate-pulse mx-auto" />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : sessions.length === 0 ? (
              <div className="bg-white/[0.05] rounded-2xl p-8 text-center">
                <p className="text-white/40 text-sm">No sessions recorded yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {sessions.map((log, idx) => {
                  const date = log.timestamps?.started?.toDate?.()
                    || log.timestamps?.created?.toDate?.()
                    || (log.startTime ? new Date(log.startTime) : new Date())
                  const sets = log.results?.totalSets || log.results?.completedSets || 0
                  const reps = log.results?.totalReps || log.results?.completedReps || 0
                  const weight = log.planned?.weight || log.exercise?.weight || 0
                  const durMs = log.results?.durationMs || 0
                  const durSec = log.results?.totalTime || 0
                  const calories = log.results?.calories || 0
                  const avgConc = log.results?.avgConcentric || 0
                  const avgEcc = log.results?.avgEccentric || 0

                  return (
                    <div
                      key={log.id || idx}
                      onClick={() => handleSessionClick(log)}
                      className="bg-white/[0.05] rounded-2xl p-4 space-y-3 cursor-pointer active:scale-[0.98] transition-transform"
                    >
                      {/* Header row */}
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-white">
                          {date.toLocaleDateString('en-US', {
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric',
                          })}
                        </p>
                        <div className="flex items-center gap-2">
                          <span
                            className="text-[10px] font-medium px-2.5 py-0.5 rounded-full"
                            style={{ backgroundColor: bgColor, color: '#fff' }}
                          >
                            {formatDuration(durMs, durSec)}
                          </span>
                          <svg className="w-4 h-4 text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </div>
                      </div>

                      {/* Metrics grid */}
                      <div className="grid grid-cols-4 gap-2 text-center">
                        <div>
                          <p className="text-lg font-bold text-white leading-tight">{sets}</p>
                          <p className="text-[10px] text-white/40">Sets</p>
                        </div>
                        <div>
                          <p className="text-lg font-bold text-white leading-tight">{reps}</p>
                          <p className="text-[10px] text-white/40">Reps</p>
                        </div>
                        <div>
                          <p className="text-lg font-bold text-white leading-tight">
                            {weight}<span className="text-[10px] text-white/40 ml-0.5">kg</span>
                          </p>
                          <p className="text-[10px] text-white/40">Weight</p>
                        </div>
                        <div>
                          <p className="text-lg font-bold text-white leading-tight">
                            {calories || '—'}
                          </p>
                          <p className="text-[10px] text-white/40">Kcal</p>
                        </div>
                      </div>

                      {/* Tempo row (if available) */}
                      {(avgConc > 0 || avgEcc > 0) && (
                        <div className="flex gap-4 text-xs text-white/50 border-t border-white/5 pt-2">
                          <span>Concentric: <span className="text-white/80 font-medium">{avgConc.toFixed(2)}s</span></span>
                          <span>Eccentric: <span className="text-white/80 font-medium">{avgEcc.toFixed(2)}s</span></span>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        </div>

        <BottomNav />
      </div>
    </>
  )
}
