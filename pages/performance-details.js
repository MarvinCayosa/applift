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
