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

/*───────────────────────────  CONSTANTS  ───────────────────────────*/

const PERIOD_OPTIONS = [
  { key: 'week',  label: 'This Week' },
  { key: 'month', label: 'This Month' },
  { key: 'all',   label: 'All Time' },
]

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
  const cyclePeriod = useCallback(() => {
    setPeriod((p) => (p === 'week' ? 'month' : p === 'month' ? 'all' : 'week'))
  }, [])

  /* ── carousel ── */
  const carouselRef = useRef(null)
  const [activeSlide, setActiveSlide] = useState(0)
  const qualityCarouselRef = useRef(null)
  const [activeQualitySlide, setActiveQualitySlide] = useState(0)
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

  /* ── quality comparison for last 3 sessions ── */
  const qualityComparison = useMemo(() => {
    const last3Sessions = sessions.slice(0, 3)
    if (last3Sessions.length === 0) return []

    return last3Sessions.map((session, index) => {
      const analytics = analyticsMap[session.id]
      const qualityData = computeQualityBreakdown([session], analytics ? {[session.id]: analytics} : {}, slug)
      const date = getLogDate(session) || new Date()
      
      // Extract clean percentage
      const cleanItem = qualityData.find(item => item.name === 'Clean')
      const cleanPct = cleanItem ? cleanItem.pct : 0
      
      // Calculate trend (compared to previous session)
      let trend = null
      if (index < last3Sessions.length - 1) {
        const prevSession = last3Sessions[index + 1]
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
                      <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold backdrop-blur-sm ${
                        progressiveOverload.status === 'progressive' ? 'bg-green-500/30 text-green-300 border border-green-400/30' :
                        progressiveOverload.status === 'regressive' ? 'bg-red-500/30 text-red-300 border border-red-400/30' :
                        progressiveOverload.status === 'maintained' ? 'bg-yellow-500/30 text-yellow-300 border border-yellow-400/30' :
                        'bg-white/20 text-white/60 border border-white/20'
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
                      </div>
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
                            <svg className="w-4 h-4 text-green-400" fill="currentColor" viewBox="0 0 20 20">
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
                            weeklyComparison.trend === 'up' ? 'text-green-400' :
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

                        {/* Slide 2: Last 3 Sessions Comparison */}
                        <div className="w-full shrink-0 snap-center snap-always p-4 pt-0 flex flex-col" style={{ minWidth: '100%' }}>
                          {qualityComparison.length > 0 ? (
                            <div className="flex-1 flex flex-col">
                              <p className="text-xs text-white/60 mb-3 text-center">Last 3 Sessions</p>
                              
                              <div className="space-y-3 flex-1">
                                {qualityComparison.map((session, idx) => (
                                  <div key={idx} className="bg-white/5 rounded-xl p-3 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                      <div className="text-center">
                                        <p className="text-xs text-white/50">{session.date}</p>
                                        <p className="text-[10px] text-white/40">{session.weight}kg · {session.totalReps}reps</p>
                                      </div>
                                      
                                      <div className="flex items-center gap-2">
                                        <div className="w-3 h-3 rounded-full bg-green-500" />
                                        <span className="text-sm font-bold text-white">{session.cleanPct}%</span>
                                      </div>
                                    </div>

                                    <div className="flex items-center">
                                      {session.trend === 'up' && (
                                        <svg className="w-4 h-4 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                                          <path fillRule="evenodd" d="M3.293 9.707a1 1 0 010-1.414l6-6a1 1 0 011.414 0l6 6a1 1 0 01-1.414 1.414L11 5.414V17a1 1 0 11-2 0V5.414L4.707 9.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
                                        </svg>
                                      )}
                                      {session.trend === 'down' && (
                                        <svg className="w-4 h-4 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                                          <path fillRule="evenodd" d="M16.707 10.293a1 1 0 010 1.414l-6 6a1 1 0 01-1.414 0l-6-6a1 1 0 111.414-1.414L9 14.586V3a1 1 0 012 0v11.586l4.293-4.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                        </svg>
                                      )}
                                      {session.trend === 'same' && (
                                        <svg className="w-4 h-4 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                                          <path fillRule="evenodd" d="M3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
                                        </svg>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>

                              <div className="mt-4 bg-white/5 rounded-xl p-3">
                                <div className="flex items-center justify-between text-xs">
                                  <span className="text-white/60">Average Quality</span>
                                  <span className="font-bold text-white">
                                    {Math.round(qualityComparison.reduce((sum, s) => sum + s.cleanPct, 0) / qualityComparison.length)}%
                                  </span>
                                </div>
                                <div className="flex items-center justify-between text-xs mt-1">
                                  <span className="text-white/60">Trend</span>
                                  <span className="font-bold text-white">
                                    {(() => {
                                      const trends = qualityComparison.filter(s => s.trend).map(s => s.trend)
                                      const upCount = trends.filter(t => t === 'up').length
                                      const downCount = trends.filter(t => t === 'down').length
                                      if (upCount > downCount) return '📈 Improving'
                                      if (downCount > upCount) return '📉 Declining'  
                                      return '➡️ Stable'
                                    })()}
                                  </span>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <p className="text-white/25 text-xs text-center py-8 flex-1 flex items-center justify-center">Need at least 3 sessions</p>
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
                            stroke={consistency.label === 'Good' ? '#22C55E' : consistency.label === 'Fair' ? '#EAB308' : '#EF4444'}
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
                        style={{ color: consistency.label === 'Good' ? '#22C55E' : consistency.label === 'Fair' ? '#EAB308' : '#EF4444' }}
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
