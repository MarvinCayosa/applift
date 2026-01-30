import { useEffect, useRef, useState } from 'react';

export default function WorkoutSummaryCard({ 
  workoutName, 
  equipment, 
  chartData, 
  timeData,
  totalCalories,
  totalWorkoutTime,
  setsData,
  totalReps
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
            label: `Set ${set.setNumber || idx + 1}`,
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
    <div className="w-full bg-white/5 backdrop-blur-sm rounded-3xl p-5 shadow-xl border border-white/10">
      {/* Title Section */}
      <div className="mb-3">
        <h2 className="text-xl font-bold text-white mb-1">{workoutName || 'Training'}</h2>
        <p className="text-xs text-gray-400">{equipment || 'Your performance'}</p>
      </div>

      {/* Chart Container */}
      <div className="relative h-48 rounded-2xl overflow-hidden mb-4 bg-white/5 border border-white/10">
        <canvas ref={canvasRef} className="w-full h-full" />
      </div>

      {/* Metrics Display - 3 cards with icons */}
      <div className="grid grid-cols-3 gap-2">
        {/* Total Reps and Sets */}
        <div className="flex flex-col items-center justify-center bg-transparent p-1">
          <div className="flex items-center gap-1 mb-1">
            <img 
              src="/images/equipment-icon/Barbell.png" 
              alt="Reps" 
              className="w-4 h-4 object-contain"
              style={{ filter: 'drop-shadow(0 0 12px rgba(168, 85, 247, 1)) drop-shadow(0 0 20px rgba(168, 85, 247, 0.6))' }}
            />
            <span className="text-[9px] text-gray-400">Reps & Sets</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-2xl font-bold text-purple-300">{setsData?.length || 0}</span>
            <span className="text-xl font-bold text-white">x</span>
            <span className="text-2xl font-bold text-white">{setsData?.length ? Math.round(totalReps / setsData.length) : totalReps || 0}</span>
          </div>
        </div>

        {/* Time Duration */}
        <div className="flex flex-col items-center justify-center bg-transparent p-1">
          <div className="flex items-center gap-1 mb-1">
            <img 
              src="/images/icons/time.png" 
              alt="Time" 
              className="w-4 h-4 object-contain"
              style={{ filter: 'drop-shadow(0 0 12px rgba(59, 130, 246, 1)) drop-shadow(0 0 20px rgba(59, 130, 246, 0.6))' }}
            />
            <span className="text-[9px] text-gray-400">Time</span>
          </div>
          <span className="text-2xl font-bold text-white">{formatTime(totalWorkoutTime || 0)}</span>
        </div>

        {/* Calories Burnt */}
        <div className="flex flex-col items-center justify-center bg-transparent p-1">
          <div className="flex items-center gap-1 mb-1">
            <img 
              src="/images/icons/burn.png" 
              alt="Calories" 
              className="w-4 h-4 object-contain"
              style={{ filter: 'drop-shadow(0 0 8px rgba(249, 115, 22, 0.8))' }}
            />
            <span className="text-[9px] text-gray-400">Calories</span>
          </div>
          <div className="flex items-baseline gap-0.5">
            <span className="text-2xl font-bold text-white">{totalCalories || 0}</span>
            <span className="text-xs text-gray-400">kcal</span>
          </div>
        </div>
      </div>
    </div>
  );
}
