/**
 * Exercise Statistics Helper
 *
 * Pure aggregation functions that combine workout logs AND analytics
 * documents from Firestore to compute real statistics.
 *
 * Every function is side-effect free and suitable for use inside useMemo.
 */

// ─── helpers ────────────────────────────────────────────────────────────────

/** Extract a JS Date from a log entry (handles Firestore Timestamps & plain strings). */
export const getLogDate = (log) => {
  const ts = log.timestamps?.started || log.timestamps?.created
  if (ts && typeof ts.toDate === 'function') return ts.toDate()
  if (ts instanceof Date) return ts
  if (typeof ts === 'string') return new Date(ts)
  if (log.startTime) return new Date(log.startTime)
  return null
}

const mean = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0)
const stdDev = (arr) => {
  if (arr.length < 2) return 0
  const m = mean(arr)
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length)
}
const cv = (arr) => {
  const m = mean(arr)
  return m > 0 ? (stdDev(arr) / m) * 100 : 0
}

// ─── Overview KPIs ──────────────────────────────────────────────────────────

export function computeOverviewKPIs(logs, analyticsMap = {}) {
  let totalLoad = 0
  let heaviestLifted = 0

  logs.forEach((log) => {
    const a = analyticsMap[log.id]
    const reps = a?.summary?.totalReps || log.results?.totalReps || log.results?.completedReps || 0
    const weight = log.planned?.weight || log.exercise?.weight || 0
    totalLoad += reps * weight
    if (weight > heaviestLifted) heaviestLifted = weight
  })

  return { totalSessions: logs.length, totalLoad, heaviestLifted }
}

// ─── Workout Progression chart ──────────────────────────────────────────────

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function computeProgressionData(logs, analyticsMap = {}, metric = 'load', period = 'week') {
  const now = new Date()
  let startDate

  if (period === 'week') {
    // Find the start of the current week (Sunday)
    startDate = new Date(now)
    const dayOfWeek = startDate.getDay() // 0 = Sunday, 1 = Monday, etc.
    startDate.setDate(startDate.getDate() - dayOfWeek) // Go back to Sunday
    startDate.setHours(0, 0, 0, 0)
  } else if (period === 'month') {
    startDate = new Date(now)
    startDate.setDate(now.getDate() - 27)
    startDate.setHours(0, 0, 0, 0)
  } else {
    startDate = logs.reduce((earliest, log) => {
      const d = getLogDate(log)
      return d && d < earliest ? d : earliest
    }, now)
    startDate = new Date(startDate)
    startDate.setHours(0, 0, 0, 0)
  }

  const getMetricVal = (log) => {
    const a = analyticsMap[log.id]
    const reps = a?.summary?.totalReps || log.results?.totalReps || log.results?.completedReps || 0
    const weight = log.planned?.weight || log.exercise?.weight || 0
    return metric === 'load' ? reps * weight : reps
  }

  if (period === 'week') {
    const buckets = {}
    for (let i = 0; i < 7; i++) {
      const d = new Date(startDate)
      d.setDate(startDate.getDate() + i)
      buckets[DAY_LABELS[d.getDay()]] = { val: 0, order: i }
    }
    logs.forEach((log) => {
      const d = getLogDate(log)
      if (!d || d < startDate) return
      const lbl = DAY_LABELS[d.getDay()]
      if (buckets[lbl]) buckets[lbl].val += getMetricVal(log)
    })
    return Object.entries(buckets)
      .sort(([, a], [, b]) => a.order - b.order)
      .map(([label, v]) => ({ label, value: v.val }))
  }

  if (period === 'month') {
    const buckets = {}
    for (let i = 0; i < 4; i++) buckets[`W${i + 1}`] = { val: 0, order: i }
    logs.forEach((log) => {
      const d = getLogDate(log)
      if (!d || d < startDate) return
      const idx = Math.min(Math.floor((d - startDate) / (7 * 864e5)), 3)
      buckets[`W${idx + 1}`].val += getMetricVal(log)
    })
    return Object.entries(buckets)
      .sort(([, a], [, b]) => a.order - b.order)
      .map(([label, v]) => ({ label, value: v.val }))
  }

  // all time: by month
  const buckets = {}
  logs.forEach((log) => {
    const d = getLogDate(log)
    if (!d) return
    const key = `${d.getFullYear()}-${d.getMonth()}`
    if (!buckets[key]) buckets[key] = { val: 0, label: MONTH_LABELS[d.getMonth()], date: d }
    buckets[key].val += getMetricVal(log)
  })
  return Object.values(buckets)
    .sort((a, b) => a.date - b.date)
    .slice(-12)
    .map((v) => ({ label: v.label, value: v.val }))
}

// ─── Quality label map by equipment type ────────────────────────────────────

export const QUALITY_LABELS = {
  dumbbell:       ['Clean', 'Uncontrolled Movement', 'Abrupt Initiation'],
  barbell:        ['Clean', 'Uncontrolled Movement', 'Inclination Asymmetry'],
  'weight-stack': ['Clean', 'Pulling Too Fast', 'Releasing Too Fast'],
}

// ─── Execution Quality Breakdown (donut) ────────────────────────────────────

export function computeQualityBreakdown(logs, analyticsMap = {}, equipmentType = null) {
  const counts = {}

  // Resolve labels from equipment type (not exercise slug)
  const qualityLabels = QUALITY_LABELS[equipmentType] || ['Clean', 'Poor Form', 'Bad Form']

  logs.forEach((log) => {
    const a = analyticsMap[log.id]

    // Prefer analytics distribution (most accurate – from ML pipeline)
    if (a?.mlClassification?.distribution) {
      for (const [label, count] of Object.entries(a.mlClassification.distribution)) {
        // Map numeric codes or generic labels to exercise-specific labels
        let mappedLabel = label
        
        // If it's a numeric string, convert to number and map to quality label
        if (/^\d+$/.test(label)) {
          const index = parseInt(label, 10)
          if (index >= 0 && index < qualityLabels.length) {
            mappedLabel = qualityLabels[index]
          }
        }
        // Map common generic labels to exercise-specific ones
        else if (label.toLowerCase().includes('poor') || label.toLowerCase().includes('bad')) {
          mappedLabel = qualityLabels[1] || 'Poor Form'
        }
        else if (label.toLowerCase().includes('very') || label.toLowerCase().includes('worst')) {
          mappedLabel = qualityLabels[2] || 'Bad Form'
        }
        else if (label.toLowerCase().includes('clean') || label.toLowerCase().includes('good')) {
          mappedLabel = qualityLabels[0] || 'Clean'
        }
        
        counts[mappedLabel] = (counts[mappedLabel] || 0) + count
      }
      return
    }

    // Fallback: setData from log results
    const rawSets = log.results?.setData || log.results?.sets
    const setData = Array.isArray(rawSets) ? rawSets : []
    setData.forEach((set) => {
      if (set.classification) {
        let mappedLabel = set.classification
        
        // Apply same mapping logic for set-level classifications
        if (/^\d+$/.test(set.classification)) {
          const index = parseInt(set.classification, 10)
          if (index >= 0 && index < qualityLabels.length) {
            mappedLabel = qualityLabels[index]
          }
        }
        
        counts[mappedLabel] = (counts[mappedLabel] || 0) + 1
      }
      
      const reps = set.repsData || set.reps_data || set.repClassifications || []
      if (Array.isArray(reps)) {
        reps.forEach((r) => {
          const cls = typeof r === 'string' ? r : r?.classification || r?.label
          if (cls) {
            let mappedLabel = cls
            
            // Apply same mapping logic for rep-level classifications
            if (/^\d+$/.test(cls)) {
              const index = parseInt(cls, 10)
              if (index >= 0 && index < qualityLabels.length) {
                mappedLabel = qualityLabels[index]
              }
            }
            
            counts[mappedLabel] = (counts[mappedLabel] || 0) + 1
          }
        })
      }
    })
  })

  const total = Object.values(counts).reduce((a, b) => a + b, 0)
  return Object.entries(counts)
    .sort(([, a], [, b]) => b - a)
    .map(([name, value]) => ({
      name,
      value,
      pct: total > 0 ? Math.round((value / total) * 100) : 0,
    }))
}

// ─── Timing Stats ───────────────────────────────────────────────────────────

export function computeTimingStats(logs, analyticsMap = {}) {
  const concValues = []
  const eccValues = []

  logs.forEach((log) => {
    const a = analyticsMap[log.id]
    // Prefer analytics summary values (computed from raw IMU data)
    const c = a?.summary?.avgConcentric || log.results?.avgConcentric
    const e = a?.summary?.avgEccentric || log.results?.avgEccentric
    if (c && c > 0) concValues.push(c)
    if (e && e > 0) eccValues.push(e)
  })

  const avgConc = mean(concValues)
  const avgEcc = mean(eccValues)

  return {
    avgRepTime: +(avgConc + avgEcc).toFixed(1),
    avgConcentric: +avgConc.toFixed(1),
    avgEccentric: +avgEcc.toFixed(1),
  }
}

// ─── Execution Consistency ──────────────────────────────────────────────────

export function computeConsistency(logs, analyticsMap = {}) {
  // Prefer analytics consistency score if available
  const scores = []
  logs.forEach((log) => {
    const a = analyticsMap[log.id]
    if (a?.consistency?.score != null) scores.push(a.consistency.score)
  })

  if (scores.length > 0) {
    const avg = Math.round(mean(scores))
    const pct = Math.min(100, Math.max(0, avg))
    return { pct, label: pct >= 70 ? 'Good' : pct >= 40 ? 'Fair' : 'Poor' }
  }

  // Fallback: CV-based approach
  if (logs.length < 2) return { pct: 100, label: 'Good' }

  const repsPerSession = logs.map(
    (l) => l.results?.totalReps || l.results?.completedReps || 0,
  )
  const cvPct = cv(repsPerSession)

  let pct, label
  if (cvPct <= 10) { pct = Math.round(90 + (10 - cvPct)); label = 'Good' }
  else if (cvPct <= 25) { pct = Math.round(90 - ((cvPct - 10) / 15) * 30); label = 'Fair' }
  else { pct = Math.max(0, Math.round(60 - ((cvPct - 25) / 25) * 60)); label = 'Poor' }

  return { pct: Math.min(100, Math.max(0, pct)), label }
}
