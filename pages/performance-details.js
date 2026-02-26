import { useRouter } from 'next/router';
import Head from 'next/head';
import PerformanceHeader from '../components/workoutFinished/PerformanceHeader';
import RepByRepCard from '../components/workoutFinished/RepByRepCard';

export default function PerformanceDetails() {
  const router = useRouter();
  const { 
    workoutName,
    equipment,
    setsData,
    recommendedSets,
    recommendedReps,
    workoutId,
    analysisData: analysisDataRaw
  } = router.query;

  // Parse JSON data from query params
  const parsedSetsData = setsData ? JSON.parse(setsData) : [];
  const analysisData = analysisDataRaw ? JSON.parse(analysisDataRaw) : null;

  // Extract ROM calibration info from the first set that has it
  const firstCalibratedSet = parsedSetsData.find(s => s.romCalibrated && s.targetROM);
  const hasROMBaseline = !!firstCalibratedSet;
  const baselineROM = firstCalibratedSet?.targetROM;
  const romUnit = firstCalibratedSet?.romUnit || '°';

  // Calculate average ROM fulfillment across all reps
  const allReps = parsedSetsData.flatMap(s => s.repsData || []);
  const repsWithROM = allReps.filter(r => r.romFulfillment != null);
  const avgFulfillment = repsWithROM.length > 0 
    ? Math.round(repsWithROM.reduce((sum, r) => sum + r.romFulfillment, 0) / repsWithROM.length)
    : null;

  return (
    <div className="min-h-screen bg-black text-white">
      <Head>
        <title>Performance Details — AppLift</title>
      </Head>
      
      {/* Scrollable content - Full height layout with safe area support */}
      <div className="flex flex-col h-screen overflow-hidden max-w-2xl mx-auto">
        
        {/* Header with back button and title - Safe area top padding */}
        <div className="px-3 sm:px-4 pb-2 flex-shrink-0 pt-2.5 sm:pt-3.5 pt-pwa-dynamic">
          <PerformanceHeader 
            workoutName={workoutName}
            equipment={equipment}
          />
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 sm:px-4" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
          {/* ROM Baseline Summary */}
          {hasROMBaseline && (
            <div className="mb-4 rounded-2xl bg-white/5 border border-white/10 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center">
                    <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                  </div>
                  <div>
                    <span className="text-xs text-gray-400 block">Calibrated Baseline</span>
                    <span className="text-sm font-semibold text-white">{baselineROM.toFixed(1)}{romUnit}</span>
                  </div>
                </div>
                {avgFulfillment != null && (
                  <div className="text-right">
                    <span className="text-xs text-gray-400 block">Avg Fulfillment</span>
                    <span className={`text-sm font-bold ${avgFulfillment >= 80 ? 'text-green-400' : avgFulfillment >= 60 ? 'text-yellow-400' : 'text-red-400'}`}>
                      {avgFulfillment}%
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Rep by rep carousel section */}
          <div className="flex-1" style={{ minHeight: '60vh' }}>
            <RepByRepCard 
              setsData={setsData}
              parsedSetsData={parsedSetsData}
              recommendedSets={recommendedSets}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
