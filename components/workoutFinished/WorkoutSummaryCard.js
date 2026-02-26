import { useEffect, useRef, useState, useMemo } from 'react';

export default function WorkoutSummaryCard({ 
  workoutName, 
  equipment, 
  chartData, 
  timeData,
  totalCalories,
  totalWorkoutTime,
  setsData,
  totalReps,
  weight = 0,
  weightUnit = 'kg',
  recommendedSets = 0,
  recommendedReps = 0,
  onSeeMore
}) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);
  const [hoveredSet, setHoveredSet] = useState(null);

  // Debug logging
  useEffect(() => {
    console.log('WorkoutSummaryCard - setsData:', setsData);
    console.log('WorkoutSummaryCard - setsData length:', setsData?.length);
  }, [setsData]);

  // Define distinct colors for different sets - easier to distinguish
  const setColors = [
    { border: '#a855f7', bg: 'rgba(168, 85, 247, 0.6)' },    // Purple - Set 1
    { border: '#eab308', bg: 'rgba(234, 179, 8, 0.6)' },     // Yellow - Set 2
    { border: '#ef4444', bg: 'rgba(239, 68, 68, 0.6)' },     // Red - Set 3
    { border: '#22c55e', bg: 'rgba(34, 197, 94, 0.6)' },     // Green - Set 4
    { border: '#3b82f6', bg: 'rgba(59, 130, 246, 0.6)' },    // Blue - Set 5
    { border: '#f97316', bg: 'rgba(249, 115, 22, 0.6)' },    // Orange - Set 6
  ];

  useEffect(() => {
    if (!canvasRef.current || typeof window === 'undefined' || !chartData || chartData.length === 0) return;

    // Lazy load Chart.js
    import('chart.js/auto').then(({ Chart }) => {
      const ctx = canvasRef.current.getContext('2d');
      
      // Destroy existing chart
      if (chartRef.current) {
        chartRef.current.destroy();
      }

      // Create datasets per set with different colors
      let datasets = [];
      
      if (setsData && setsData.length > 0) {
        const totalDataPoints = chartData.length;
        let currentIndex = 0;

        setsData.forEach((set, idx) => {
          const pointsPerSet = Math.floor(totalDataPoints / setsData.length);
          const endIndex = idx === setsData.length - 1 ? totalDataPoints : currentIndex + pointsPerSet;
          const color = setColors[idx % setColors.length];
          
          // Create data array with null values for other sets' positions
          const setData = chartData.map((value, index) => {
            if (index >= currentIndex && index < endIndex) {
              return value;
            }
            return null;
          });
          
          datasets.push({
            label: `Set ${set.setNumber || idx + 1}${set.incomplete ? ' ⚠' : ''}`,
            data: setData,
            borderColor: color.border,
            backgroundColor: function(context) {
              const chart = context.chart;
              const {ctx, chartArea} = chart;
              
              if (!chartArea) {
                return null;
              }
              
              const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
              const rgb = color.border === '#a855f7' ? '168, 85, 247' :    // Purple
                          color.border === '#eab308' ? '234, 179, 8' :      // Yellow
                          color.border === '#ef4444' ? '239, 68, 68' :      // Red
                          color.border === '#22c55e' ? '34, 197, 94' :      // Green
                          color.border === '#3b82f6' ? '59, 130, 246' :     // Blue
                          color.border === '#f97316' ? '249, 115, 22' :     // Orange
                          '168, 85, 247'; // Default purple
              
              gradient.addColorStop(0, `rgba(${rgb}, 0.6)`);
              gradient.addColorStop(0.5, `rgba(${rgb}, 0.3)`);
              gradient.addColorStop(1, `rgba(${rgb}, 0.05)`);
              return gradient;
            },
            borderWidth: 3,
            pointRadius: 0,
            tension: 0.4,
            fill: 'origin',
            shadowOffsetX: 0,
            shadowOffsetY: 0,
            shadowBlur: 20,
            shadowColor: `${color.border}99`,
            spanGaps: false, // Don't connect null values
          });
          
          currentIndex = endIndex;
        });
      } else {
        // Single dataset with purple color if no sets data
        datasets = [{
          label: 'Acceleration',
          data: chartData,
          borderColor: '#8b5cf6',
          backgroundColor: function(context) {
            const chart = context.chart;
            const {ctx, chartArea} = chart;
            
            if (!chartArea) {
              return null;
            }
            
            const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
            gradient.addColorStop(0, 'rgba(139, 92, 246, 0.8)');
            gradient.addColorStop(0.2, 'rgba(139, 92, 246, 0.6)');
            gradient.addColorStop(0.4, 'rgba(139, 92, 246, 0.4)');
            gradient.addColorStop(0.6, 'rgba(139, 92, 246, 0.2)');
            gradient.addColorStop(0.8, 'rgba(139, 92, 246, 0.1)');
            gradient.addColorStop(1, 'rgba(139, 92, 246, 0)');
            return gradient;
          },
          borderWidth: 3,
          pointRadius: 0,
          tension: 0.4,
          fill: 'origin',
          shadowOffsetX: 0,
          shadowOffsetY: 0,
          shadowBlur: 20,
          shadowColor: 'rgba(139, 92, 246, 0.6)',
        }];
      }

      chartRef.current = new Chart(ctx, {
        type: 'line',
        data: {
          labels: timeData || Array.from({ length: chartData.length }, (_, i) => i),
          datasets: datasets
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: {
            duration: 0
          },
          interaction: {
            mode: 'index',
            intersect: false,
          },
          scales: {
            x: {
              display: true,
              title: {
                display: false
              },
              ticks: {
                display: false
              },
              grid: {
                display: false,
                drawBorder: false
              }
            },
            y: {
              display: true,
              title: {
                display: false
              },
              ticks: {
                display: false
              },
              grid: {
                display: true,
                color: 'rgba(255, 255, 255, 0.1)',
                lineWidth: 0.5,
                drawBorder: false
              },
              min: -2,
              max: 18,
              grace: 0
            }
          },
          plugins: {
            legend: {
              display: false
            },
            tooltip: {
              enabled: true,
              backgroundColor: 'rgba(0, 0, 0, 0.9)',
              titleColor: 'rgba(255, 255, 255, 0.95)',
              bodyColor: 'rgba(255, 255, 255, 0.8)',
              borderColor: 'rgba(168, 85, 247, 0.5)',
              borderWidth: 1,
              padding: 12,
              cornerRadius: 8,
              displayColors: true,
              callbacks: {
                title: function(context) {
                  return context[0].dataset.label; // Show "Set 1", "Set 2", etc.
                },
                labelColor: function(context) {
                  return {
                    borderColor: context.dataset.borderColor,
                    backgroundColor: context.dataset.borderColor
                  };
                }
              }
            }
          }
        }
      });
    });

    return () => {
      if (chartRef.current) {
        chartRef.current.destroy();
      }
    };
  }, [chartData, timeData, setsData]);

  // Format time helper - display as mm:ss
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${String(secs).padStart(2, '0')}`;
  };

  return (
    <div className="w-full rounded-3xl bg-white/5 backdrop-blur-sm p-5 shadow-xl content-fade-up-1">
      {/* Title Section */}
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex-1">
          <h2 className="text-xl font-bold text-white mb-1">{workoutName || 'Training'}</h2>
          <p className="text-xs text-gray-400">{equipment || 'Your performance'}</p>
        </div>
        
        {/* See More button */}
        {onSeeMore && (
          <button
            onClick={onSeeMore}
            className="text-sm text-purple-400 hover:text-purple-300 transition-colors font-medium flex items-center gap-1 mt-1 shrink-0"
          >
            See More
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        )}
      </div>

      {/* Chart Container */}
      <div className="relative h-48 rounded-2xl overflow-hidden bg-black/30">
        <canvas ref={canvasRef} className="w-full h-full" />
      </div>

      {/* Stats Bar - Sets & Reps, Time, Calories */}
      <div className="flex items-center justify-between mt-4 px-2">
        {/* Sets & Reps */}
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 8h16M4 16h16" />
          </svg>
          <div>
            <p className="text-[10px] text-gray-500 font-medium">Sets & Reps</p>
            <p className="text-lg font-bold text-white">{setsData?.length || 0} x {recommendedReps || totalReps}</p>
          </div>
        </div>

        {/* Divider */}
        <div className="w-px h-8 bg-white/10" />

        {/* Time */}
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <circle cx="12" cy="12" r="10" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2" />
          </svg>
          <div>
            <p className="text-[10px] text-gray-500 font-medium">Time</p>
            <p className="text-lg font-bold text-white">{formatTime(totalWorkoutTime)}</p>
          </div>
        </div>

        {/* Divider */}
        <div className="w-px h-8 bg-white/10" />

        {/* Calories */}
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M12.395 2.553a1 1 0 00-1.45-.385c-.345.23-.614.558-.822.88-.214.33-.403.713-.57 1.116-.334.804-.614 1.768-.84 2.734a31.365 31.365 0 00-.613 3.58 2.64 2.64 0 01-.945-1.067c-.328-.68-.398-1.534-.398-2.654A1 1 0 005.05 6.05 6.981 6.981 0 003 11a7 7 0 1011.95-4.95c-.592-.591-.98-.985-1.348-1.467-.363-.476-.724-1.063-1.207-2.03zM12.12 15.12A3 3 0 017 13s.879.5 2.5.5c0-1 .5-4 1.25-4.5.5 1 .786 1.293 1.371 1.879A2.99 2.99 0 0113 13a2.99 2.99 0 01-.879 2.121z" clipRule="evenodd" />
          </svg>
          <div>
            <p className="text-[10px] text-gray-500 font-medium">Calories</p>
            <p className="text-lg font-bold text-white">{totalCalories}<span className="text-xs text-gray-400 ml-0.5">kcal</span></p>
          </div>
        </div>
      </div>
    </div>
  );
}
