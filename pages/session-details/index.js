/**
 * Session Details Page
 *
 * Revamped session summary page displaying workout analytics
 * fetched from Firestore (logs + analytics) and GCS (sensor data).
 *
 * Route: /session-details?logId=xxx&eq=equipment&ex=exercise&type=dumbbell
 *
 * Also supports legacy query params from the existing exercise page:
 *   logId, eq (equipment slug), ex (exercise slug), type (equipment type)
 */

import { useRouter } from 'next/router';
import Head from 'next/head';
import { useMemo } from 'react';

import useSessionDetailsData from '../../hooks/useSessionDetailsData';
import HeaderSection from '../../components/sessionDetails/HeaderSection';
import MovementGraphCard from '../../components/sessionDetails/MovementGraphCard';
import ExecutionQualityCard from '../../components/sessionDetails/ExecutionQualityCard';
import ExecutionConsistencyCard from '../../components/sessionDetails/ExecutionConsistencyCard';
import FatigueCarousel from '../../components/sessionDetails/FatigueCarousel';
import MovementPhasesSection from '../../components/sessionDetails/MovementPhasesSection';
import WorkoutProgressCard from '../../components/sessionDetails/WorkoutProgressCard';
import SessionDetailsSkeleton from '../../components/sessionDetails/SessionDetailsSkeleton';
import BottomNav from '../../components/BottomNav';
import { equipmentConfig } from '../../components/equipment';

export default function SessionDetailsPage() {
  const router = useRouter();
  const { logId, eq, ex, type } = router.query;

  // Resolve exercise image and equipment primary color from equipmentConfig
  const { exerciseImage, primaryColor } = useMemo(() => {
    const slug = type || eq || '';
    const cfg = equipmentConfig[slug];
    if (!cfg) return { exerciseImage: null, primaryColor: '#a855f7' };
    const exCfg = cfg.exercises.find(
      (e) => e.key === ex || e.firestoreNames?.includes(ex)
    );
    return {
      exerciseImage: exCfg?.image || null,
      primaryColor: cfg.primary || '#a855f7',
    };
  }, [type, eq, ex]);

  const { viewModel, isLoading, gcsLoading, error } = useSessionDetailsData({
    logId,
    equipment: eq || '',
    exercise: ex || '',
  });

  // Wait for Next.js router hydration (query params empty on refresh until isReady)
  if (!router.isReady) {
    return (
      <>
        <Head><title>Session Details — AppLift</title></Head>
        <SessionDetailsSkeleton />
      </>
    );
  }

  // Error state
  if (!isLoading && (error || !viewModel) && logId) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-white/50">{error || 'Session not found'}</p>
          <button onClick={() => router.back()} className="text-blue-400 text-sm">
            Go back
          </button>
        </div>
      </div>
    );
  }

  // Loading state
  if (isLoading || !viewModel) {
    return (
      <>
        <Head>
          <title>Session Details — AppLift</title>
        </Head>
        <SessionDetailsSkeleton />
      </>
    );
  }

  const vm = viewModel;

  const handleSeeMore = () => {
    router.push({
      pathname: '/performance-details',
      query: {
        workoutName: vm.exerciseName,
        equipment: vm.equipmentName,
        setsData: JSON.stringify(vm.mergedSetsData),
        recommendedSets: vm.sets,
        recommendedReps: vm.reps,
        workoutId: vm.workoutId,
      },
    });
  };

  return (
    <>
      <Head>
        <title>{vm.exerciseName || 'Session Details'} — AppLift</title>
      </Head>

      <div className="min-h-screen bg-black text-white pb-24">
        {/* Hero Header */}
        <HeaderSection
          exerciseName={vm.exerciseName}
          date={vm.date}
          weight={vm.weight}
          weightUnit={vm.weightUnit}
          sets={vm.sets}
          reps={vm.reps}
          restTimeSec={vm.restTimeSec}
          totalTime={vm.totalTime}
          calories={vm.calories}
          isRecommendation={vm.isRecommendation}
          isCustomSet={vm.isCustomSet}
          exerciseImage={exerciseImage}
          primaryColor={primaryColor}
        />

        {/* Content cards */}
        <div className="px-4 pt-2.5 sm:pt-3.5 space-y-3 max-w-2xl mx-auto">
          {/* Movement Graph */}
          <MovementGraphCard
            gcsData={vm.gcsData}
            chartData={vm.chartData}
            setsData={vm.mergedSetsData}
            onSeeMore={handleSeeMore}
          />
          {gcsLoading && (
            <div className="rounded-2xl bg-white/[0.05] h-10 animate-pulse flex items-center justify-center">
              <p className="text-white/20 text-xs">Loading sensor data…</p>
            </div>
          )}

          {/* Workout Progress - Total Reps */}
          <WorkoutProgressCard
            setsData={vm.mergedSetsData}
            plannedSets={vm.plannedSets}
            plannedRepsPerSet={vm.plannedRepsPerSet}
            totalReps={vm.totalReps}
            totalSets={vm.totalSets}
            weight={vm.weight}
            weightUnit={vm.weightUnit}
            equipment={vm.equipmentName}
          />

          {/* Execution Quality + Consistency — 2-column row */}
          <div className="grid grid-cols-2 gap-3">
            <ExecutionQualityCard
              setsData={vm.mergedSetsData}
              gcsData={vm.gcsData}
              selectedSet="all"
            />
            <ExecutionConsistencyCard
              setsData={vm.mergedSetsData}
              analysisScore={vm.consistencyScore}
            />
          </div>

          {/* Fatigue + Velocity Loss — swipeable carousel */}
          <FatigueCarousel
            setsData={vm.mergedSetsData}
            fatigueScore={vm.fatigueScore}
            fatigueLevel={vm.fatigueLevel}
            selectedSet="all"
          />

          {/* Movement Phases */}
          <MovementPhasesSection
            avgConcentric={vm.avgConcentric}
            avgEccentric={vm.avgEccentric}
            concentricPercent={vm.concentricPercent}
            eccentricPercent={vm.eccentricPercent}
            setsData={vm.mergedSetsData}
          />
        </div>

        <BottomNav />
      </div>
    </>
  );
}
