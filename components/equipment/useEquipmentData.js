import { useMemo } from 'react'
import { useWorkoutLogs } from '../../utils/useWorkoutLogs'
import equipmentConfig from './equipmentConfig'

/**
 * Hook that provides filtered workout logs and computed stats
 * for a given equipment type (dumbbell | barbell | weight-stack).
 */
export default function useEquipmentData(equipmentSlug) {
  const config = equipmentConfig[equipmentSlug]
  const { logs, loading } = useWorkoutLogs({ autoFetch: true, limitCount: 500 })

  // Filter logs belonging to this equipment
  const equipmentLogs = useMemo(() => {
    if (!config || !logs || logs.length === 0) return []
    const keywords = [config.slug, config.label.toLowerCase()]
    return logs.filter((log) => {
      const eq = (log.exercise?.equipmentPath || log.exercise?.equipment || '').toLowerCase()
      return keywords.some((kw) => eq.includes(kw))
    })
  }, [logs, config])

  // Aggregate stats
  const stats = useMemo(() => {
    let totalSessions = equipmentLogs.length
    let totalLoad = 0
    let totalDurationMs = 0

    equipmentLogs.forEach((log) => {
      const reps = log.results?.totalReps || log.results?.completedReps || 0
      const weight = log.planned?.weight || log.exercise?.weight || 0
      totalLoad += reps * weight

      const durMs = log.results?.durationMs || 0
      const durSec = log.results?.totalTime || 0
      totalDurationMs += durMs || durSec * 1000
    })

    const avgSessionMin = totalSessions > 0
      ? Math.round(totalDurationMs / totalSessions / 60000)
      : 0

    return { totalSessions, totalLoad, avgSessionMin }
  }, [equipmentLogs])

  // Group logs by exercise using config firestoreNames
  const exerciseLogs = useMemo(() => {
    if (!config) return {}
    const grouped = {}
    config.exercises.forEach((ex) => { grouped[ex.key] = [] })

    equipmentLogs.forEach((log) => {
      const name = (log.exercise?.namePath || log.exercise?.name || '').toLowerCase()
      const match = config.exercises.find((ex) =>
        ex.firestoreNames.some((fn) => fn.toLowerCase() === name)
      )
      if (match) {
        grouped[match.key].push(log)
      }
    })

    return grouped
  }, [equipmentLogs, config])

  return { config, logs: equipmentLogs, exerciseLogs, stats, loading }
}
