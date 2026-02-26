import { useRouter } from 'next/router';
import Head from 'next/head';
import { useEffect, useState, useRef, useMemo } from 'react';
import WFHeaderSection from '../components/workoutFinished/WFHeaderSection';
import GraphBreakdownCarousel from '../components/workoutFinished/GraphBreakdownCarousel';
import ExecutionQualityCard from '../components/sessionDetails/ExecutionQualityCard';
import ExecutionConsistencyCard from '../components/sessionDetails/ExecutionConsistencyCard';
import FatigueCarousel from '../components/sessionDetails/FatigueCarousel';
import MovementPhasesSection from '../components/sessionDetails/MovementPhasesSection';
import { useWorkoutLogging } from '../context/WorkoutLoggingContext';
import { useWorkoutStreak } from '../utils/useWorkoutStreak';
import { useWorkoutAnalysis, transformAnalysisForUI } from '../hooks/useWorkoutAnalysis';
import LoadingScreen from '../components/LoadingScreen';

export default function WorkoutFinished() {
  const router = useRouter();
  const { completeLog, cancelLog, uploadProgress, logError, hasActiveLog, getWorkoutData } = useWorkoutLogging();
  const { recordWorkout } = useWorkoutStreak();
  const { analyzeWorkout, getAnalysis, analysis, isAnalyzing, error: analysisError } = useWorkoutAnalysis();
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [isAutoSaving, setIsAutoSaving] = useState(true); // Auto-saving state
  const [analysisData, setAnalysisData] = useState(null);
  const hasCompletedLog = useRef(false);
  const hasTriggeredAnalysis = useRef(false);
  const isReturningFromDetails = useRef(false);
  const { 
    workoutName, 
    equipment, 
    totalReps, 
    calories,
    totalTime,
    avgConcentric,
    avgEccentric,
    chartData,
    timeData,
    repsData,
    setsData,
    hasCSV,
    recommendedSets,
    recommendedReps,
    weight,
    weightUnit,
    workoutId,
    gcsPath
  } = router.query;

  // Parse JSON data from query params
  const parsedChartData = chartData ? JSON.parse(chartData) : [];
  const parsedTimeData = timeData ? JSON.parse(timeData) : [];
  const parsedRepsData = repsData ? JSON.parse(repsData) : [];
  const parsedSetsData = setsData ? JSON.parse(setsData) : [];
  
  // Debug logging
  useEffect(() => {
    console.log('=== WORKOUT FINISHED DEBUG ===');
    console.log('Query params - setsData (raw):', setsData);
    console.log('Query params - totalReps:', totalReps);
    console.log('Query params - recommendedSets:', recommendedSets);
    console.log('Query params - recommendedReps:', recommendedReps);
    console.log('Query params - workoutId:', workoutId);
    console.log('Query params - gcsPath:', gcsPath);
    console.log('Parsed setsData:', parsedSetsData);
    console.log('Parsed setsData length:', parsedSetsData?.length);
    console.log('Parsed chartData length:', parsedChartData?.length);
    console.log('Analysis data:', analysisData);
    console.log('Each set detail:');
    parsedSetsData.forEach((set, idx) => {
      console.log(`  Set ${idx + 1}:`, {
        setNumber: set.setNumber,
        reps: set.reps,
        repsDataLength: set.repsData?.length
      });
    });
    console.log('==============================');
  }, [setsData, totalReps, recommendedSets, recommendedReps, parsedSetsData, parsedChartData, workoutId, gcsPath, analysisData]);
  
  // Transform analysis data when it arrives
  useEffect(() => {
    if (analysis) {
      console.log('📊 Analysis received:', analysis);
      const transformed = transformAnalysisForUI(analysis);
      setAnalysisData(transformed);
      
      // Cache analysis in sessionStorage for persistence
      if (workoutId && typeof window !== 'undefined') {
        try {
          sessionStorage.setItem(`analysis_${workoutId}`, JSON.stringify(transformed));
          console.log('💾 Cached analysis for workoutId:', workoutId);
        } catch (err) {
          console.warn('Failed to cache analysis:', err);
        }
      }
    }
  }, [analysis, workoutId]);

  // Check for cached analysis on mount (for refresh or navigation back)
  useEffect(() => {
    if (!workoutId || analysisData || isAnalyzing) return;
    
    if (typeof window !== 'undefined') {
      // Check if we're returning from performance-details
      const returningFlag = sessionStorage.getItem(`returning_${workoutId}`);
      if (returningFlag) {
        isReturningFromDetails.current = true;
        sessionStorage.removeItem(`returning_${workoutId}`); // Clean up
      }
      
      try {
        const cached = sessionStorage.getItem(`analysis_${workoutId}`);
        if (cached) {
          console.log('✅ Loaded cached analysis for workoutId:', workoutId);
          const parsed = JSON.parse(cached);
          setAnalysisData(parsed);
          hasTriggeredAnalysis.current = true; // Prevent re-analysis
          setIsAutoSaving(false); // Mark as not processing
        }
      } catch (err) {
        console.warn('Failed to load cached analysis:', err);
      }
    }
  }, [workoutId, analysisData, isAnalyzing]);

  // IMPORTANT: Always use parsedSetsData as the structural source of truth (correct rep counts).
  // The analysis API re-parses IMU data and may detect different rep counts.
  // We only merge analysis enrichments (classification, smoothnessScore) into the local data.
  const mergedSetsData = useMemo(() => {
    if (!parsedSetsData || parsedSetsData.length === 0) return [];
    if (!analysisData?.setsData || analysisData.setsData.length === 0) return parsedSetsData;

    return parsedSetsData.map((localSet, setIdx) => {
      const analysisSet = analysisData.setsData.find(s => s.setNumber === localSet.setNumber)
        || analysisData.setsData[setIdx];

      if (!analysisSet) return localSet;

      // Merge set-level classification from analysis
      const mergedSet = {
        ...localSet,
        classification: analysisSet.classification || localSet.classification || null,
      };

      // Merge rep-level enrichments (classification, smoothnessScore) if rep counts match
      if (localSet.repsData && analysisSet.repsData && localSet.repsData.length === analysisSet.repsData.length) {
        mergedSet.repsData = localSet.repsData.map((localRep, repIdx) => {
          const analysisRep = analysisSet.repsData[repIdx];
          return {
            ...localRep,
            classification: analysisRep?.classification || localRep.classification || null,
            smoothnessScore: analysisRep?.smoothnessScore ?? localRep.smoothnessScore,
            quality: analysisRep?.quality || localRep.quality,
            // Merge phase timing data from analysis
            liftingTime: analysisRep?.liftingTime ?? localRep.liftingTime ?? 0,
            loweringTime: analysisRep?.loweringTime ?? localRep.loweringTime ?? 0,
            // Merge real velocity (m/s from accelerometer integration) and ROM from analysis
            peakVelocity: analysisRep?.peakVelocity ?? localRep.peakVelocity,
            rom: analysisRep?.rom ?? localRep.rom,
            chartData: analysisRep?.chartData?.length > 0 ? analysisRep.chartData : localRep.chartData,
          };
        });
      } else if (analysisSet.repsData && analysisSet.repsData.length > 0) {
        // Rep counts don't match — use analysis reps directly (they have phase/classification data)
        console.warn(`[MergedSetsData] Set ${localSet.setNumber}: local has ${localSet.repsData?.length} reps, analysis has ${analysisSet.repsData?.length} — using analysis reps`);
        mergedSet.repsData = analysisSet.repsData;
        mergedSet.reps = analysisSet.repsData.length;
      } else {
        // No analysis reps at all — keep local reps
        console.warn(`[MergedSetsData] Set ${localSet.setNumber}: no analysis reps available — keeping local reps`);
      }

      return mergedSet;
    });
  }, [parsedSetsData, analysisData]);
  
  // Trigger analysis after workout data is saved
  const triggerAnalysis = async (wkId, path) => {
    if (hasTriggeredAnalysis.current) return;
    hasTriggeredAnalysis.current = true;
    
    // If returning from details page, skip analysis (already cached)
    if (isReturningFromDetails.current) {
      console.log('↩️ Returning from details page, skipping analysis');
      return;
    }
    
    console.log('🔬 Checking for existing analysis...');
    
    // First, try to get existing analysis from Firestore
    try {
      const existingAnalysis = await getAnalysis(wkId);
      if (existingAnalysis) {
        console.log('✅ Found existing analysis in Firestore, skipping re-analysis');
        return;
      }
    } catch (err) {
      console.warn('Could not fetch existing analysis, will run new analysis:', err);
    }
    
    // No existing analysis, run new analysis
    console.log('🔬 Running new workout analysis...');
    try {
      const result = await analyzeWorkout({ 
        workoutId: wkId,
        gcsPath: path
      });
      if (result) {
        console.log('✅ Analysis completed:', result);
      }
    } catch (err) {
      console.error('❌ Analysis failed:', err);
    }
  };
  
  // Auto-complete the workout log immediately when page loads
  useEffect(() => {
    const autoCompleteWorkout = async () => {
      // Only run once and if we have an active log
      if (hasCompletedLog.current || !hasActiveLog) {
        setIsAutoSaving(false);
        // If we have workoutId/gcsPath from query, trigger analysis
        if (workoutId || gcsPath) {
          await triggerAnalysis(workoutId, gcsPath);
        }
        
        // FIX: ALWAYS update streak even if log was already completed elsewhere
        // This ensures streak is recorded regardless of how the workout was saved
        try {
          console.log('[WorkoutFinished] Recording streak (no active log flow)...');
          const streakResult = await recordWorkout(new Date());
          console.log('[WorkoutFinished] Streak updated successfully (no active log):', streakResult);
          setTimeout(() => {
            window.dispatchEvent(new Event('streak-updated'));
          }, 100);
        } catch (streakError) {
          console.error('[WorkoutFinished] Failed to update streak (no active log):', streakError);
        }
        
        return;
      }
      
      hasCompletedLog.current = true;
      console.log('🏁 Auto-completing workout log on page load...');
      
      try {
        // Get workout results from sessionStorage
        const resultsStr = typeof window !== 'undefined' 
          ? sessionStorage.getItem('workoutResults') 
          : null;
        const results = resultsStr ? JSON.parse(resultsStr) : {
          totalSets: parseInt(recommendedSets) || parsedSetsData?.length || 0,
          totalReps: parseInt(totalReps) || 0,
          totalTime: parseInt(totalTime) || 0,
          calories: parseInt(calories) || 0,
          avgConcentric: parseFloat(avgConcentric) || 0,
          avgEccentric: parseFloat(avgEccentric) || 0,
          setData: parsedSetsData || [],
        };

        // Complete the workout log (uploads IMU data and saves to Firestore)
        const completeResult = await completeLog(results);
        
        if (completeResult) {
          console.log('✅ Workout log auto-completed successfully');
          
          // Get the workout data to extract gcsPath and workoutId for analysis
          const workoutData = getWorkoutData?.();
          const savedWorkoutId = completeResult?.workoutId || workoutData?.workoutId || workoutId;
          const savedGcsPath = completeResult?.gcsPath || workoutData?.gcsPath || gcsPath;
          
          console.log('📍 Workout saved:', { savedWorkoutId, savedGcsPath });
          
          // Trigger analysis with the saved workout data
          if (savedWorkoutId || savedGcsPath) {
            await triggerAnalysis(savedWorkoutId, savedGcsPath);
          }
          
          // Update workout streak
          try {
            console.log('[WorkoutFinished] About to record workout for streak...');
            const streakResult = await recordWorkout(new Date());
            console.log('[WorkoutFinished] Streak updated successfully:', streakResult);
            
            // Force a small delay and refresh to ensure UI updates
            setTimeout(() => {
              window.dispatchEvent(new Event('streak-updated'));
            }, 100);
          } catch (streakError) {
            console.error('[WorkoutFinished] Failed to update streak:', streakError);
          }
        } else {
          console.warn('⚠️ Failed to auto-complete workout log');
          setSaveError('Failed to auto-save workout');
        }
      } catch (error) {
        console.error('Auto-complete error:', error);
        setSaveError(error.message || 'Failed to auto-save workout');
      } finally {
        setIsAutoSaving(false);
      }
    };
    
    // Small delay to ensure page is fully loaded
    const timer = setTimeout(autoCompleteWorkout, 500);
    return () => clearTimeout(timer);
  }, [hasActiveLog, completeLog, recordWorkout, totalReps, totalTime, calories, avgConcentric, avgEccentric, recommendedSets, parsedSetsData, workoutId, gcsPath, getWorkoutData]);
  
  // CSV download state
  const [csvAvailable, setCsvAvailable] = useState(false);
  
  // Whether the full loading overlay should show (saving + analysis must both finish)
  const isProcessing = isAutoSaving || isAnalyzing;
  
  useEffect(() => {
    // Check if CSV is available in sessionStorage
    if (typeof window !== 'undefined' && hasCSV === 'true') {
      const csv = sessionStorage.getItem('workoutCSV');
      setCsvAvailable(!!csv);
    }
  }, [hasCSV]);
  
  const downloadCSV = () => {
    if (typeof window === 'undefined') return;
    
    const csvContent = sessionStorage.getItem('workoutCSV');
    const filename = sessionStorage.getItem('workoutCSVFilename') || 'applift_workout.csv';
    
    if (!csvContent) {
      alert('CSV data not available');
      return;
    }
    
    // Create and download the CSV file
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  // Handle going back without saving (cancel the log)
  const handleGoBack = async () => {
    if (hasActiveLog) {
      // Ask for confirmation
      const confirmed = confirm('Are you sure you want to leave? Your workout data will not be saved.');
      if (!confirmed) return;
      
      // Cancel the log
      await cancelLog('user_abandoned');
    }
    
    // Clean up sessionStorage
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('workoutCSV');
      sessionStorage.removeItem('workoutCSVFilename');
      sessionStorage.removeItem('workoutResults');
    }
    
    router.push('/dashboard');
  };

  // Loading message
  const loadingMessage = isAutoSaving ? 'Saving workout...' : 'Analyzing workout data...';

  if (isProcessing) {
    return <LoadingScreen message={loadingMessage} />;
  }

  // ── handleSeeMore – navigate to performance details ──
  const handleSeeMore = () => {
    if (typeof window !== 'undefined' && workoutId) {
      sessionStorage.setItem(`returning_${workoutId}`, 'true');
    }
    router.push({
      pathname: '/performance-details',
      query: {
        workoutName,
        equipment,
        setsData: JSON.stringify(mergedSetsData),
        recommendedSets,
        recommendedReps,
        workoutId,
        analysisData: analysisData ? JSON.stringify({
          fatigue: analysisData.rawAnalysis?.fatigue,
          consistency: analysisData.rawAnalysis?.consistency,
          insights: analysisData.insights,
        }) : null,
      },
    });
  };

  // ── handleContinue – navigate away after save ──
  const handleContinue = async () => {
    if (!isAutoSaving && hasCompletedLog.current) {
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('workoutCSV');
        sessionStorage.removeItem('workoutCSVFilename');
        sessionStorage.removeItem('workoutResults');
      }
      router.push('/workouts');
      return;
    }
    if (isAutoSaving || isSaving) return;

    setIsSaving(true);
    setSaveError(null);
    try {
      const resultsStr = typeof window !== 'undefined'
        ? sessionStorage.getItem('workoutResults') : null;
      const results = resultsStr ? JSON.parse(resultsStr) : {
        totalSets: parseInt(recommendedSets) || parsedSetsData?.length || 0,
        totalReps: parseInt(totalReps) || 0,
        totalTime: parseInt(totalTime) || 0,
        calories: parseInt(calories) || 0,
        avgConcentric: parseFloat(avgConcentric) || 0,
        avgEccentric: parseFloat(avgEccentric) || 0,
        setData: parsedSetsData || [],
      };
      if (hasActiveLog && !hasCompletedLog.current) {
        const success = await completeLog(results);
        hasCompletedLog.current = true;
        if (!success) throw new Error('Failed to save workout');
        try {
          const streakResult = await recordWorkout(new Date());
          setTimeout(() => window.dispatchEvent(new Event('streak-updated')), 100);
        } catch (e) { console.error('Streak error:', e); }
      }
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('workoutCSV');
        sessionStorage.removeItem('workoutCSVFilename');
        sessionStorage.removeItem('workoutResults');
      }
      router.push('/workouts');
    } catch (error) {
      console.error('Error saving workout:', error);
      setSaveError(error.message || 'Failed to save workout. Please try again.');
      setIsSaving(false);
    }
  };

  return (
    <>
      <Head>
        <title>Workout Completed — AppLift</title>
      </Head>

      <div className="min-h-screen bg-black text-white pb-6">
        {/* ── Hero Header (matches session-details design) ── */}
        <WFHeaderSection
          workoutName={workoutName}
          equipment={equipment}
          weight={parseFloat(weight) || 0}
          weightUnit={weightUnit || 'kg'}
          recommendedSets={parseInt(recommendedSets) || 0}
          recommendedReps={parseInt(recommendedReps) || 0}
          totalTime={parseInt(totalTime) || 0}
          calories={analysisData?.calories || parseInt(calories) || 0}
          totalSets={mergedSetsData?.length || 0}
          totalReps={parseInt(totalReps) || 0}
          onBack={handleGoBack}
        />

        {/* ── Content cards ── */}
        <div className="px-4 pt-2.5 sm:pt-3.5 space-y-3 max-w-2xl mx-auto">
          {/* Movement Graph + Workout Breakdown + ROM — swipable carousel */}
          <GraphBreakdownCarousel
            setsData={mergedSetsData}
            chartData={parsedChartData}
            analysisChartData={analysisData?.chartData}
            totalReps={parseInt(totalReps) || 0}
            plannedReps={(parseInt(recommendedSets) || 0) * (parseInt(recommendedReps) || 0)}
            completedSets={mergedSetsData?.length || 0}
            plannedSets={parseInt(recommendedSets) || 0}
            weight={parseFloat(weight) || 0}
            weightUnit={weightUnit || 'kg'}
            equipment={equipment || ''}
            onSeeMore={handleSeeMore}
          />

          {/* Execution Quality + Consistency — 2-column row */}
          <div className="grid grid-cols-2 gap-3">
            <ExecutionQualityCard
              setsData={mergedSetsData}
              selectedSet="all"
            />
            <ExecutionConsistencyCard
              setsData={mergedSetsData}
              analysisScore={analysisData?.consistencyScore}
              inconsistentRepIndex={analysisData?.inconsistentRepIndex}
            />
          </div>

          {/* Fatigue + Velocity Loss — swipeable carousel */}
          <FatigueCarousel
            setsData={mergedSetsData}
            fatigueScore={analysisData?.fatigueScore}
            fatigueLevel={analysisData?.fatigueLevel}
            selectedSet="all"
          />

          {/* Movement Phases */}
          <MovementPhasesSection
            avgConcentric={analysisData?.avgConcentric}
            avgEccentric={analysisData?.avgEccentric}
            concentricPercent={analysisData?.concentricPercent}
            eccentricPercent={analysisData?.eccentricPercent}
            setsData={mergedSetsData}
          />

          {/* Analysis error */}
          {analysisError && (
            <div className="bg-yellow-500/20 border border-yellow-500/50 rounded-xl p-3 text-center">
              <p className="text-sm text-yellow-400">Analysis unavailable: Using local data</p>
            </div>
          )}

          {/* Save error */}
          {(saveError || logError) && (
            <div className="bg-red-500/20 border border-red-500/50 rounded-xl p-3 text-center">
              <p className="text-sm text-red-400">{saveError || logError}</p>
            </div>
          )}

          {/* Continue button */}
          <button
            onClick={handleContinue}
            disabled={isAutoSaving || isSaving}
            className={`w-full py-3.5 rounded-full font-semibold text-white text-base transition-all ${
              (isAutoSaving || isSaving)
                ? 'bg-gray-600 cursor-not-allowed'
                : 'bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 shadow-lg shadow-purple-500/30'
            }`}
          >
            {(isAutoSaving || isSaving) ? (
              <span className="flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Saving...
              </span>
            ) : (
              'Continue'
            )}
          </button>
        </div>
      </div>
    </>
  );
}

