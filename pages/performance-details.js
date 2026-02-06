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
    recommendedReps
  } = router.query;

  // Parse JSON data from query params
  const parsedSetsData = setsData ? JSON.parse(setsData) : [];

  return (
    <div className="min-h-screen bg-black text-white">
      <Head>
        <title>Performance Details — AppLift</title>
      </Head>
      
      {/* Scrollable content - Full height layout */}
      <div className="flex flex-col h-screen overflow-hidden max-w-2xl mx-auto">
        
        {/* Header with back button and title */}
        <div className="px-4 pt-4 pb-2 flex-shrink-0">
          <PerformanceHeader 
            workoutName={workoutName}
            equipment={equipment}
          />
        </div>

        {/* Rep by rep section - Takes remaining height */}
        <div className="flex-1 overflow-hidden px-4 pb-4">
          <RepByRepCard 
            setsData={setsData}
            parsedSetsData={parsedSetsData}
            recommendedSets={recommendedSets}
          />
        </div>
      </div>
    </div>
  );
}
