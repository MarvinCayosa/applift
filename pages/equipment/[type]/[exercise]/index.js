import Head from 'next/head'
import { useRouter } from 'next/router'
import { useState, useMemo, useRef, useCallback } from 'react'
import {
  ResponsiveContainer,
  AreaChart, Area,
  XAxis, YAxis,
  CartesianGrid, Tooltip,
  PieChart, Pie, Cell,
} from 'recharts'
import Body from '@mjcdev/react-body-highlighter'
import BottomNav from '../../../../components/BottomNav'
import { equipmentConfig } from '../../../../components/equipment'
import ExerciseHeader from '../../../../components/exercise/ExerciseHeader'
import WorkoutLogCard from '../../../../components/exercise/WorkoutLogCard'
import useExerciseStats from '../../../../hooks/useExerciseStats'
import {
  getLogDate,
  computeOverviewKPIs,
  computeProgressionData,
  computeQualityBreakdown,
  computeTimingStats,
  computeConsistency,
  computeProgressiveOverloadScore,
  computeWeeklyComparison,
} from '../../../../utils/exerciseStatsHelper'
import { useUserProfile } from '../../../../utils/userProfileStore'

/*───────────────────────────  CONSTANTS  ───────────────────────────*/

const PERIOD_OPTIONS = [
  { key: 'week',  label: 'This Week' },
  { key: 'month', label: 'This Month' },
  { key: 'all',   label: 'All Time' },
]

// Muscle group mappings for exercises
// Valid slugs: trapezius, upper-back, lower-back, chest, biceps, triceps,
// forearm, deltoids, abs, obliques, adductors, hamstring,
// quadriceps, calves, gluteal, knees, tibialis, neck, hands, feet
const EXERCISE_MUSCLES = {
  'overhead-triceps-extension': {
    muscles: [
      { slug: 'triceps', intensity: 3, label: 'Triceps' }
    ],
    sides: ['front']
  },
  'concentration-curls': {
    muscles: [
      { slug: 'biceps', intensity: 3, label: 'Biceps' },
      { slug: 'forearm', intensity: 1, label: 'Forearm' }
    ],
    sides: ['front']
  },
  'flat-bench-barbell-press': {
    muscles: [
      { slug: 'chest', intensity: 3, label: 'Chest' },
      { slug: 'triceps', intensity: 2, label: 'Triceps' },
      { slug: 'deltoids', intensity: 2, label: 'Front Deltoids' }
    ],
    sides: ['front']
  },
  'back-squats': {
    muscles: [
      { slug: 'quadriceps', intensity: 3, label: 'Quadriceps' },
      { slug: 'gluteal', intensity: 3, label: 'Glutes' },
      { slug: 'hamstring', intensity: 2, label: 'Hamstrings' }
    ],
    sides: ['front', 'back']
  },
  'lateral-pulldown': {
    muscles: [
      { slug: 'upper-back', intensity: 3, label: 'Upper Back (Lats)' },
      { slug: 'deltoids', intensity: 2, label: 'Rear Deltoids' },
      { slug: 'biceps', intensity: 1, label: 'Biceps' }
    ],
    sides: ['back', 'front']
  },
  'seated-leg-extension': {
    muscles: [
      { slug: 'quadriceps', intensity: 3, label: 'Quadriceps' }
    ],
    sides: ['front']
  }
}

/*───────────────────────────  SMALL UI  ───────────────────────────*/

const Num = ({ value, className = '' }) => (
  <span className={`inline-block transition-all duration-500 ${className}`}>{value}</span>
)

const Dots = ({ count, active }) => (
  <div className="flex items-center justify-center gap-1.5 mt-2">
    {Array.from({ length: count }).map((_, i) => (
      <span
        key={i}
        className={`rounded-full transition-all duration-300 ${
          i === active ? 'w-4 h-1.5 bg-white/50' : 'w-1.5 h-1.5 bg-white/20'
        }`}
      />
    ))}
  </div>
)

/*═══════════════════════════════════════════════════════════════════*
 *  MAIN PAGE COMPONENT
 *═══════════════════════════════════════════════════════════════════*/

export default function ExerciseDetailPage() {
  const router = useRouter()
  const { type, exercise: exerciseSlug } = router.query
  const { profile } = useUserProfile()
  const userGender = profile?.gender === 'female' ? 'female' : 'male'
  const slug = typeof type === 'string' ? type : ''

  const config = equipmentConfig[slug]
  const exerciseCfg = config?.exercises?.find((e) => e.key === exerciseSlug)

  /* ── fetch logs + analytics directly from Firestore (cached) ── */
  const { logs: rawLogs, analytics: rawAnalytics, loading } = useExerciseStats(slug, exerciseSlug)

  /* ── analytics map: workoutId → analytics doc ── */
  const analyticsMap = useMemo(() => {
    const m = {}
    rawAnalytics.forEach((a) => { if (a.id) m[a.id] = a; if (a.workoutId) m[a.workoutId] = a })
    return m
  }, [rawAnalytics])

  /* ── sorted sessions ── */
  const sessions = useMemo(() => {
    return [...rawLogs].sort((a, b) => {
      const da = getLogDate(a) || new Date(0)
      const db = getLogDate(b) || new Date(0)
      return db - da
    })
  }, [rawLogs])

  /* ── tab ── */
  const [activeTab, setActiveTab] = useState('statistics')
  const [slideDir, setSlideDir] = useState(null)
  const switchTab = useCallback((tab) => {
    if (tab === activeTab) return
    setSlideDir(tab === 'history' ? 'left' : 'right')
    requestAnimationFrame(() => setActiveTab(tab))
  }, [activeTab])

  /* ── chart controls ── */
  const [period, setPeriod] = useState('week')
  const [chartMetric, setChartMetric] = useState('load')
  const [showOverloadTooltip, setShowOverloadTooltip] = useState(false)
  const cyclePeriod = useCallback(() => {
    setPeriod((p) => (p === 'week' ? 'month' : p === 'month' ? 'all' : 'week'))
  }, [])

  /* ── carousel ── */
  const carouselRef = useRef(null)
  const [activeSlide, setActiveSlide] = useState(0)
  const qualityCarouselRef = useRef(null)
  const [activeQualitySlide, setActiveQualitySlide] = useState(0)
  const [selectedMuscle, setSelectedMuscle] = useState(null)
  const handleCarouselScroll = useCallback(() => {
    const el = carouselRef.current
    if (!el) return
    setActiveSlide(Math.round(el.scrollLeft / el.clientWidth))
  }, [])
  const handleQualityCarouselScroll = useCallback(() => {
    const el = qualityCarouselRef.current
    if (!el) return
    setActiveQualitySlide(Math.round(el.scrollLeft / el.clientWidth))
  }, [])

  /* ── computed stats (all use analytics when available) ── */
  const kpis = useMemo(() => computeOverviewKPIs(sessions, analyticsMap), [sessions, analyticsMap])
  const chartData = useMemo(() => computeProgressionData(sessions, analyticsMap, chartMetric, period), [sessions, analyticsMap, chartMetric, period])
  const qualityBreakdown = useMemo(() => computeQualityBreakdown(sessions, analyticsMap, slug), [sessions, analyticsMap, slug])
  const timing = useMemo(() => computeTimingStats(sessions, analyticsMap), [sessions, analyticsMap])
  const consistency = useMemo(() => computeConsistency(sessions, analyticsMap), [sessions, analyticsMap])
  
  /* ── progressive overload & comparison stats ── */
  const progressiveOverload = useMemo(() => computeProgressiveOverloadScore(sessions, analyticsMap), [sessions, analyticsMap])
  const weeklyComparison = useMemo(() => computeWeeklyComparison(sessions, analyticsMap, chartMetric), [sessions, analyticsMap, chartMetric])

  /* ── quality comparison for last sessions (timeline) ── */
  const qualityComparison = useMemo(() => {
    const lastSessions = sessions.slice(0, 3)
    if (lastSessions.length === 0) return []

    return lastSessions.map((session, index) => {
      const analytics = analyticsMap[session.id]
      const qualityData = computeQualityBreakdown([session], analytics ? {[session.id]: analytics} : {}, slug)
      const date = getLogDate(session) || new Date()
      
      // Extract clean percentage
      const cleanItem = qualityData.find(item => item.name === 'Clean')
      const cleanPct = cleanItem ? cleanItem.pct : 0
      
      // Calculate trend (compared to previous session)
      let trend = null
      if (index < lastSessions.length - 1) {
        const prevSession = lastSessions[index + 1]
        const prevAnalytics = analyticsMap[prevSession.id]
        const prevQualityData = computeQualityBreakdown([prevSession], prevAnalytics ? {[prevSession.id]: prevAnalytics} : {}, slug)
        const prevCleanItem = prevQualityData.find(item => item.name === 'Clean')
        const prevCleanPct = prevCleanItem ? prevCleanItem.pct : 0
        
        if (cleanPct > prevCleanPct) trend = 'up'
        else if (cleanPct < prevCleanPct) trend = 'down'
        else trend = 'same'
      }

      return {
        date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        cleanPct,
        trend,
        totalReps: session.results?.totalReps || session.results?.completedReps || 0,
        weight: session.planned?.weight || session.exercise?.weight || 0
      }
    })
  }, [sessions, analyticsMap, slug])

  /* ── guard ── */
  if (!config || !exerciseCfg) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <p className="text-white/50">Exercise not found</p>
      </div>
    )
  }

  const primary = config.primary
  const bgColor = exerciseCfg.variant === 'primary' ? primary : config.primaryDark

  /* ── helpers ── */
  const handleSessionClick = (log) => {
    if (!log.id) return
    router.push({
      pathname: '/session-details',
      query: { logId: log.id, eq: log._equipment || '', ex: log._exercise || '', type: slug },
    })
  }

  const ChartTip = ({ active, payload }) => {
    if (!active || !payload?.[0]) return null
    return (
      <div className="bg-zinc-900 border border-white/10 rounded-lg px-3 py-1.5 text-xs">
        <p className="text-white/80">{payload[0].payload.label}</p>
        <p className="text-white font-semibold">{payload[0].value} {chartMetric === 'load' ? 'kg' : 'reps'}</p>
      </div>
    )
  }

  /*─────────────────────── RENDER ──────────────────────────*/

  return (
    <>
      <Head>
        <title>{exerciseCfg.name} | {config.label} | AppLift</title>
      </Head>

      <div className="min-h-screen bg-black text-white pb-28" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>

        {/* ═══════════ HEADER (hero + tabs) ═══════════ */}
        <ExerciseHeader
          title={exerciseCfg.name}
          image={exerciseCfg.image}
          activeTab={activeTab}
          onTabChange={switchTab}
          accentColor={bgColor}
          onBack={() => router.back()}
        />

        {/* ═══════════ TAB CONTENT ═══════════ */}
        <div className="overflow-hidden relative" style={{marginTop:"-90px"}}>
          {/* ─── STATISTICS ─── */}
          <div
            key="statistics"
            className={`px-4 space-y-5 ${
              activeTab === 'statistics'
                ? 'tab-panel-enter'
                : slideDir === 'left' ? 'tab-panel-exit-left' : 'tab-panel-exit-right'
            }`}
            style={{ display: activeTab === 'statistics' ? 'block' : 'none' }}
          >
            {loading ? (
              <div className="space-y-4">
                <div className="flex gap-2">
                  <div className="rounded-2xl bg-white/[0.05] animate-pulse" style={{ minWidth: 90, height: 90 }} />
                  <div className="flex-1 rounded-2xl bg-white/[0.05] animate-pulse" style={{ height: 90 }} />
                </div>
                {[1, 2, 3].map((i) => (
                  <div key={i} className="rounded-2xl bg-white/[0.05] animate-pulse h-48" />
                ))}
              </div>
            ) : (
              <>
                {/* ═══ KPI Cards ═══ */}
                <div className="content-fade-up-1">
                  <div className="flex gap-2">
                    <div
                      className="rounded-2xl py-6 px-6 text-center flex flex-col justify-center"
                      style={{ backgroundColor: bgColor, minWidth: 90 }}
                    >
                      <p className="text-4xl font-bold text-white leading-none"><Num value={kpis.totalSessions} /></p>
                      <p className="text-[10px] text-white/70 mt-1">Total Sessions</p>
                    </div>

                    <div className="flex-1 rounded-2xl flex overflow-hidden backdrop-blur-md" style={{ backgroundColor: 'rgba(0,0,0,0.3)' }}>
                      <div className="flex-1 py-6 px-4 text-center">
                        <p className="font-bold text-white leading-none">
                          <span className="text-3xl"><Num value={kpis.totalLoad} /></span>
                          <span className="text-xs font-medium text-white/50 ml-0.5">kg</span>
                        </p>
                        <p className="text-[10px] text-white/50 mt-1">Load Lifted</p>
                      </div>
                      <div className="w-px bg-white/10 my-3" />
                      <div className="flex-1 py-6 px-4 text-center">
                        <p className="font-bold text-white leading-none">
                          <span className="text-3xl"><Num value={kpis.heaviestLifted} /></span>
                          <span className="text-xs font-medium text-white/50 ml-0.5">kg</span>
                        </p>
                        <p className="text-[10px] text-white/50 mt-1">Heaviest Lifted</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* ═══ Targeted Muscle Groups ═══ */}
                <section className="content-fade-up-2">
                  <h2 className="text-lg font-bold text-white">Targeted Muscles</h2>
                  <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: 'rgba(0,0,0,0.3)' }}>
                    {(() => {
                      const muscleData = EXERCISE_MUSCLES[exerciseCfg.key];
                      if (!muscleData) {
                        return (
                          <div className="text-center py-8">
                            <p className="text-white/40 text-sm">Muscle data not available</p>
                          </div>
                        );
                      }

                      const bodyData = selectedMuscle
                        ? muscleData.muscles.filter(m => m.slug === selectedMuscle).map(m => ({ slug: m.slug, intensity: 3 }))
                        : muscleData.muscles.map(m => ({ slug: m.slug, intensity: m.intensity }));

                      const bodyColors = [
                        `${bgColor}40`,
                        `${bgColor}80`,
                        bgColor,
                      ];

                      return (
                        <div className="flex items-stretch">
                          {/* Left — body diagrams (always front + back) */}
                          <div
                            className="flex items-center justify-center py-3 flex-shrink-0"
                            style={{
                              width: '55%',
                              minWidth: 140,
                              background: 'linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)',
                            }}
                          >
                            {['front', 'back'].map((s) => (
                              <div key={s} className="flex flex-col items-center">
                                <Body
                                  data={bodyData}
                                  gender={userGender}
                                  side={s}
                                  scale={0.55}
                                  border="none"
                                  colors={bodyColors}
                                />
                              </div>
                            ))}
                          </div>

                          {/* Divider */}
                          <div className="w-px bg-white/[0.06] my-3" />

                          {/* Right — muscle breakdown */}
                          <div className="flex-1 flex flex-col justify-start py-3 px-2 gap-1.5 min-w-0">
                            {muscleData.muscles.map((muscle) => {
                              const isPrimary = muscle.intensity === 3;
                              const isSelected = selectedMuscle === muscle.slug;
                              const tagLabel = isPrimary ? 'Primary' : muscle.intensity === 2 ? 'Secondary' : 'Stabilizer';
                              return (
                                <div
                                  key={muscle.slug}
                                  onClick={() => setSelectedMuscle(isSelected ? null : muscle.slug)}
                                  className="flex items-center gap-2 rounded-lg p-2 transition-all cursor-pointer active:scale-[0.98]"
                                  style={{
                                    backgroundColor: isSelected ? `${bgColor}30` : isPrimary ? `${bgColor}15` : 'rgba(255,255,255,0.03)',
                                  }}
                                >
                                  {/* Intensity bar - single wide bar */}
                                  <div
                                    className="rounded-sm flex-shrink-0"
                                    style={{
                                      width: 4,
                                      height: 20,
                                      background: `linear-gradient(to top, ${bgColor} ${muscle.intensity * 33.3}%, rgba(255,255,255,0.1) ${muscle.intensity * 33.3}%)`,
                                    }}
                                  />

                                  {/* Text */}
                                  <p className="flex-1 text-xs font-semibold leading-tight text-white/70">
                                    {muscle.label}
                                  </p>

                                  {/* Tag pill - filled solid */}
                                  <span
                                    className="text-[8px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full flex-shrink-0"
                                    style={{
                                      color: isPrimary ? '#fff' : 'rgba(255,255,255,0.7)',
                                      backgroundColor: isPrimary ? bgColor : 'rgba(255,255,255,0.12)',
                                    }}
                                  >
                                    {tagLabel}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </section>

                {/* ═══ Workout Progression ═══ */}
                <section className="content-fade-up-2">
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-lg font-bold text-white">Workout Progression</h2>
                    
                    {/* Load/Reps Toggle */}
                    <div className="flex bg-white/[0.08] rounded-full p-0.5">
                      {['load', 'reps'].map((m) => (
                        <button
                          key={m}
                          onClick={() => setChartMetric(m)}
                          className={`text-[10px] font-semibold capitalize px-3 py-1 rounded-full transition-all duration-200 ${chartMetric === m ? 'text-white' : 'text-white/40'}`}
                          style={chartMetric === m ? { backgroundColor: bgColor } : {}}
                        >
                          {m === 'load' ? 'Load' : 'Reps'}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="bg-white/[0.05] rounded-2xl p-4 pt-3 relative">
                    <button
                      onClick={cyclePeriod}
                      className="flex items-center gap-1.5 text-xs text-white/70 bg-white/[0.08] rounded-full px-3 py-1.5 mb-3 active:scale-95 transition-transform"
                    >
                      {PERIOD_OPTIONS.find((p) => p.key === period)?.label}
                      <svg className="w-3 h-3 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
                      </svg>
                    </button>

                    {/* Progressive Overload Score Pill - Overlaid on Chart */}
                    <div className="absolute top-3 right-4 z-10">
                      <button
                        onClick={() => setShowOverloadTooltip(!showOverloadTooltip)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold backdrop-blur-sm transition-all duration-200 hover:scale-105 active:scale-95 ${
                        progressiveOverload.status === 'progressive' ? 'bg-green-500/30 text-green-500' :
                        progressiveOverload.status === 'regressive' ? 'bg-red-500/30 text-red-300' :
                        progressiveOverload.status === 'maintained' ? 'bg-yellow-500/30 text-yellow-300' :
                        'bg-white/20 text-white/60'
                      }`}>
                        {progressiveOverload.status === 'progressive' && (
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M3.293 9.707a1 1 0 010-1.414l6-6a1 1 0 011.414 0l6 6a1 1 0 01-1.414 1.414L11 5.414V17a1 1 0 11-2 0V5.414L4.707 9.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
                          </svg>
                        )}
                        {progressiveOverload.status === 'regressive' && (
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 10.293a1 1 0 010 1.414l-6 6a1 1 0 01-1.414 0l-6-6a1 1 0 111.414-1.414L9 14.586V3a1 1 0 012 0v11.586l4.293-4.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        )}
                        {progressiveOverload.status === 'maintained' && (
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
                          </svg>
                        )}
                        <span>{progressiveOverload.label}</span>
                      </button>
                      
                      {/* Tooltip */}
                      {showOverloadTooltip && (
                        <div className="absolute top-full right-0 mt-2 w-72 bg-zinc-900 border border-white/20 rounded-xl p-4 shadow-xl z-20">
                          <div className="flex items-center justify-between mb-3">
                            <h3 className="text-sm font-bold text-white">Progressive Overload Breakdown</h3>
                            <button 
                              onClick={() => setShowOverloadTooltip(false)}
                              className="text-white/40 hover:text-white/60"
                            >
                              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                              </svg>
                            </button>
                          </div>
                          
                          <div className="space-y-2 text-xs">
                            <div className="flex justify-between items-center">
                              <span className="text-white/70">Load Trend</span>
                              <span className="text-white font-medium">50% weight</span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-white/70">Weight Progression</span>
                              <span className="text-white font-medium">30% weight</span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-white/70">Volume (Reps)</span>
                              <span className="text-white font-medium">15% weight</span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-white/70">Execution Quality</span>
                              <span className="text-white font-medium">5% weight</span>
                            </div>
                            
                            <div className="border-t border-white/10 pt-2 mt-3">
                              <div className="flex justify-between items-center">
                                <span className="text-white/90 font-medium">Final Score</span>
                                <span className={`font-bold ${
                                  progressiveOverload.status === 'progressive' ? 'text-green-500' :
                                  progressiveOverload.status === 'regressive' ? 'text-red-400' :
                                  'text-yellow-400'
                                }`}>
                                  {progressiveOverload.label}
                                </span>
                              </div>
                              <p className="text-white/50 text-[10px] mt-1">
                                Based on last {Math.min(sessions.length, 5)} sessions with weighted analysis
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {chartData.length > 0 ? (
                      <div className="chart-transition">
                        <ResponsiveContainer width="100%" height={170}>
                          <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 5, bottom: 0 }}>
                            <defs>
                              <linearGradient id="grad-prog" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor={bgColor} stopOpacity={0.45} />
                                <stop offset="100%" stopColor={bgColor} stopOpacity={0.03} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                            <XAxis
                              dataKey="label"
                              tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10 }}
                              axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                              tickLine={false}
                              interval={0}
                              padding={{ left: 8, right: 8 }}
                            />
                            <YAxis hide />
                            <Tooltip content={<ChartTip />} />
                            <Area
                              type="monotone"
                              dataKey="value"
                              stroke={bgColor}
                              strokeWidth={5}
                              fill="url(#grad-prog)"
                              dot={false}
                              animationDuration={500}
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    ) : (
                      <div className="h-[170px] flex items-center justify-center">
                        <p className="text-white/25 text-sm">No data for this period</p>
                      </div>
                    )}
                    
                    {/* Weekly Comparison */}
                    {weeklyComparison.previousWeek > 0 || weeklyComparison.currentWeek > 0 ? (
                      <div className="mt-4 flex items-center justify-between bg-white/[0.05] rounded-xl px-4 py-3">
                        <div className="text-left">
                          <div className="text-xs text-white/50">
                            {weeklyComparison.currentWeek} {weeklyComparison.label} this week
                          </div>
                          <div className="text-xs text-white/40">
                            vs {weeklyComparison.previousWeek} {weeklyComparison.label} last week
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-1.5">
                          {weeklyComparison.trend === 'up' && (
                            <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M3.293 9.707a1 1 0 010-1.414l6-6a1 1 0 011.414 0l6 6a1 1 0 01-1.414 1.414L11 5.414V17a1 1 0 11-2 0V5.414L4.707 9.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
                            </svg>
                          )}
                          {weeklyComparison.trend === 'down' && (
                            <svg className="w-4 h-4 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 10.293a1 1 0 010 1.414l-6 6a1 1 0 01-1.414 0l-6-6a1 1 0 111.414-1.414L9 14.586V3a1 1 0 012 0v11.586l4.293-4.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          )}
                          {weeklyComparison.trend === 'same' && (
                            <svg className="w-4 h-4 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
                            </svg>
                          )}
                          <span className={`text-sm font-bold ${
                            weeklyComparison.trend === 'up' ? 'text-green-500' :
                            weeklyComparison.trend === 'down' ? 'text-red-400' :
                            'text-gray-400'
                          }`}>
                            {weeklyComparison.change > 0 ? 
                              `${weeklyComparison.trend === 'up' ? '+' : '-'}${weeklyComparison.change.toFixed(1)}%` : 
                              'No change'
                            }
                          </span>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </section>

                {/* ═══ Bottom Grid ═══ */}
                <section className="content-fade-up-3">
                  <div className="grid grid-cols-2 gap-3">
                    {/* LEFT: Execution Quality – swipeable with overall + comparison views */}
                    <div className="row-span-2 bg-white/[0.05] rounded-2xl overflow-hidden flex flex-col" style={{ backgroundColor: `${bgColor}33` }}>
                      <div className="p-4 pb-2 flex items-center justify-between">
                        <p className="text-sm font-semibold text-white">Execution Quality</p>
                        <Dots count={2} active={activeQualitySlide} />
                      </div>

                      <div
                        ref={qualityCarouselRef}
                        onScroll={handleQualityCarouselScroll}
                        className="flex-1 flex overflow-x-auto snap-x snap-mandatory scrollbar-hide scroll-smooth"
                        style={{ scrollSnapType: 'x mandatory' }}
                      >
                        {/* Slide 1: Overall Quality Distribution */}
                        <div className="w-full shrink-0 snap-center snap-always p-4 pt-0 flex flex-col" style={{ minWidth: '100%' }}>
                          {qualityBreakdown.length > 0 ? (
                            <div className="flex-1 flex flex-col">
                              {/* Donut Chart using Recharts */}
                              <div className="relative flex-1 flex items-center justify-center min-h-[120px]">
                                <div style={{ height: '140px', width: '100%' }}>
                                  <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                      <Pie
                                        data={(() => {
                                          // Fixed order: Clean, Mistake 1, Mistake 2
                                          const orderedData = []
                                          const colors = ['#22C55E', '#f59e0b', '#EF4444'] // Green, Orange, Red
                                          
                                          // Find Clean first
                                          const cleanItem = qualityBreakdown.find(item => item.name === 'Clean')
                                          if (cleanItem) orderedData.push({...cleanItem, color: colors[0]})
                                          
                                          // Find Mistake 1 types
                                          const mistake1Item = qualityBreakdown.find(item => 
                                            item.name !== 'Clean' && 
                                            (item.name.includes('Uncontrolled') || item.name.includes('Pulling'))
                                          )
                                          if (mistake1Item) orderedData.push({...mistake1Item, color: colors[1]})
                                          
                                          // Find Mistake 2 types 
                                          const mistake2Item = qualityBreakdown.find(item => 
                                            item.name !== 'Clean' && 
                                            item !== mistake1Item &&
                                            (item.name.includes('Abrupt') || item.name.includes('Inclination') || item.name.includes('Releasing') || item.name.includes('Poor'))
                                          )
                                          if (mistake2Item) orderedData.push({...mistake2Item, color: colors[2]})
                                          
                                          // Fill remaining slots with any other items
                                          const remainingItems = qualityBreakdown.filter(item => 
                                            !orderedData.some(ordered => ordered.name === item.name)
                                          ).slice(0, 3 - orderedData.length)
                                          
                                          remainingItems.forEach((item, idx) => {
                                            orderedData.push({...item, color: colors[orderedData.length]})
                                          })
                                          
                                          return orderedData.slice(0, 3)
                                        })()
                                        }
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={45}
                                        outerRadius={65}
                                        paddingAngle={2}
                                        dataKey="value"
                                        animationDuration={700}
                                        cornerRadius={3}
                                        stroke="none"
                                      >
                                        {(() => {
                                          const colors = ['#22C55E', '#f59e0b', '#EF4444'] // Green, Orange, Red
                                          return Array.from({length: 3}, (_, index) => (
                                            <Cell 
                                              key={`cell-${index}`} 
                                              fill={colors[index]}
                                              stroke="none"
                                            />
                                          ))
                                        })()}
                                      </Pie>
                                    </PieChart>
                                  </ResponsiveContainer>
                                </div>
                                {/* Center Icon */}
                                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                  <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
                                    <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                    </svg>
                                  </div>
                                </div>
                              </div>

                              {/* Legend */}
                              <div className="space-y-1.5 mt-2">
                                {(() => {
                                  const orderedData = []
                                  const colors = ['#22C55E', '#f59e0b', '#EF4444'] // Green, Orange, Red
                                  
                                  // Fixed order: Clean, Mistake 1, Mistake 2
                                  const cleanItem = qualityBreakdown.find(item => item.name === 'Clean')
                                  if (cleanItem) orderedData.push({...cleanItem, color: colors[0]})
                                  
                                  const mistake1Item = qualityBreakdown.find(item => 
                                    item.name !== 'Clean' && 
                                    (item.name.includes('Uncontrolled') || item.name.includes('Pulling'))
                                  )
                                  if (mistake1Item) orderedData.push({...mistake1Item, color: colors[1]})
                                  
                                  const mistake2Item = qualityBreakdown.find(item => 
                                    item.name !== 'Clean' && 
                                    item !== mistake1Item &&
                                    (item.name.includes('Abrupt') || item.name.includes('Inclination') || item.name.includes('Releasing') || item.name.includes('Poor'))
                                  )
                                  if (mistake2Item) orderedData.push({...mistake2Item, color: colors[2]})
                                  
                                  const remainingItems = qualityBreakdown.filter(item => 
                                    !orderedData.some(ordered => ordered.name === item.name)
                                  ).slice(0, 3 - orderedData.length)
                                  
                                  remainingItems.forEach((item, idx) => {
                                    orderedData.push({...item, color: colors[orderedData.length]})
                                  })
                                  
                                  return orderedData.slice(0, 3).map((item, i) => (
                                    <div key={item.name} className="flex items-center gap-2 text-xs">
                                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
                                      <span className="text-white/70 truncate flex-1">{item.name}</span>
                                      <span className="text-white font-bold">{item.pct}%</span>
                                    </div>
                                  ))
                                })()}
                              </div>

                              {/* Subtitle */}
                              <p className="text-[10px] text-white/40 text-center mt-3">Based on all sessions</p>
                            </div>
                          ) : (
                            <p className="text-white/25 text-xs text-center py-8 flex-1 flex items-center justify-center">No data yet</p>
                          )}
                        </div>

                        {/* Slide 2: Last Sessions Timeline */}
                        <div className="w-full shrink-0 snap-center snap-always p-4 pt-0 flex flex-col" style={{ minWidth: '100%' }}>
                          {qualityComparison.length > 0 ? (
                            <div className="flex-1 flex flex-col">
                              {/* Trend badge */}
                              {(() => {
                                const trends = qualityComparison.filter(s => s.trend).map(s => s.trend)
                                const upCount = trends.filter(t => t === 'up').length
                                const downCount = trends.filter(t => t === 'down').length
                                const trendLabel = upCount > downCount ? 'Improving' : downCount > upCount ? 'Declining' : 'Stable'
                                const trendColor = upCount > downCount ? '#22C55E' : downCount > upCount ? '#EF4444' : '#A1A1AA'
                                const trendArrow = upCount > downCount ? '↑' : downCount > upCount ? '↓' : '→'
                                const avgQuality = Math.round(qualityComparison.reduce((sum, s) => sum + s.cleanPct, 0) / qualityComparison.length)
                                return (
                                  <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-lg font-bold text-white">{avgQuality}%</span>
                                      <span className="text-[10px] text-white/40">avg</span>
                                    </div>
                                    <div
                                      className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
                                      style={{ backgroundColor: `${trendColor}20`, color: trendColor }}
                                    >
                                      <span>{trendArrow}</span>
                                      <span>{trendLabel}</span>
                                    </div>
                                  </div>
                                )
                              })()}

                              {/* Timeline */}
                              <div className="flex-1 relative">
                                {qualityComparison.map((session, idx) => {
                                  const isLatest = idx === 0
                                  const isLast = idx === qualityComparison.length - 1
                                  const pctColor = session.cleanPct >= 80 ? '#22C55E' : session.cleanPct >= 50 ? '#f59e0b' : '#EF4444'
                                  const diff = session.trend === 'up' ? '+' : session.trend === 'down' ? '' : ''
                                  const prevPct = idx < qualityComparison.length - 1 ? qualityComparison[idx + 1].cleanPct : null
                                  const pctDiff = prevPct !== null ? session.cleanPct - prevPct : null

                                  return (
                                    <div key={idx} className="flex gap-3 relative" style={{ paddingBottom: isLast ? 0 : 12 }}>
                                      {/* Timeline stem */}
                                      <div className="flex flex-col items-center" style={{ width: 16 }}>
                                        {/* Node */}
                                        <div
                                          className="relative z-10 flex-shrink-0 rounded-full flex items-center justify-center"
                                          style={{
                                            width: isLatest ? 16 : 10,
                                            height: isLatest ? 16 : 10,
                                            backgroundColor: isLatest ? pctColor : 'transparent',
                                            border: isLatest ? 'none' : `2px solid ${pctColor}60`,
                                            marginTop: isLatest ? 0 : 3,
                                          }}
                                        >
                                          {isLatest && (
                                            <div className="w-1.5 h-1.5 rounded-full bg-white" />
                                          )}
                                        </div>
                                        {/* Connector line */}
                                        {!isLast && (
                                          <div
                                            className="flex-1"
                                            style={{
                                              width: 1.5,
                                              background: `linear-gradient(to bottom, ${pctColor}50, ${
                                                qualityComparison[idx + 1].cleanPct >= 80 ? '#22C55E' : qualityComparison[idx + 1].cleanPct >= 50 ? '#f59e0b' : '#EF4444'
                                              }50)`,
                                              minHeight: 12,
                                            }}
                                          />
                                        )}
                                      </div>

                                      {/* Content */}
                                      <div className="flex-1 pb-1" style={{ marginTop: isLatest ? -2 : 0 }}>
                                        <div className="flex items-baseline justify-between">
                                          <div className="flex items-baseline gap-1.5">
                                            <span className={`font-bold text-white ${isLatest ? 'text-base' : 'text-sm opacity-70'}`}>
                                              {session.cleanPct}%
                                            </span>
                                            {pctDiff !== null && pctDiff !== 0 && (
                                              <span
                                                className="text-[10px] font-semibold"
                                                style={{ color: pctDiff > 0 ? '#22C55E' : '#EF4444' }}
                                              >
                                                {pctDiff > 0 ? '+' : ''}{pctDiff}
                                              </span>
                                            )}
                                          </div>
                                          <span className={`text-white/40 ${isLatest ? 'text-[11px]' : 'text-[10px]'}`}>
                                            {session.date}
                                          </span>
                                        </div>
                                        {/* Progress bar */}
                                        <div className="mt-1.5 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                                          <div
                                            className="h-full rounded-full transition-all duration-700"
                                            style={{
                                              width: `${session.cleanPct}%`,
                                              background: `linear-gradient(90deg, ${pctColor}, ${pctColor}AA)`,
                                              opacity: isLatest ? 1 : 0.6,
                                            }}
                                          />
                                        </div>
                                        <div className="flex items-center gap-1 mt-1">
                                          <span className="text-[9px] text-white/30">{session.weight}kg</span>
                                          <span className="text-[9px] text-white/20">·</span>
                                          <span className="text-[9px] text-white/30">{session.totalReps} reps</span>
                                        </div>
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          ) : (
                            <p className="text-white/25 text-xs text-center py-8 flex-1 flex items-center justify-center">Need at least 2 sessions</p>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* RIGHT TOP: Timing carousel – contained, one card visible */}
                    <div className="flex flex-col gap-2">
                      <div className="bg-white/[0.05] rounded-2xl overflow-hidden flex-1">
                        <div
                          ref={carouselRef}
                          onScroll={handleCarouselScroll}
                          className="h-full flex overflow-x-auto snap-x snap-mandatory scrollbar-hide scroll-smooth"
                          style={{ scrollSnapType: 'x mandatory' }}
                        >
                          {/* Card 1: Avg Rep Time (Dark) */}
                          <div className="w-full shrink-0 snap-center snap-always p-4 flex flex-col justify-center" style={{ minWidth: '100%', backgroundColor: 'rgba(0,0,0,0.5)' }}>
                            <p className="text-xs text-white/60 font-medium text-right mb-1">Avg Rep Time</p>
                            <p className="text-5xl font-bold text-white leading-none text-right">
                              {timing.avgRepTime || '—'}
                            </p>
                            <p className="text-xs text-white/40 font-medium text-right">secs</p>
                          </div>

                          {/* Card 2: Avg Lifting Time (Blue) */}
                          <div className="w-full shrink-0 snap-center snap-always p-4 flex flex-col justify-center" style={{ minWidth: '100%', backgroundColor: '#3B82F6' }}>
                            <p className="text-xs text-white/80 font-medium text-right mb-1">Avg Lifting Time</p>
                            <p className="text-5xl font-bold text-white leading-none text-right">
                              {timing.avgConcentric || '—'}
                            </p>
                            <p className="text-xs text-white/60 font-medium text-right">secs</p>
                          </div>

                          {/* Card 3: Avg Lowering Time (Orange) */}
                          <div className="w-full shrink-0 snap-center snap-always p-4 flex flex-col justify-center" style={{ minWidth: '100%', backgroundColor: '#F97316' }}>
                            <p className="text-xs text-white/80 font-medium text-right mb-1">Avg Lowering Time</p>
                            <p className="text-5xl font-bold text-white leading-none text-right">
                              {timing.avgEccentric || '—'}
                            </p>
                            <p className="text-xs text-white/60 font-medium text-right">secs</p>
                          </div>
                        </div>
                      </div>
                      {/* Dots outside the card */}
                      <Dots count={3} active={activeSlide} />
                    </div>

                    {/* RIGHT BOTTOM: Consistency */}
                    <div className="bg-white/[0.05] rounded-2xl p-3 flex flex-col items-center justify-center">
                      <p className="text-xs text-white/50 mb-1">Consistency</p>
                      <div className="relative w-[80px] h-[80px]">
                        <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                          <circle cx="18" cy="18" r="15.5" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="3" />
                          <circle
                            cx="18" cy="18" r="15.5" fill="none"
                            stroke={consistency.label === 'Good' ? '#22c55e' : consistency.label === 'Fair' ? '#EAB308' : '#EF4444'}
                            strokeWidth="3" strokeLinecap="round"
                            strokeDasharray={`${consistency.pct} ${100 - consistency.pct}`}
                            className="transition-all duration-700"
                          />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <span className="text-xl font-bold text-white">{consistency.pct}%</span>
                        </div>
                      </div>
                      <span
                        className="text-xs font-semibold"
                        style={{ color: consistency.label === 'Good' ? '#22c55e' : consistency.label === 'Fair' ? '#EAB308' : '#EF4444' }}
                      >
                        {consistency.label}
                      </span>
                    </div>
                  </div>
                </section>

                <div className="h-4" />
              </>
            )}
          </div>

          {/* ─── HISTORY ─── */}
          <div
            key="history"
            className={`px-4 space-y-4 ${
              activeTab === 'history'
                ? 'tab-panel-enter'
                : slideDir === 'right' ? 'tab-panel-exit-right' : 'tab-panel-exit-left'
            }`}
            style={{ display: activeTab === 'history' ? 'block' : 'none' }}
          >
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="bg-white/[0.05] rounded-2xl p-4 h-24 animate-pulse" />
                ))}
              </div>
            ) : sessions.length === 0 ? (
              <div className="bg-white/[0.05] rounded-2xl p-8 text-center mt-4">
                <svg className="w-10 h-10 mx-auto text-white/15 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-white/40 text-sm">No sessions recorded yet</p>
                <p className="text-white/20 text-xs mt-1">Complete a workout to see your history</p>
              </div>
            ) : (
              <div className="space-y-3">
                {sessions.map((log, idx) => (
                  <WorkoutLogCard
                    key={log.id || idx}
                    log={log}
                    analytics={analyticsMap[log.id]}
                    accentColor={bgColor}
                    onClick={() => handleSessionClick(log)}
                    delay={idx * 60}
                  />
                ))}
              </div>
            )}
            <div className="h-4" />
          </div>
        </div>

        <BottomNav />
      </div>
    </>
  )
}
