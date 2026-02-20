import Head from 'next/head'
import { useRouter } from 'next/router'
import { useState, useMemo } from 'react'
import BottomNav from '../../components/BottomNav'
import { useWorkoutLogs } from '../../utils/useWorkoutLogs'

/**
 * Barbell Equipment Page
 * Shows workout history and stats for barbell exercises
 */
export default function BarbellPage() {
  const router = useRouter()
  const { logs, loading } = useWorkoutLogs({ autoFetch: true, limitCount: 500 })

  // Filter logs for barbell exercises
  const barbellLogs = useMemo(() => {
    if (!logs || logs.length === 0) return []
    return logs.filter((log) => {
      const equipment = log.exercise?.equipmentPath || log.exercise?.equipment || ''
      return equipment.toLowerCase().includes('barbell')
    })
  }, [logs])

  // Calculate stats
  const stats = useMemo(() => {
    const totalSessions = barbellLogs.length
    const totalReps = barbellLogs.reduce((sum, log) => {
      return sum + (log.results?.totalReps || log.results?.completedReps || 0)
    }, 0)
    const totalLoad = barbellLogs.reduce((sum, log) => {
      const reps = log.results?.totalReps || log.results?.completedReps || 0
      const weight = log.exercise?.weight || 20
      return sum + (reps * weight)
    }, 0)
    return { totalSessions, totalReps, totalLoad }
  }, [barbellLogs])

  // Group logs by exercise name
  const exerciseGroups = useMemo(() => {
    const groups = {}
    barbellLogs.forEach((log) => {
      const name = log.exercise?.namePath || log.exercise?.name || 'Unknown'
      if (!groups[name]) {
        groups[name] = []
      }
      groups[name].push(log)
    })
    return groups
  }, [barbellLogs])

  return (
    <>
      <Head>
        <title>Barbell Exercises | AppLift</title>
      </Head>

      <main className="min-h-screen bg-[#0a0a0a] text-white pb-24">
        {/* Header */}
        <header className="sticky top-0 z-10 bg-[#0a0a0a]/95 backdrop-blur-sm border-b border-white/5">
          <div className="px-4 py-4 flex items-center gap-4">
            <button
              onClick={() => router.back()}
              className="p-2 rounded-full hover:bg-white/10 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h1 className="text-xl font-bold">Barbell</h1>
          </div>
        </header>

        <div className="px-4 py-4 space-y-6">
          {/* Stats Summary */}
          <section className="grid grid-cols-3 gap-3">
            <div className="bg-white/[0.07] rounded-2xl p-4 text-center">
              <p className="text-2xl font-bold text-white">{stats.totalSessions}</p>
              <p className="text-xs text-white/50 mt-1">Sessions</p>
            </div>
            <div className="bg-white/[0.07] rounded-2xl p-4 text-center">
              <p className="text-2xl font-bold text-white">{stats.totalReps}</p>
              <p className="text-xs text-white/50 mt-1">Total Reps</p>
            </div>
            <div className="bg-white/[0.07] rounded-2xl p-4 text-center">
              <p className="text-2xl font-bold text-white">{(stats.totalLoad / 1000).toFixed(1)}k</p>
              <p className="text-xs text-white/50 mt-1">Total Load (kg)</p>
            </div>
          </section>

          {/* Exercise History */}
          <section>
            <h2 className="text-lg font-semibold mb-4">Exercise History</h2>
            {loading ? (
              <div className="flex justify-center py-8">
                <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
              </div>
            ) : Object.keys(exerciseGroups).length === 0 ? (
              <div className="bg-white/[0.05] rounded-2xl p-8 text-center">
                <p className="text-white/50">No barbell exercises recorded yet</p>
                <p className="text-white/30 text-sm mt-1">Start a workout to see your history</p>
              </div>
            ) : (
              <div className="space-y-3">
                {Object.entries(exerciseGroups).map(([name, exercises]) => (
                  <div key={name} className="bg-white/[0.07] rounded-2xl p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-semibold text-white">{name}</h3>
                      <span className="text-xs text-white/50">{exercises.length} sessions</span>
                    </div>
                    <div className="space-y-2">
                      {exercises.slice(0, 3).map((log, idx) => {
                        const date = log.timestamps?.started?.toDate?.() || new Date()
                        const reps = log.results?.totalReps || log.results?.completedReps || 0
                        return (
                          <div key={idx} className="flex items-center justify-between py-2 border-t border-white/5 first:border-0 first:pt-0">
                            <span className="text-sm text-white/70">
                              {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </span>
                            <span className="text-sm font-medium text-white">{reps} reps</span>
                          </div>
                        )
                      })}
                      {exercises.length > 3 && (
                        <p className="text-xs text-white/40 text-center pt-2">
                          +{exercises.length - 3} more sessions
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>

      <BottomNav />
    </>
  )
}
