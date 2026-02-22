/**
 * Chart data helpers for Session Details movement graph.
 * Transforms GCS workout_data.json into chart-ready segments.
 */

/** Set colour palette — same as WorkoutSummaryCard / OverallChartCard */
export const SET_COLORS = [
  { stroke: '#a855f7', fill: 'rgba(168, 85, 247, 0.6)' },  // Purple
  { stroke: '#eab308', fill: 'rgba(234, 179, 8, 0.6)' },   // Yellow
  { stroke: '#ef4444', fill: 'rgba(239, 68, 68, 0.6)' },   // Red
  { stroke: '#22c55e', fill: 'rgba(34, 197, 94, 0.6)' },   // Green
  { stroke: '#3b82f6', fill: 'rgba(59, 130, 246, 0.6)' },   // Blue
  { stroke: '#f97316', fill: 'rgba(249, 115, 22, 0.6)' },   // Orange
];

/**
 * Build per-set segments from GCS workout_data.json
 *
 * Each segment: { setNumber, data: number[], color }
 *
 * @param {Object} gcsData – parsed workout_data.json (has .sets array)
 * @returns {{ segments: Array, allData: number[] }}
 */
export function buildChartSegments(gcsData) {
  if (!gcsData?.sets || gcsData.sets.length === 0) return { segments: [], allData: [] };

  const segments = [];
  const allData = [];

  gcsData.sets.forEach((setObj, si) => {
    const setNum = setObj.setNumber || si + 1;
    const color = SET_COLORS[si % SET_COLORS.length];
    const setData = [];

    (setObj.reps || []).forEach((rep) => {
      const samples = rep.samples || [];
      samples.forEach((s) => {
        const v = Math.abs(s.filteredMag ?? s.accelMag ?? 0);
        setData.push(v);
        allData.push(v);
      });
    });

    if (setData.length > 0) {
      segments.push({ setNumber: setNum, data: setData, color });
    }
  });

  return { segments, allData };
}

/**
 * Build segments from analysisUI chartData + setsData
 * (when GCS data is not available but analysis produced chartData)
 */
export function buildChartSegmentsFromAnalysis(chartData, setsData) {
  if (!chartData || chartData.length === 0) return { segments: [], allData: [] };

  const allData = chartData.map((d) => Math.abs(d));

  if (!setsData || setsData.length === 0) {
    return {
      segments: [{ setNumber: 1, data: allData, color: SET_COLORS[0] }],
      allData,
    };
  }

  const segments = [];
  let idx = 0;

  setsData.forEach((set, si) => {
    const repCount = set.repsData?.length || set.reps || 0;
    // Estimate data points per set
    const pointsPerSet = Math.floor(allData.length / setsData.length);
    const endIdx = si === setsData.length - 1 ? allData.length : idx + pointsPerSet;
    const data = allData.slice(idx, endIdx);
    idx = endIdx;

    segments.push({
      setNumber: set.setNumber || si + 1,
      data,
      color: SET_COLORS[si % SET_COLORS.length],
    });
  });

  return { segments, allData };
}
