/**
 * Shared Workout View Page
 *
 * Public read-only page that is an exact clone of Session Details.
 * Route: /shared/[id]
 *
 * No authentication required. No back button, no BottomNav.
 * Uses the same components as session-details for identical layout.
 * Link expires after 24 hours with a countdown indicator.
 */

import { useRouter } from 'next/router';
import Head from 'next/head';
import { useState, useEffect, useMemo } from 'react';

import { AIInsightsAccordion } from '../../components/aiInsights';
import HeaderSection from '../../components/sessionDetails/HeaderSection';
import GraphBreakdownCarousel from '../../components/workoutFinished/GraphBreakdownCarousel';
import RepByRepCard from '../../components/workoutFinished/RepByRepCard';
import ExecutionQualityCard from '../../components/sessionDetails/ExecutionQualityCard';
import ExecutionConsistencyCard from '../../components/sessionDetails/ExecutionConsistencyCard';
import FatigueCarousel from '../../components/sessionDetails/FatigueCarousel';
import MovementPhasesSection from '../../components/sessionDetails/MovementPhasesSection';
import SessionDetailsSkeleton from '../../components/sessionDetails/SessionDetailsSkeleton';
import { equipmentConfig } from '../../components/equipment';

// ─── Expiry Countdown Component ──────────────────────────────────────────────

function ExpiryCountdown({ expiresAt }) {
  const [timeLeft, setTimeLeft] = useState(null);

  useEffect(() => {
    if (!expiresAt) return;

    const target = new Date(expiresAt).getTime();

    function update() {
      const diff = target - Date.now();
      if (diff <= 0) {
        setTimeLeft(0);
        return;
      }
      setTimeLeft(diff);
    }

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  if (timeLeft === null) return null;

  if (timeLeft <= 0) {
    return (
      <div className="mx-4 mt-3 rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-2.5 flex items-center gap-2.5">
        <svg className="w-4 h-4 text-red-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span className="text-xs text-red-400 font-medium">This share link has expired</span>
      </div>
    );
  }

  const hours = Math.floor(timeLeft / (1000 * 60 * 60));
  const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((timeLeft % (1000 * 60)) / 1000);

  const isUrgent = timeLeft < 1000 * 60 * 60; // less than 1 hour

  return (
    <div className={`mx-4 mt-3 rounded-xl px-4 py-2.5 flex items-center gap-2.5 ${
      isUrgent
        ? 'bg-amber-500/10 border border-amber-500/20'
        : 'bg-white/[0.04] border border-white/[0.06]'
    }`}>
      <svg className={`w-4 h-4 shrink-0 ${isUrgent ? 'text-amber-400' : 'text-white/40'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <span className={`text-xs font-medium ${isUrgent ? 'text-amber-400' : 'text-white/40'}`}>
        Link expires in{' '}
        <span className={`font-bold ${isUrgent ? 'text-amber-300' : 'text-white/60'}`}>
          {hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m ${seconds}s`}
        </span>
      </span>
    </div>
  );
}

// ─── Page Component ──────────────────────────────────────────────────────────

export default function SharedWorkoutPage() {
  const router = useRouter();
  const { id } = router.query;

  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expired, setExpired] = useState(false);

  // Fetch shared workout data
  useEffect(() => {
    if (!id) return;
    setLoading(true);
    fetch(`/api/get-shared-workout?id=${id}`)
      .then(res => {
        if (res.status === 410) {
          setExpired(true);
          throw new Error('expired');
        }
        if (!res.ok) throw new Error('Workout not found');
        return res.json();
      })
      .then(data => {
        setSession(data.session);
        setLoading(false);
      })
      .catch(err => {
        if (err.message !== 'expired') setError(err.message);
        setLoading(false);
      });
  }, [id]);

  // Resolve exercise image and equipment primary color from equipmentConfig
  const { exerciseImage, primaryColor } = useMemo(() => {
    if (!session) return { exerciseImage: null, primaryColor: '#a855f7' };
    const slug = (session.equipmentName || '').toLowerCase().replace(/\s+/g, '-');
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

  // Loading state
  if (loading || !router.isReady) {
    return (
      <>
        <Head><title>Shared Workout — AppLift</title></Head>
        <SessionDetailsSkeleton />
      </>
    );
  }

  // Expired state
  if (expired) {
    return (
      <>
        <Head><title>Link Expired — AppLift</title></Head>
        <div className="min-h-screen bg-black flex items-center justify-center">
          <div className="text-center space-y-3 px-6">
            <div className="w-16 h-16 mx-auto rounded-full bg-white/5 flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-red-400/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-white/60 text-lg font-medium">Link Expired</p>
            <p className="text-white/30 text-sm">This share link has expired after 24 hours.<br />Ask the user to share the workout again.</p>
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
            <p className="text-white/30 text-sm">This share link may be invalid.</p>
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

      <div className="min-h-screen bg-black text-white pb-8">
        {/* Hero Header — same as session-details, no back button, with branding */}
        <HeaderSection
          exerciseName={s.exerciseName}
          date={s.date}
          weight={s.weight}
          weightUnit={s.weightUnit}
          sets={s.sets || s.plannedSets}
          reps={s.reps || s.plannedReps || s.plannedRepsPerSet}
          restTimeSec={s.restTimeSec}
          totalTime={s.totalTime}
          calories={s.calories}
          isRecommendation={s.isRecommendation}
          isCustomSet={s.isCustomSet}
          exerciseImage={exerciseImage}
          primaryColor={primaryColor}
          totalSets={s.totalSets}
          totalReps={s.totalReps}
          hideBack
        />

        {/* Expiry countdown */}
        <ExpiryCountdown expiresAt={s.expiresAt} />

        {/* Content cards — identical to session-details layout */}
        <div className="px-4 pt-2.5 sm:pt-3.5 space-y-3 max-w-2xl mx-auto">
          {/* AI Session Summary — collapsible accordion */}
          {s.aiInsights && (
            <AIInsightsAccordion insights={s.aiInsights} />
          )}

          {/* Movement Graph + Workout Breakdown + ROM — swipable carousel */}
          <GraphBreakdownCarousel
            setsData={s.setsData || []}
            chartData={s.chartData || []}
            totalReps={s.totalReps}
            plannedReps={(s.plannedSets || s.totalSets || 0) * (s.plannedRepsPerSet || s.reps || s.plannedReps || 0)}
            completedSets={s.totalSets}
            plannedSets={s.plannedSets || s.totalSets || 0}
            weight={s.weight}
            weightUnit={s.weightUnit}
            equipment={s.equipmentName}
            onSeeMore={() => {
              const el = document.getElementById('shared-rep-by-rep');
              if (el) el.scrollIntoView({ behavior: 'smooth' });
            }}
          />

          {/* Execution Quality + Consistency — 2-column row */}
          <div className="grid grid-cols-2 gap-3">
            <ExecutionQualityCard
              setsData={s.setsData || []}
              selectedSet="all"
            />
            <ExecutionConsistencyCard
              setsData={s.setsData || []}
              analysisScore={s.consistencyScore}
            />
          </div>

          {/* Fatigue + Velocity Loss — swipeable carousel */}
          <FatigueCarousel
            setsData={s.setsData || []}
            fatigueScore={s.fatigueScore}
            fatigueLevel={s.fatigueLevel}
            selectedSet="all"
          />

          {/* Movement Phases */}
          <MovementPhasesSection
            avgConcentric={s.avgConcentric}
            avgEccentric={s.avgEccentric}
            concentricPercent={s.concentricPercent}
            eccentricPercent={s.eccentricPercent}
            setsData={s.setsData || []}
          />

          {/* Rep by Rep Analysis Section */}
          <div id="shared-rep-by-rep" className="pt-2">
            <div className="rounded-2xl bg-[#1a1a1a] p-4" style={{ minHeight: 400 }}>
              <RepByRepCard
                setsData={JSON.stringify(s.setsData || [])}
                parsedSetsData={s.setsData || []}
                recommendedSets={s.plannedSets || s.totalSets || 0}
              />
            </div>
          </div>

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
