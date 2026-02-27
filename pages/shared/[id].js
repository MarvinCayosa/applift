/**
 * Shared Workout View Page
 *
 * Public read-only page displaying a shared workout summary.
 * Route: /shared/[id]
 *
 * No authentication required. No back/edit/save buttons.
 * Just the workout summary for sharing with coaches.
 */

import { useRouter } from 'next/router';
import Head from 'next/head';
import { useState, useEffect, useMemo } from 'react';
import Image from 'next/image';
import { equipmentConfig } from '../../components/equipment';

// ─── Utility ─────────────────────────────────────────────────────────────────

function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return '0sec';
  if (seconds < 60) return `${seconds}sec`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
      ' at ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  } catch { return ''; }
}

// ML classification severity mapping (matching ExecutionQualityCard)
const PREDICTION_1_LABELS = ['Uncontrolled Movement', 'Uncontrolled', 'Pulling Too Fast', 'Pull Fast'];
const PREDICTION_2_LABELS = [
  'Abrupt Initiation', 'Abrupt', 'Inclination Asymmetry', 'Inclination',
  'Releasing Too Fast', 'Release Fast', 'Poor Form', 'Bad Form',
];

function getSeverityColor(label) {
  if (label === 'Clean') return '#22c55e';
  if (PREDICTION_1_LABELS.some(l => label?.includes(l))) return '#f59e0b';
  if (PREDICTION_2_LABELS.some(l => label?.includes(l))) return '#ef4444';
  return '#f59e0b'; // default mild
}

// ─── Page Component ──────────────────────────────────────────────────────────

export default function SharedWorkoutPage() {
  const router = useRouter();
  const { id } = router.query;

  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch shared workout data
  useEffect(() => {
    if (!id) return;
    setLoading(true);
    fetch(`/api/get-shared-workout?id=${id}`)
      .then(res => {
        if (!res.ok) throw new Error('Workout not found');
        return res.json();
      })
      .then(data => {
        setSession(data.session);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, [id]);

  // Resolve exercise image
  const { exerciseImage, primaryColor } = useMemo(() => {
    if (!session) return { exerciseImage: null, primaryColor: '#a855f7' };
    const slug = (session.equipmentName || '').toLowerCase().replace(/\s+/g, '-');
    // Try both slug and original
    const cfg = equipmentConfig[slug] || equipmentConfig[(session.equipmentName || '').toLowerCase()];
    if (!cfg) return { exerciseImage: null, primaryColor: '#a855f7' };
    const exCfg = cfg.exercises?.find(
      e => e.key === session.exerciseName || e.name === session.exerciseName ||
           e.firestoreNames?.includes(session.exerciseName)
    );
    return {
      exerciseImage: exCfg?.image || cfg?.heroImage || null,
      primaryColor: cfg.primary || '#a855f7',
    };
  }, [session]);

  // Compute execution quality from setsData
  const executionQuality = useMemo(() => {
    if (!session?.setsData?.length) return null;
    if (session.mlClassification) {
      return session.mlClassification;
    }
    // Fallback: compute from rep classifications
    const allReps = session.setsData.flatMap(s => s.repsData || []);
    if (!allReps.length) return null;
    const dist = {};
    allReps.forEach(r => {
      const label = typeof r.classification === 'string' ? r.classification
        : r.classification?.label || (r.quality === 'good' ? 'Clean' : null);
      if (label) dist[label] = (dist[label] || 0) + 1;
    });
    const total = Object.values(dist).reduce((a, b) => a + b, 0);
    if (total === 0) return null;
    const distPct = {};
    for (const [k, v] of Object.entries(dist)) {
      distPct[k] = Math.round((v / total) * 100);
    }
    return {
      cleanPercentage: distPct['Clean'] || 0,
      distributionPercent: distPct,
    };
  }, [session]);

  // ROM analysis
  const romData = useMemo(() => {
    if (!session?.setsData?.length) return null;
    const firstCal = session.setsData.find(s => s.romCalibrated && s.targetROM);
    if (!firstCal) return null;
    const baselineROM = firstCal.targetROM;
    const romUnit = firstCal.romUnit || '°';
    const allReps = session.setsData.flatMap(s => s.repsData || []);
    const repsWithROM = allReps.filter(r => r.rom != null);
    if (!repsWithROM.length) return null;
    const avgROM = repsWithROM.reduce((s, r) => s + (parseFloat(r.rom) || 0), 0) / repsWithROM.length;
    const fulfillment = baselineROM > 0 ? Math.min(100, Math.round((avgROM / baselineROM) * 100)) : null;
    return { baselineROM, avgROM, fulfillment, romUnit };
  }, [session]);

  // Loading state
  if (loading || !router.isReady) {
    return (
      <>
        <Head><title>Shared Workout — AppLift</title></Head>
        <div className="min-h-screen bg-black flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-white/50 text-sm">Loading workout...</p>
          </div>
        </div>
      </>
    );
  }

  // Error state
  if (error || !session) {
    return (
      <>
        <Head><title>Workout Not Found — AppLift</title></Head>
        <div className="min-h-screen bg-black flex items-center justify-center">
          <div className="text-center space-y-3 px-6">
            <div className="w-16 h-16 mx-auto rounded-full bg-white/5 flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-white/60 text-lg font-medium">Workout not found</p>
            <p className="text-white/30 text-sm">This share link may have expired or is invalid.</p>
          </div>
        </div>
      </>
    );
  }

  const s = session;

  return (
    <>
      <Head>
        <title>{s.exerciseName || 'Workout'} — Shared on AppLift</title>
        <meta name="description" content={`${s.exerciseName} workout session shared from AppLift`} />
        <meta property="og:title" content={`${s.exerciseName || 'Workout'} — AppLift`} />
        <meta property="og:description" content={`${s.totalSets} sets × ${s.totalReps} reps at ${s.weight}${s.weightUnit}`} />
      </Head>

      <div className="min-h-screen bg-black text-white">
        {/* ── Hero Header ── */}
        <div className="relative w-full overflow-hidden">
          {exerciseImage ? (
            <>
              <img src={exerciseImage} alt="" className="absolute inset-0 w-full h-full object-cover" aria-hidden />
              <div className="absolute inset-0" style={{
                background: 'linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.20) 40%, rgba(0,0,0,0.65) 70%, rgb(0,0,0) 100%)',
              }} />
            </>
          ) : (
            <div className="absolute inset-0 bg-gradient-to-b from-zinc-900 to-black" />
          )}

          <div className="relative z-10 px-5 pt-8 pb-5">
            {/* AppLift branding */}
            <div className="flex items-center justify-center gap-2 mb-4">
              <div className="w-6 h-6 rounded-lg bg-purple-600 flex items-center justify-center">
                <svg className="w-4 h-4 text-white" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd" />
                </svg>
              </div>
              <span className="text-sm text-white/60 font-medium">Shared from AppLift</span>
            </div>

            {/* Title */}
            <div className="text-center mb-1">
              <h1 className="text-[22px] font-bold text-white leading-tight tracking-tight">
                {s.exerciseName || 'Workout Session'}
              </h1>
              {s.date && (
                <p className="text-[13px] mt-1 text-gray-300">{formatDate(s.date)}</p>
              )}
              {s.displayName && (
                <p className="text-[12px] mt-0.5 text-gray-500">by {s.displayName}</p>
              )}
            </div>

            {/* Weight + Stats */}
            <div className="flex items-stretch gap-2.5 mt-4 mb-3">
              <div className="flex flex-col items-center justify-center rounded-2xl p-4 shrink-0"
                style={{ backgroundColor: primaryColor, width: 120, minHeight: 88 }}>
                <div className="flex items-baseline gap-[2px]">
                  <span className="text-5xl font-bold text-white leading-none">{s.weight || '—'}</span>
                  <span className="text-[13px] text-white/90 font-semibold">{s.weightUnit}</span>
                </div>
                <span className="text-[11px] text-white/60 mt-0.5 font-medium">Weight</span>
              </div>
              <div className="flex-1 rounded-2xl backdrop-blur-md flex items-center justify-evenly"
                style={{ backgroundColor: 'rgb(0 0 0 / 65%)' }}>
                <StatItem value={s.totalSets || '—'} label="Sets" />
                <div className="w-px self-stretch my-5 bg-white/[0.08]" />
                <StatItem value={s.plannedReps || '—'} label="Reps" />
                <div className="w-px self-stretch my-5 bg-white/[0.08]" />
                <StatItem value={s.totalReps || '—'} label="Total" />
              </div>
            </div>

            {/* Time & Calories */}
            <div className="flex justify-center mt-2">
              <div className="inline-flex items-center gap-4 rounded-2xl py-3 px-5" style={{ backgroundColor: 'rgb(1 1 1 / 72%)' }}>
                <div className="text-center">
                  <p className="text-[11px] text-gray-500">Time</p>
                  <p className="text-xl font-bold text-white">{formatDuration(s.totalTime)}</p>
                </div>
                <div className="w-px h-9 bg-white/[0.08]" />
                <div className="text-center">
                  <p className="text-[11px] text-gray-500">Burn</p>
                  <p className="text-xl font-bold text-white">{s.calories || 0} <span className="text-[11px] text-gray-500 font-normal">kcal</span></p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Content Cards ── */}
        <div className="px-4 pt-3 space-y-3 max-w-2xl mx-auto pb-8">

          {/* AI Session Summary */}
          {s.aiInsights?.summary && (
            <div className="rounded-2xl bg-[#1a1a1a] p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center">
                  <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <h3 className="text-base font-bold text-white">AI Session Summary</h3>
              </div>
              <p className="text-sm text-gray-300 leading-relaxed">{s.aiInsights.summary}</p>
              {s.aiInsights.bullets?.length > 0 && (
                <ul className="mt-3 space-y-1.5">
                  {s.aiInsights.bullets.map((b, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-gray-400">
                      <span className="text-purple-400 mt-0.5">•</span>
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Execution Quality */}
          {executionQuality && (
            <div className="rounded-2xl bg-[#1a1a1a] p-4">
              <h3 className="text-base font-bold text-white mb-3">Execution Quality</h3>
              <div className="flex items-center gap-4 mb-3">
                <div className="relative w-20 h-20">
                  <svg viewBox="0 0 80 80" className="w-full h-full -rotate-90">
                    <circle cx="40" cy="40" r="34" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8" />
                    <circle
                      cx="40" cy="40" r="34" fill="none"
                      stroke={executionQuality.cleanPercentage >= 70 ? '#22c55e' : executionQuality.cleanPercentage >= 50 ? '#f59e0b' : '#ef4444'}
                      strokeWidth="8" strokeLinecap="round"
                      strokeDasharray={`${2 * Math.PI * 34}`}
                      strokeDashoffset={`${2 * Math.PI * 34 * (1 - (executionQuality.cleanPercentage || 0) / 100)}`}
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-lg font-bold text-white">{executionQuality.cleanPercentage}%</span>
                  </div>
                </div>
                <div className="flex-1 text-sm">
                  <p className="text-gray-400 mb-0.5">Clean Reps</p>
                  <p className="text-white font-semibold text-lg">{executionQuality.cleanPercentage}%</p>
                </div>
              </div>
              {executionQuality.distributionPercent && (
                <div className="space-y-2">
                  {Object.entries(executionQuality.distributionPercent)
                    .sort(([, a], [, b]) => b - a)
                    .map(([label, pct]) => (
                      <div key={label} className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: getSeverityColor(label) }} />
                        <span className="text-xs text-gray-400 flex-1">{label}</span>
                        <div className="w-24 h-1.5 rounded-full bg-white/10 overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: getSeverityColor(label) }} />
                        </div>
                        <span className="text-xs text-gray-500 w-8 text-right">{pct}%</span>
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}

          {/* ROM Analysis */}
          {romData && (
            <div className="rounded-2xl bg-[#1a1a1a] p-4">
              <h3 className="text-base font-bold text-white mb-3">ROM Analysis</h3>
              <div className="flex justify-center mb-3">
                <FulfillmentRing value={romData.fulfillment} />
              </div>
              <div className="flex items-center justify-center gap-6">
                <div className="text-center">
                  <p className="text-[10px] text-gray-500 font-medium mb-0.5">Benchmark</p>
                  <p className="text-2xl font-bold text-white">
                    {romData.baselineROM.toFixed(1)}
                    <span className="text-xs text-gray-400">{romData.romUnit}</span>
                  </p>
                </div>
                <div className="w-px h-10 bg-white/10" />
                <div className="text-center">
                  <p className="text-[10px] text-gray-500 font-medium mb-0.5">Actual</p>
                  <p className="text-2xl font-bold text-white">
                    {romData.avgROM.toFixed(1)}
                    <span className="text-xs text-gray-400">{romData.romUnit}</span>
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Set Breakdown */}
          {s.setsData?.length > 0 && (
            <div className="rounded-2xl bg-[#1a1a1a] p-4">
              <h3 className="text-base font-bold text-white mb-3">Set Breakdown</h3>
              <div className="space-y-2">
                {s.setsData.map((set, idx) => {
                  const reps = set.repsData || [];
                  const avgVel = reps.length > 0
                    ? (reps.reduce((sum, r) => sum + (r.peakVelocity || 0), 0) / reps.length).toFixed(2)
                    : null;
                  const avgSmooth = reps.length > 0
                    ? Math.round(reps.reduce((sum, r) => sum + (r.smoothnessScore || 0), 0) / reps.length)
                    : null;
                  return (
                    <div key={idx} className="flex items-center gap-3 bg-white/[0.04] rounded-xl p-3">
                      <div className="w-10 h-10 rounded-lg bg-purple-600/20 flex items-center justify-center shrink-0">
                        <span className="text-sm font-bold text-purple-400">S{set.setNumber || idx + 1}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white">{reps.length} reps</p>
                        <div className="flex items-center gap-3 text-[11px] text-gray-500">
                          {avgVel && avgVel > 0 && <span>{avgVel} m/s</span>}
                          {avgSmooth != null && avgSmooth > 0 && <span>Smooth: {avgSmooth}</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Fatigue & Consistency */}
          {(s.fatigueScore != null || s.consistencyScore != null) && (
            <div className="grid grid-cols-2 gap-3">
              {s.fatigueScore != null && (
                <div className="rounded-2xl bg-[#1a1a1a] p-4 text-center">
                  <p className="text-[11px] text-gray-500 mb-1">Fatigue</p>
                  <p className={`text-3xl font-bold ${
                    s.fatigueScore <= 25 ? 'text-green-400' :
                    s.fatigueScore <= 50 ? 'text-yellow-400' : 'text-red-400'
                  }`}>{s.fatigueScore}%</p>
                  <p className="text-[10px] text-gray-600 mt-0.5">{s.fatigueLevel || 'Low'}</p>
                </div>
              )}
              {s.consistencyScore != null && (
                <div className="rounded-2xl bg-[#1a1a1a] p-4 text-center">
                  <p className="text-[11px] text-gray-500 mb-1">Consistency</p>
                  <p className={`text-3xl font-bold ${
                    s.consistencyScore >= 80 ? 'text-green-400' :
                    s.consistencyScore >= 60 ? 'text-yellow-400' : 'text-red-400'
                  }`}>{s.consistencyScore}%</p>
                </div>
              )}
            </div>
          )}

          {/* Movement Phases */}
          {(s.avgConcentric > 0 || s.avgEccentric > 0) && (
            <div className="rounded-2xl bg-[#1a1a1a] p-4">
              <h3 className="text-base font-bold text-white mb-3">Movement Phases</h3>
              <div className="flex gap-4">
                <div className="flex-1 text-center">
                  <div className="w-1.5 h-10 bg-gradient-to-b from-teal-500 to-cyan-400 rounded-full mx-auto mb-1.5" />
                  <p className="text-xl font-bold text-white">{s.avgConcentric?.toFixed(2) || '—'}s</p>
                  <p className="text-[11px] text-gray-500">Concentric</p>
                </div>
                <div className="flex-1 text-center">
                  <div className="w-1.5 h-10 bg-gradient-to-b from-yellow-500 to-orange-400 rounded-full mx-auto mb-1.5" />
                  <p className="text-xl font-bold text-white">{s.avgEccentric?.toFixed(2) || '—'}s</p>
                  <p className="text-[11px] text-gray-500">Eccentric</p>
                </div>
              </div>
            </div>
          )}

          {/* Footer branding */}
          <div className="text-center pt-4 pb-2">
            <p className="text-[11px] text-gray-600">
              Tracked with <span className="text-purple-400 font-semibold">AppLift</span>
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

/* ── Stat column ── */
function StatItem({ value, label }) {
  return (
    <div className="flex flex-col items-center py-2">
      <span className="text-[28px] font-bold leading-none text-white">{value ?? '—'}</span>
      <span className="text-[11px] text-gray-400 mt-1 font-medium">{label}</span>
    </div>
  );
}

/* ── ROM Fulfillment Ring ── */
function FulfillmentRing({ value }) {
  const size = 100;
  const stroke = 8;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = value != null ? Math.min(100, Math.max(0, value)) : 0;
  const offset = circumference * (1 - pct / 100);
  const color = pct >= 80 ? '#22c55e' : pct >= 60 ? '#eab308' : '#ef4444';
  const textColor = pct >= 80 ? 'text-green-400' : pct >= 60 ? 'text-yellow-400' : 'text-red-400';

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} className="w-full h-full -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke={color}
          strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-2xl font-bold leading-none ${textColor}`}>
          {value != null ? `${value}%` : '—'}
        </span>
        <span className="text-[10px] text-gray-500 mt-1">ROM Match</span>
      </div>
    </div>
  );
}
