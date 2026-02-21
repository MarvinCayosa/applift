/**
 * useExerciseStats – fetches logs + analytics for a single exercise
 * from userWorkouts/{uid}/{equipment}/{exercise}/logs & /analytics,
 * caches in sessionStorage so subsequent visits are instant.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { collection, getDocs } from 'firebase/firestore'
import { db } from '../config/firestore'
import { useAuth } from '../context/AuthContext'

// ── helpers ──────────────────────────────────────────────────────────────────

const CACHE_TTL = 5 * 60 * 1000 // 5 min

function cacheKey(uid, eq, ex, kind) {
  return `exStats_${uid}_${eq}_${ex}_${kind}`
}

function getFromCache(key) {
  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return null
    const { ts, data } = JSON.parse(raw)
    if (Date.now() - ts > CACHE_TTL) { sessionStorage.removeItem(key); return null }
    return data
  } catch { return null }
}

function setToCache(key, data) {
  try { sessionStorage.setItem(key, JSON.stringify({ ts: Date.now(), data })) } catch {}
}

/** Turn Firestore Timestamp-like objects into ISO strings for safe caching. */
function serializeDates(obj) {
  if (!obj || typeof obj !== 'object') return obj
  if (typeof obj.toDate === 'function') return obj.toDate().toISOString()
  if (Array.isArray(obj)) return obj.map(serializeDates)
  const out = {}
  for (const [k, v] of Object.entries(obj)) out[k] = serializeDates(v)
  return out
}

/** Restore ISO date strings back to Date objects for timestamp fields. */
function reviveDates(obj) {
  if (!obj || typeof obj !== 'object') return obj
  if (typeof obj === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(obj)) return new Date(obj)
  if (Array.isArray(obj)) return obj.map(reviveDates)
  const out = {}
  for (const [k, v] of Object.entries(obj)) out[k] = reviveDates(v)
  return out
}

// ── main hook ────────────────────────────────────────────────────────────────

export default function useExerciseStats(equipmentSlug, exerciseKey) {
  const { user } = useAuth()
  const uid = user?.uid

  const [logs, setLogs] = useState([])
  const [analytics, setAnalytics] = useState([])
  const [loading, setLoading] = useState(true)
  const fetchedRef = useRef(false)

  const fetchData = useCallback(async () => {
    if (!uid || !equipmentSlug || !exerciseKey) { setLoading(false); return }

    const logsCacheKey = cacheKey(uid, equipmentSlug, exerciseKey, 'logs')
    const analyticsCacheKey = cacheKey(uid, equipmentSlug, exerciseKey, 'analytics')

    // Try cache first
    const cachedLogs = getFromCache(logsCacheKey)
    const cachedAnalytics = getFromCache(analyticsCacheKey)

    if (cachedLogs && cachedAnalytics) {
      setLogs(reviveDates(cachedLogs))
      setAnalytics(reviveDates(cachedAnalytics))
      setLoading(false)
      return
    }

    // Fetch from Firestore – logs and analytics in parallel
    try {
      const basePath = `userWorkouts/${uid}/${equipmentSlug}/${exerciseKey}`

      const [logsSnap, analyticsSnap] = await Promise.all([
        getDocs(collection(db, basePath, 'logs')).catch(() => ({ docs: [] })),
        getDocs(collection(db, basePath, 'analytics')).catch(() => ({ docs: [] })),
      ])

      const fetchedLogs = logsSnap.docs.map(d => ({
        id: d.id,
        _equipment: equipmentSlug,
        _exercise: exerciseKey,
        ...d.data(),
      }))

      const fetchedAnalytics = analyticsSnap.docs.map(d => ({
        id: d.id,
        ...d.data(),
      }))

      // Cache serialised copies
      setToCache(logsCacheKey, serializeDates(fetchedLogs))
      setToCache(analyticsCacheKey, serializeDates(fetchedAnalytics))

      setLogs(fetchedLogs)
      setAnalytics(fetchedAnalytics)
    } catch (err) {
      console.error('[useExerciseStats] fetch error:', err)
    } finally {
      setLoading(false)
    }
  }, [uid, equipmentSlug, exerciseKey])

  useEffect(() => {
    if (fetchedRef.current) return
    fetchedRef.current = true
    fetchData()
  }, [fetchData])

  return { logs, analytics, loading, refetch: fetchData }
}
