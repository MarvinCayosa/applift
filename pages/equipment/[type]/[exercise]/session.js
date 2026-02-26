import Head from 'next/head'
import { useRouter } from 'next/router'
import { useState, useEffect, useMemo } from 'react'
import BottomNav from '../../../../components/BottomNav'
import { equipmentConfig } from '../../../../components/equipment'
import { getWorkoutLogByPath } from '../../../../services/workoutLogService'
import { useAuth } from '../../../../context/AuthContext'
import { useWorkoutAnalysis, transformAnalysisForUI } from '../../../../hooks/useWorkoutAnalysis'

// Session Details / Workout Finished components (same as workout-finished page)
import SessionDetailsSkeleton from '../../../../components/sessionDetails/SessionDetailsSkeleton'
import GraphBreakdownCarousel from '../../../../components/workoutFinished/GraphBreakdownCarousel'
import ExecutionQualityCard from '../../../../components/sessionDetails/ExecutionQualityCard'
import ExecutionConsistencyCard from '../../../../components/sessionDetails/ExecutionConsistencyCard'
import FatigueCarousel from '../../../../components/sessionDetails/FatigueCarousel'
import MovementPhasesSection from '../../../../components/sessionDetails/MovementPhasesSection'

/**
 * Workout Session Summary page.
 * Displays Firestore results + GCS IMU data graphs for a historical session.
 * Uses the SAME components as the workout-finished page for consistent design.
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

  // Analysis data
  const [analysisData, setAnalysisData] = useState(null)
  const { getAnalysis, analyzeWorkout, analysis, isAnalyzing, error: analysisError } = useWorkoutAnalysis()

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
    const odWorkoutId = log.odWorkoutId || log.sessionId || logId

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
  }, [log, user, logId])

  // ---- Fetch analysis data once we have the log ----
  useEffect(() => {
    if (!log || !user || analysisData) return

    const workoutId = log.odWorkoutId || log.sessionId || logId
    if (!workoutId) return

    const fetchAnalysis = async () => {
      try {
        const result = await getAnalysis(workoutId)
        if (result) {
          const transformed = transformAnalysisForUI(result)
          setAnalysisData(transformed)
        }
      } catch (err) {
        console.warn('[Session] Analysis fetch:', err.message)
      }
    }

    fetchAnalysis()
  }, [log, user, logId, analysisData])

  // Transform analysis when it arrives from hook
  useEffect(() => {
    if (analysis && !analysisData) {
      const transformed = transformAnalysisForUI(analysis)
      setAnalysisData(transformed)
    }
  }, [analysis, analysisData])

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

  // ---- Parse Firestore data ----
  const date = log?.timestamps?.started?.toDate?.()
    || log?.timestamps?.created?.toDate?.()
    || (log?.timestamps?.started ? new Date(log.timestamps.started) : null)
    || (log?.startTime ? new Date(log.startTime) : null)

  const totalSets = log?.results?.totalSets || log?.results?.completedSets || 0
  const totalReps = log?.results?.totalReps || log?.results?.completedReps || 0
  const weight = log?.planned?.weight || log?.exercise?.weight || 0
  const weightUnit = log?.planned?.weightUnit || log?.exercise?.weightUnit || 'kg'
  const calories = log?.results?.calories || 0
  const totalTimeSec = log?.results?.totalTime || 0
  const durationMs = log?.results?.durationMs || 0
  const totalSec = durationMs ? Math.round(durationMs / 1000) : totalTimeSec
  const plannedSets = log?.planned?.sets || totalSets
  const plannedRepsPerSet = log?.planned?.reps || (totalSets > 0 ? Math.round(totalReps / totalSets) : 0)

  const formatTime = (sec) => {
    const m = Math.floor(sec / 60)
    const s = sec % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  const dateStr = date
    ? date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    : ''

  // Set data from Firestore (saved by workout-finished page)
  const rawSetData = log?.results?.setData || log?.results?.sets
  const setsData = Array.isArray(rawSetData) ? rawSetData : []

  // Merge analysis setsData with Firestore setsData
  const mergedSetsData = useMemo(() => {
    if (!setsData || setsData.length === 0) {
      return analysisData?.setsData || []
    }
    if (!analysisData?.setsData || analysisData.setsData.length === 0) {
      return setsData
    }

    return setsData.map((localSet, setIdx) => {
      const analysisSet = analysisData.setsData.find(s => s.setNumber === localSet.setNumber)
        || analysisData.setsData[setIdx]

      if (!analysisSet) return localSet

      const mergedSet = {
        ...localSet,
        classification: analysisSet.classification || localSet.classification || null,
      }

      // Preserve ROM calibration fields at set level
      mergedSet.romCalibrated = localSet.romCalibrated || analysisSet.romCalibrated || false
      mergedSet.targetROM = localSet.targetROM ?? analysisSet.targetROM ?? null
      mergedSet.romUnit = localSet.romUnit || analysisSet.romUnit || '°'

      if (localSet.repsData && analysisSet.repsData && localSet.repsData.length === analysisSet.repsData.length) {
        mergedSet.repsData = localSet.repsData.map((localRep, repIdx) => {
          const analysisRep = analysisSet.repsData[repIdx]
          return {
            ...localRep,
            classification: analysisRep?.classification || localRep.classification || null,
            smoothnessScore: analysisRep?.smoothnessScore ?? localRep.smoothnessScore,
            quality: analysisRep?.quality || localRep.quality,
            liftingTime: analysisRep?.liftingTime ?? localRep.liftingTime ?? 0,
            loweringTime: analysisRep?.loweringTime ?? localRep.loweringTime ?? 0,
            peakVelocity: analysisRep?.peakVelocity ?? localRep.peakVelocity,
            rom: analysisRep?.rom ?? localRep.rom,
            romFulfillment: localRep.romFulfillment ?? analysisRep?.romFulfillment ?? null,
            romUnit: localRep.romUnit || analysisRep?.romUnit || '°',
            chartData: analysisRep?.chartData?.length > 0 ? analysisRep.chartData : localRep.chartData,
          }
        })
      } else if (analysisSet.repsData && analysisSet.repsData.length > 0) {
        mergedSet.repsData = analysisSet.repsData
        mergedSet.reps = analysisSet.repsData.length
      }

      return mergedSet
    })
  }, [setsData, analysisData])

  // Skeleton Loading
  if (loading) {
    return (
      <>
        <Head>
          <title>Session | AppLift</title>
        </Head>
        <SessionDetailsSkeleton />
        <BottomNav />
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

  // ── handleSeeMore – navigate to performance details ──
  const handleSeeMore = () => {
    const workoutId = log.odWorkoutId || log.sessionId || logId
    router.push({
      pathname: '/performance-details',
      query: {
        workoutName: exerciseCfg.name,
        equipment: config.label,
        setsData: JSON.stringify(mergedSetsData),
        recommendedSets: plannedSets,
        recommendedReps: plannedRepsPerSet,
        workoutId,
        analysisData: analysisData ? JSON.stringify({
          fatigue: analysisData.rawAnalysis?.fatigue,
          consistency: analysisData.rawAnalysis?.consistency,
          insights: analysisData.insights,
        }) : null,
      },
    })
  }

  return (
    <>
      <Head>
        <title>Session Summary | {exerciseCfg.name} | AppLift</title>
      </Head>

      <div className="min-h-screen bg-black text-white pb-28" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        {/* ── Original Hero Header ── */}
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
        <div className="px-4 space-y-3 relative z-10" style={{ marginTop: '-120px' }}>

          {/* Top Stats row */}
          <div className="content-fade-up-1">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-2xl py-5 px-3 text-center" style={{ backgroundColor: bgColor }}>
                <p className="text-3xl font-bold text-white leading-none">{totalReps}</p>
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

          {/* ── Performance cards (same as workout-finished) ── */}
          {/* Movement Graph + Workout Breakdown + ROM — swipable carousel */}
          <GraphBreakdownCarousel
            setsData={mergedSetsData}
            chartData={analysisData?.chartData || []}
            analysisChartData={analysisData?.chartData}
            gcsData={gcsData}
            totalReps={totalReps}
            plannedReps={plannedSets * plannedRepsPerSet}
            completedSets={totalSets}
            plannedSets={plannedSets}
            weight={weight}
            weightUnit={weightUnit}
            equipment={config.label || ''}
            onSeeMore={handleSeeMore}
          />

          {/* Execution Quality + Consistency — 2-column row */}
          <div className="grid grid-cols-2 gap-3">
            <ExecutionQualityCard
              setsData={mergedSetsData}
              gcsData={gcsData}
              selectedSet="all"
            />
            <ExecutionConsistencyCard
              setsData={mergedSetsData}
              analysisScore={analysisData?.consistencyScore}
              inconsistentRepIndex={analysisData?.inconsistentRepIndex}
            />
          </div>

          {/* Fatigue + Velocity Loss — swipeable carousel */}
          <FatigueCarousel
            setsData={mergedSetsData}
            fatigueScore={analysisData?.fatigueScore}
            fatigueLevel={analysisData?.fatigueLevel}
            selectedSet="all"
          />

          {/* Movement Phases */}
          <MovementPhasesSection
            avgConcentric={analysisData?.avgConcentric}
            avgEccentric={analysisData?.avgEccentric}
            concentricPercent={analysisData?.concentricPercent}
            eccentricPercent={analysisData?.eccentricPercent}
            setsData={mergedSetsData}
          />

          {/* Loading indicators */}
          {(gcsLoading || isAnalyzing) && (
            <div className="bg-white/[0.05] rounded-2xl p-5 h-20 animate-pulse flex items-center justify-center">
              <p className="text-white/30 text-sm">{gcsLoading ? 'Loading sensor data…' : 'Analyzing workout data…'}</p>
            </div>
          )}

          {/* Analysis error */}
          {analysisError && (
            <div className="bg-yellow-500/20 border border-yellow-500/50 rounded-xl p-3 text-center">
              <p className="text-sm text-yellow-400">Analysis unavailable: Using local data</p>
            </div>
          )}
        </div>

        <BottomNav />
      </div>
    </>
  )
}
