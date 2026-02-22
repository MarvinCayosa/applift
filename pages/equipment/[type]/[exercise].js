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
      pathname: '/session-details',
      query: { logId, eq: slug, ex: exerciseSlug, type: slug }
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

                  // Planned values
                  const plannedSets = log.planned?.sets || log.results?.totalSets || log.results?.completedSets || 0
                  const plannedRepsPerSet = log.planned?.reps || 0
                  const totalPlannedReps = plannedSets * plannedRepsPerSet

                  // Actual completed
                  const completedReps = log.results?.totalReps || log.results?.completedReps || 0

                  // Completion state
                  const isCompleted = totalPlannedReps > 0
                    ? completedReps >= totalPlannedReps
                    : true // if no planned data, assume completed

                  const weight = log.planned?.weight || log.exercise?.weight || 0
                  const weightUnit = log.planned?.weightUnit || 'kg'
                  const durMs = log.results?.durationMs || 0
                  const durSec = log.results?.totalTime || 0
                  const duration = formatDuration(durMs, durSec)

                  // Date: "Feb 02" format
                  const dateStr = `${date.toLocaleDateString('en-US', { month: 'short' })} ${date.getDate().toString().padStart(2, '0')}`

                  // Rep display: "4/6" or "6/6"
                  const repDisplay = totalPlannedReps > 0
                    ? `${completedReps}/${totalPlannedReps}`
                    : `${completedReps}`

                  return (
                    <div
                      key={log.id || idx}
                      onClick={() => handleSessionClick(log)}
                      className="rounded-2xl p-5 cursor-pointer active:scale-[0.98] transition-transform"
                      style={{ backgroundColor: bgColor }}
                    >
                      {/* Row 1: Exercise name + chevron */}
                      <div className="flex items-start justify-between">
                        <h3 className="text-[22px] font-bold text-white leading-tight pr-3">
                          {exerciseCfg.name}
                        </h3>
                        <svg
                          className="w-5 h-5 text-white/50 mt-1 flex-shrink-0"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>

                      {/* Divider */}
                      <div className="w-full h-px bg-white/30 my-3" />

                      {/* Row 2: sets×reps · duration + completion badge — ALL ONE LINE */}
                      <div className="flex items-center justify-between">
                        <p className="text-[15px] text-white/80 font-medium">
                          {plannedSets}×{plannedRepsPerSet || completedReps}{duration !== '0:00' ? ` · ${duration}` : ''}
                        </p>
                        {totalPlannedReps > 0 && (
                          <div className="flex items-center gap-1.5">
                            {isCompleted ? (
                              /* Bootstrap bi-check-circle-fill */
                              <svg
                                className="flex-shrink-0"
                                style={{ width: 18, height: 18, color: 'rgba(255,255,255,0.7)' }}
                                viewBox="0 0 16 16"
                                fill="currentColor"
                              >
                                <path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0zm-3.97-3.03a.75.75 0 0 0-1.08.022L7.477 9.417 5.384 7.323a.75.75 0 0 0-1.06 1.06L6.97 11.03a.75.75 0 0 0 1.079-.02l3.992-4.99a.75.75 0 0 0-.01-1.05z" />
                              </svg>
                            ) : (
                              /* Bootstrap bi-exclamation-circle-fill */
                              <svg
                                className="flex-shrink-0"
                                style={{ width: 18, height: 18, color: '#EAB308' }}
                                viewBox="0 0 16 16"
                                fill="currentColor"
                              >
                                <path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0zM8 4a.905.905 0 0 0-.9.995l.35 3.507a.552.552 0 0 0 1.1 0l.35-3.507A.905.905 0 0 0 8 4zm.002 6a1 1 0 1 0 0 2 1 1 0 0 0 0-2z" />
                              </svg>
                            )}
                            <span
                              className="text-[15px] font-bold"
                              style={{ color: isCompleted ? 'rgba(255,255,255,0.7)' : '#EAB308' }}
                            >
                              {repDisplay}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Row 3: Date + Weight — bottom row */}
                      <div className="flex items-end justify-between mt-4">
                        <p className="text-[14px] text-white/60 font-medium">{dateStr}</p>
                        <div className="flex items-baseline">
                          <span className="text-[40px] font-bold text-white leading-none" style={{ letterSpacing: '-1px' }}>
                            {weight}
                          </span>
                          <span className="text-[14px] font-bold text-white/70 ml-1">
                            {weightUnit}
                          </span>
                        </div>
                      </div>
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
