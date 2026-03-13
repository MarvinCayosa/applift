import { useCallback } from 'react'
import { AuthProvider, useAuth } from '../context/AuthContext'
import { BluetoothProvider } from '../context/BluetoothProvider'
import { WorkoutLoggingProvider } from '../context/WorkoutLoggingContext'
import { UserProfileProvider } from '../utils/userProfileStore'
import { useNetworkConnectionWatcher } from '../hooks/useNetworkConnectionWatcher'
import { flushQueue } from '../utils/offlineQueue'

/**
 * Global offline-queue flusher for authenticated routes.
 */
function GlobalOfflineSync() {
  const { user } = useAuth()

  const uploadJob = useCallback(async (job) => {
    if (job.type !== 'gcs_upload') return
    const { filePath, content, contentType, userId: jobUserId } = job.payload
    const token = user ? await user.getIdToken() : null
    if (!token) throw new Error('No auth token')

    const resp = await fetch('/api/imu-stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        action: 'upload',
        userId: jobUserId,
        filePath,
        contentType: contentType || 'application/json',
      }),
    })
    if (!resp.ok) throw new Error(`Signed URL failed: ${resp.status}`)
    const { signedUrl } = await resp.json()

    const up = await fetch(signedUrl, {
      method: 'PUT',
      headers: { 'Content-Type': contentType || 'application/json' },
      body: content,
    })
    if (!up.ok) throw new Error(`GCS upload failed: ${up.status}`)
    console.log('[GlobalSync] Uploaded:', filePath)
  }, [user])

  const handleOnline = useCallback(async () => {
    if (!user) return
    try {
      const result = await flushQueue(uploadJob)
      if (result.uploaded > 0) {
        console.log(`[GlobalSync] Flushed ${result.uploaded} offline job(s)`)
      }
    } catch (err) {
      console.warn('[GlobalSync] Flush failed:', err)
    }
  }, [user, uploadJob])

  useNetworkConnectionWatcher({ onOnline: handleOnline, activeProbe: false })
  return null
}

export default function AppProviders({ children }) {
  return (
    <AuthProvider>
      <GlobalOfflineSync />
      <BluetoothProvider>
        <WorkoutLoggingProvider>
          <UserProfileProvider>{children}</UserProfileProvider>
        </WorkoutLoggingProvider>
      </BluetoothProvider>
    </AuthProvider>
  )
}
