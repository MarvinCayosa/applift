import Head from 'next/head'
import { useRouter } from 'next/router'
import { useState, useEffect, useMemo } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Cell
} from 'recharts'
import BottomNav from '../../../../components/BottomNav'
import { equipmentConfig } from '../../../../components/equipment'
import { getWorkoutLogByPath } from '../../../../services/workoutLogService'
import { useAuth } from '../../../../context/AuthContext'

/**
 * Workout Session Summary page.
 * Displays Firestore results + GCS IMU data graphs for a historical session.
 *
 * Route: /equipment/[type]/[exercise]/session?logId=xxx&eq=equipment&ex=exercise
 */
export default function SessionSummaryPage() {
  const router = useRouter()
  const { user } = useAuth()
  const { type, exercise: exerciseSlug, logId, eq, ex } = router.query
  const slug = typeof type === 'string' ? type : ''

  const config = equipmentConfig[slug]
  const exerciseCfg = config?.exercises.find((e) => e.key === exerciseSlug)

  const [log, setLog] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // GCS workout data
  const [gcsData, setGcsData] = useState(null)
  const [gcsLoading, setGcsLoading] = useState(false)

  // ---- Fetch the session log from correct Firestore path ----
  useEffect(() => {
    if (!logId || !user?.uid) return
    setLoading(true)

    getWorkoutLogByPath(user.uid, eq || '', ex || '', logId)
      .then((data) => {
        setLog(data)
        setLoading(false)
      })
      .catch((err) => {
        console.error('Failed to fetch session:', err)
        setError(err.message)
        setLoading(false)
      })
  }, [logId, user?.uid, eq, ex])

  // ---- Fetch GCS workout_data.json once we have the log ----
  useEffect(() => {
    if (!log || !user) return

    const gcsPath = log.gcsPath
    const odWorkoutId = log.odWorkoutId || log.sessionId

    if (!gcsPath && !odWorkoutId) return

    setGcsLoading(true)

    const fetchGCS = async () => {
      try {
        const token = await user.getIdToken()
        const params = new URLSearchParams()

        if (gcsPath) {
          params.set('gcsPath', gcsPath)
        } else {
          params.set('equipment', log._equipment || log.exercise?.equipmentPath || '')
          params.set('exercise', log._exercise || log.exercise?.namePath || '')
          params.set('workoutId', odWorkoutId)
        }

        const res = await fetch(`/api/workout-data?${params.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
        })

        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error || `HTTP ${res.status}`)
        }

        const { data } = await res.json()
        setGcsData(data)
      } catch (err) {
        console.warn('[Session] GCS fetch:', err.message)
      } finally {
        setGcsLoading(false)
      }
    }

    fetchGCS()
  }, [log, user])

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

  // Parsed Firestore data
  const date = log?.timestamps?.started?.toDate?.()
    || log?.timestamps?.created?.toDate?.()
    || (log?.timestamps?.started ? new Date(log.timestamps.started) : null)
    || (log?.startTime ? new Date(log.startTime) : null)

  const sets = log?.results?.totalSets || log?.results?.completedSets || 0
  const reps = log?.results?.totalReps || log?.results?.completedReps || 0
  const weight = log?.planned?.weight || log?.exercise?.weight || 0
  const calories = log?.results?.calories || 0
  const totalTimeSec = log?.results?.totalTime || 0
  const durationMs = log?.results?.durationMs || 0
  const totalSec = durationMs ? Math.round(durationMs / 1000) : totalTimeSec
  const avgConc = log?.results?.avgConcentric || 0
  const avgEcc = log?.results?.avgEccentric || 0
  const rawSetData = log?.results?.setData || log?.results?.sets
  const setData = Array.isArray(rawSetData) ? rawSetData : []
  const totalLoad = reps * weight

  const formatTime = (sec) => {
    const m = Math.floor(sec / 60)
    const s = sec % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  const dateStr = date
    ? date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    : ''

  // ---- Process GCS data for charts ----
  const { timelineData, repBars, setColors } = useMemo(() => {
    if (!gcsData?.sets) return { timelineData: [], repBars: [], setColors: [] }

    const palette = [bgColor, config.primaryDark || '#6366f1', '#22d3ee', '#f59e0b', '#ef4444', '#8b5cf6']
    const colors = gcsData.sets.map((_, i) => palette[i % palette.length])

    let globalOffset = 0
    const timeline = []
    const bars = []

    gcsData.sets.forEach((setObj, si) => {
      const setNum = setObj.setNumber || si + 1

      ;(setObj.reps || []).forEach((rep) => {
        const repSamples = rep.samples || []
        if (repSamples.length === 0) return

        const accels = repSamples.map((s) => s.accelMag ?? s.filteredMag ?? 0)
        const avg = accels.reduce((a, b) => a + b, 0) / accels.length
        const peak = Math.max(...accels)
        bars.push({ name: `S${setNum}R${rep.repNumber}`, avg: +avg.toFixed(2), peak: +peak.toFixed(2), set: setNum })

        repSamples.forEach((s) => {
          timeline.push({
            t: globalOffset + (s.timestamp_ms ?? 0),
            mag: +(s.accelMag ?? s.filteredMag ?? 0).toFixed(3),
            set: setNum,
          })
        })

        const lastMs = repSamples[repSamples.length - 1]?.timestamp_ms ?? 0
        globalOffset += lastMs + 200
      })
    })

    return { timelineData: timeline, repBars: bars, setColors: colors }
  }, [gcsData, bgColor, config?.primaryDark])

  // Chart tooltip components
  const ChartTooltip = ({ active, payload }) => {
    if (!active || !payload?.[0]) return null
    const d = payload[0].payload
    return (
      <div className="bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 text-xs">
        <p className="text-white font-medium">Set {d.set}</p>
        <p className="text-white/60">{d.mag?.toFixed(3) ?? d.avg} g</p>
      </div>
    )
  }

  const BarTooltip = ({ active, payload }) => {
    if (!active || !payload?.[0]) return null
    const d = payload[0].payload
    return (
      <div className="bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 text-xs">
        <p className="text-white font-medium">{d.name}</p>
        <p className="text-white/60">Avg: {d.avg} g</p>
        <p className="text-white/60">Peak: {d.peak} g</p>
      </div>
    )
  }

  // Skeleton Loading
  if (loading) {
    return (
      <>
        <Head>
          <title>Session | AppLift</title>
        </Head>
        <div className="min-h-screen bg-black text-white pb-28" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
          <div className="relative w-full h-56 overflow-hidden">
            <div className="absolute inset-0 bg-zinc-900 animate-pulse" />
            <div className="absolute top-4 left-4 right-4 flex items-center z-10">
              <div className="h-9 w-9 bg-white/10 rounded-full animate-pulse" />
              <div className="flex-1 flex flex-col items-center pr-9 gap-2">
                <div className="h-5 w-40 bg-white/10 rounded animate-pulse" />
                <div className="h-3 w-24 bg-white/10 rounded animate-pulse" />
              </div>
            </div>
          </div>
          <div className="px-4 space-y-6 relative z-10" style={{ marginTop: '-130px' }}>
            <div className="flex gap-2">
              <div className="rounded-2xl py-6 px-6 bg-white/[0.05] animate-pulse" style={{ minWidth: '90px', height: '90px' }} />
              <div className="flex-1 rounded-2xl bg-white/[0.05] animate-pulse" style={{ height: '90px' }} />
            </div>
            <div className="space-y-3">
              <div className="h-6 w-40 bg-white/10 rounded animate-pulse" />
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-white/[0.05] rounded-2xl p-5 h-24 animate-pulse" />
              ))}
            </div>
          </div>
          <BottomNav />
        </div>
      </>
    )
  }

  if (error || !log) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-white/50">{error || 'Session not found'}</p>
          <button onClick={() => router.back()} className="text-blue-400 text-sm">Go back</button>
        </div>
      </div>
    )
  }

  return (
    <>
      <Head>
        <title>Session Summary | {exerciseCfg.name} | AppLift</title>
      </Head>

      <div className="min-h-screen bg-black text-white pb-28" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        {/* Hero */}
        <div className="relative w-full h-56 overflow-hidden">
          <img
            src={exerciseCfg.image}
            alt={exerciseCfg.name}
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/30 to-black" />

          {/* Top row: back + title */}
          <div className="absolute top-4 left-4 right-4 flex items-center z-10">
            <button onClick={() => router.back()} className="p-2">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div className="flex-1 text-center pt-5 pr-9">
              <h1 className="text-xl font-bold text-white">Session Summary</h1>
              <p className="text-2xs text-white/60">{exerciseCfg.name} · {dateStr}</p>
            </div>
          </div>
        </div>

        {/* Content - overlaps hero */}
        <div className="px-4 space-y-6 relative z-10" style={{ marginTop: '-120px' }}>

          {/* Top Stats row */}
          <div className="content-fade-up-1">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-2xl py-5 px-3 text-center" style={{ backgroundColor: bgColor }}>
                <p className="text-3xl font-bold text-white leading-none">{reps}</p>
                <p className="text-[10px] text-white/70 mt-1">Total Reps</p>
              </div>
              <div className="rounded-2xl py-5 px-3 text-center backdrop-blur-md" style={{ backgroundColor: 'rgba(0,0,0,0.3)' }}>
                <p className="text-3xl font-bold text-white leading-none">{calories || '—'}</p>
                <p className="text-[10px] text-white/50 mt-1">Calories</p>
              </div>
              <div className="rounded-2xl py-5 px-3 text-center backdrop-blur-md" style={{ backgroundColor: 'rgba(0,0,0,0.3)' }}>
                <p className="text-3xl font-bold text-white leading-none">{formatTime(totalSec)}</p>
                <p className="text-[10px] text-white/50 mt-1">Duration</p>
              </div>
            </div>
          </div>

          {/* ============ IMU GRAPHS ============ */}
          {gcsLoading && (
            <div className="content-fade-up-2">
              <div className="bg-white/[0.05] rounded-2xl p-5 h-56 animate-pulse flex items-center justify-center">
                <p className="text-white/30 text-sm">Loading sensor data…</p>
              </div>
            </div>
          )}

          {timelineData.length > 0 && (
            <>
              {/* Acceleration Timeline */}
              <section className="content-fade-up-2">
                <h2 className="text-lg font-bold text-white mb-3">Movement Intensity</h2>
                <div className="bg-white/[0.05] rounded-2xl p-4 pt-5">
                  <ResponsiveContainer width="100%" height={180}>
                    <AreaChart data={timelineData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="gradMag" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={bgColor} stopOpacity={0.5} />
                          <stop offset="100%" stopColor={bgColor} stopOpacity={0.05} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                      <XAxis dataKey="t" tick={false} axisLine={{ stroke: 'rgba(255,255,255,0.1)' }} />
                      <YAxis
                        tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10 }}
                        axisLine={false}
                        tickLine={false}
                        domain={['auto', 'auto']}
                        tickFormatter={(v) => `${v}g`}
                      />
                      <Tooltip content={<ChartTooltip />} />
                      <Area
                        type="monotone"
                        dataKey="mag"
                        stroke={bgColor}
                        strokeWidth={1.5}
                        fill="url(#gradMag)"
                        dot={false}
                        isAnimationActive={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                  <p className="text-[10px] text-white/30 mt-2 text-center">Acceleration magnitude across all reps</p>
                </div>
              </section>

              {/* Per-rep bar chart */}
              {repBars.length > 0 && (
                <section className="content-fade-up-3">
                  <h2 className="text-lg font-bold text-white mb-3">Rep Performance</h2>
                  <div className="bg-white/[0.05] rounded-2xl p-4 pt-5">
                    <ResponsiveContainer width="100%" height={160}>
                      <BarChart data={repBars} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                        <XAxis
                          dataKey="name"
                          tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 9 }}
                          axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                          tickLine={false}
                        />
                        <YAxis
                          tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10 }}
                          axisLine={false}
                          tickLine={false}
                          tickFormatter={(v) => `${v}g`}
                        />
                        <Tooltip content={<BarTooltip />} />
                        <Bar dataKey="peak" radius={[4, 4, 0, 0]} barSize={18}>
                          {repBars.map((entry, idx) => (
                            <Cell key={idx} fill={setColors[(entry.set - 1) % setColors.length] || bgColor} fillOpacity={0.75} />
                          ))}
                        </Bar>
                        <Bar dataKey="avg" radius={[4, 4, 0, 0]} barSize={18}>
                          {repBars.map((entry, idx) => (
                            <Cell key={idx} fill={setColors[(entry.set - 1) % setColors.length] || bgColor} fillOpacity={0.35} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                    <div className="flex items-center justify-center gap-4 mt-2">
                      <span className="flex items-center gap-1.5 text-[10px] text-white/40">
                        <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: bgColor, opacity: 0.75 }} />
                        Peak
                      </span>
                      <span className="flex items-center gap-1.5 text-[10px] text-white/40">
                        <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: bgColor, opacity: 0.35 }} />
                        Average
                      </span>
                    </div>
                  </div>
                </section>
              )}
            </>
          )}

          {/* No GCS data message (only after loading) */}
          {!gcsLoading && !gcsData && log && (
            <div className="content-fade-up-2 bg-white/[0.03] rounded-2xl p-5 text-center">
              <p className="text-white/30 text-sm">No sensor data available for this session</p>
            </div>
          )}

          {/* Workout Details Card */}
          <section className="content-fade-up-2">
            <h2 className="text-lg font-bold text-white mb-3">Workout Details</h2>
            <div className="bg-white/[0.05] rounded-2xl p-5 space-y-4">
              <div className="flex items-center gap-3">
                <img src={exerciseCfg.image} alt={exerciseCfg.name} className="w-12 h-12 rounded-xl object-cover" />
                <div>
                  <p className="text-white font-semibold">{exerciseCfg.name}</p>
                  <p className="text-xs text-white/50">{config.label} · {weight}kg</p>
                </div>
              </div>

              <div className="h-px bg-white/10" />

              <div className="grid grid-cols-2 gap-4">
                {[
                  { icon: 'M4 6h16M4 12h16M4 18h7', label: 'Sets', value: sets },
                  { icon: 'M13 10V3L4 14h7v7l9-11h-7z', label: 'Total Reps', value: reps },
                  { icon: 'M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3', label: 'Weight', value: <>{weight}<span className="text-[10px] text-white/40 ml-0.5">kg</span></> },
                  { icon: 'M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z', label: 'Total Load', value: <>{totalLoad}<span className="text-[10px] text-white/40 ml-0.5">kg</span></> },
                ].map(({ icon, label, value }, idx) => (
                  <div key={idx} className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ backgroundColor: bgColor + '33' }}>
                      <svg className="w-4 h-4" fill="none" stroke={bgColor} strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
                      </svg>
                    </div>
                    <div>
                      <p className="text-lg font-bold text-white leading-tight">{value}</p>
                      <p className="text-[10px] text-white/40">{label}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Movement Phases */}
          {(avgConc > 0 || avgEcc > 0) && (
            <section className="content-fade-up-3">
              <h2 className="text-lg font-bold text-white mb-3">Movement Phases</h2>
              <div className="bg-white/[0.05] rounded-2xl p-5 space-y-4">
                {/* Phase bar */}
                {(() => {
                  const total = (avgConc || 0) + (avgEcc || 0)
                  const concPct = total > 0 ? Math.round((avgConc / total) * 100) : 50
                  const eccPct = 100 - concPct
                  return (
                    <>
                      <div className="flex rounded-full overflow-hidden h-3">
                        <div
                          className="h-full transition-all"
                          style={{ width: `${concPct}%`, backgroundColor: bgColor }}
                        />
                        <div
                          className="h-full transition-all bg-white/20"
                          style={{ width: `${eccPct}%` }}
                        />
                      </div>
                      <div className="flex justify-between">
                        <div>
                          <p className="text-sm font-semibold text-white">Concentric</p>
                          <p className="text-xs text-white/50">{avgConc.toFixed(2)}s · {concPct}%</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold text-white">Eccentric</p>
                          <p className="text-xs text-white/50">{avgEcc.toFixed(2)}s · {eccPct}%</p>
                        </div>
                      </div>
                    </>
                  )
                })()}
              </div>
            </section>
          )}


        </div>

        <BottomNav />
      </div>
    </>
  )
}
