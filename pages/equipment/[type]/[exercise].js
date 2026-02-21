import Head from 'next/head'
import { useRouter } from 'next/router'
import { useMemo } from 'react'
import BottomNav from '../../../components/BottomNav'
import { equipmentConfig } from '../../../components/equipment'
import useEquipmentData from '../../../components/equipment/useEquipmentData'

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

  return (
    <>
      <Head>
        <title>{exerciseCfg.name} | {config.label} | AppLift</title>
      </Head>

      <div className="min-h-screen bg-black text-white pb-28" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        {/* Hero with exercise image */}
        <div className="relative w-full h-52 overflow-hidden">
          <img
            src={exerciseCfg.image}
            alt={exerciseCfg.name}
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/30 to-black" />

          {/* Back */}
          <button
            onClick={() => router.back()}
            className="absolute top-4 left-4 p-2 z-10"
          >
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          <div className="absolute bottom-5 left-0 right-0 text-center z-10">
            <h1 className="text-2xl font-bold text-white">{exerciseCfg.name}</h1>
            <p className="text-sm text-white/60">{config.label}</p>
          </div>
        </div>

        {/* Content */}
        <div className="px-4 -mt-2 relative z-10 space-y-5">
          {/* Quick stats */}
          <div className="flex gap-2 content-fade-up-1">
            <div
              className="flex-1 rounded-2xl py-3 px-2 text-center"
              style={{ backgroundColor: bgColor }}
            >
              <p className="font-bold text-white">
                <span className="text-2xl">{sessions.length}</span>
              </p>
              <p className="text-[10px] text-white/60 mt-1">Sessions</p>
            </div>
            <div className="flex-1 rounded-2xl py-3 px-2 text-center bg-white/[0.07]">
              <p className="font-bold text-white">
                <span className="text-2xl">
                  {sessions.reduce((s, l) => s + (l.results?.totalReps || l.results?.completedReps || 0), 0)}
                </span>
              </p>
              <p className="text-[10px] text-white/60 mt-1">Total Reps</p>
            </div>
            <div className="flex-1 rounded-2xl py-3 px-2 text-center bg-white/[0.07]">
              <p className="font-bold text-white">
                <span className="text-2xl">
                  {sessions.reduce((s, l) => {
                    const r = l.results?.totalReps || l.results?.completedReps || 0
                    const w = l.planned?.weight || l.exercise?.weight || 0
                    return s + r * w
                  }, 0)}
                </span>
                <span className="text-xs font-medium text-white/50 ml-0.5">kg</span>
              </p>
              <p className="text-[10px] text-white/60 mt-1">Total Load</p>
            </div>
          </div>

          {/* Session list */}
          <section className="content-fade-up-2">
            <h2 className="text-lg font-bold text-white mb-3">Workout History</h2>

            {loading ? (
              <div className="flex justify-center py-8">
                <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
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
                      className="bg-white/[0.05] rounded-2xl p-4 space-y-3"
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
                        <span
                          className="text-[10px] font-medium px-2.5 py-0.5 rounded-full"
                          style={{ backgroundColor: bgColor, color: '#fff' }}
                        >
                          {formatDuration(durMs, durSec)}
                        </span>
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
