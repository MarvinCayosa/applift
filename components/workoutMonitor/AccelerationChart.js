import { useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';

const Chart = dynamic(() => import('chart.js/auto').then(mod => mod.Chart), { ssr: false });

export default function AccelerationChart({ timeData, rawData, filteredData, thresholdHigh, thresholdLow }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current || typeof window === 'undefined') return;

    // Lazy load Chart.js
    import('chart.js/auto').then(({ Chart }) => {
      const ctx = canvasRef.current.getContext('2d');
      
      // Destroy existing chart
      if (chartRef.current) {
        chartRef.current.destroy();
      }

      chartRef.current = new Chart(ctx, {
        type: 'line',
        data: {
          labels: timeData,
          datasets: [
            // REMOVED: Raw Acceleration line - no longer displayed
            {
              label: 'Filtered (Kalman)',
              data: filteredData,
              borderColor: '#8b5cf6',
              backgroundColor: function(context) {
                const chart = context.chart;
                const {ctx, chartArea} = chart;
                
                if (!chartArea) {
                  // This case happens on initial chart load
                  return null;
                }
                
                // Create gradient
                const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
                gradient.addColorStop(0, 'rgba(139, 92, 246, 0.8)');    // Top: solid violet
                gradient.addColorStop(0.2, 'rgba(139, 92, 246, 0.6)');
                gradient.addColorStop(0.4, 'rgba(139, 92, 246, 0.4)');
                gradient.addColorStop(0.6, 'rgba(139, 92, 246, 0.2)');
                gradient.addColorStop(0.8, 'rgba(139, 92, 246, 0.1)');
                gradient.addColorStop(1, 'rgba(139, 92, 246, 0)');      // Bottom: transparent
                return gradient;
              },
              borderWidth: 3,
              pointRadius: 0,
              tension: 0.4, // Smooth curves
              fill: 'origin', // Fill to the x-axis
              shadowOffsetX: 0,
              shadowOffsetY: 0,
              shadowBlur: 20,
              shadowColor: 'rgba(139, 92, 246, 0.6)', // Violet glow effect
            },
            {
              label: 'High Threshold',
              data: Array(timeData.length).fill(thresholdHigh),
              borderColor: 'rgba(251, 191, 36, 0.35)', // Amber/yellow - 50% lower opacity
              backgroundColor: 'transparent',
              borderWidth: 2,
              borderDash: [8, 4], // Dashed line pattern
              pointRadius: 0,
              fill: false,
              tension: 0
            },
            {
              label: 'Low Threshold',
              data: Array(timeData.length).fill(thresholdLow),
              borderColor: 'rgba(34, 211, 238, 0.35)', // Cyan/blue - 50% lower opacity
              backgroundColor: 'transparent',
              borderWidth: 2,
              borderDash: [8, 4], // Dashed line pattern
              pointRadius: 0,
              fill: false,
              tension: 0
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: {
            duration: 0 // Disable for performance with real-time data
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
                labelColor: function(context) {
                  if (context.datasetIndex === 0) {
                    return {
                      borderColor: 'rgba(168, 85, 247, 1)',
                      backgroundColor: 'rgba(168, 85, 247, 1)'
                    };
                  }
                  return {
                    borderColor: context.dataset.borderColor,
                    backgroundColor: context.dataset.borderColor
                  };
                }
              }
            }
          }
        },
        plugins: [{
          // Custom plugin to add glow effect to the filtered line
          id: 'glowEffect',
          beforeDatasetsDraw: (chart) => {
            const ctx = chart.ctx;
            chart.data.datasets.forEach((dataset, i) => {
              if (i === 0 && chart.isDatasetVisible(i)) { // Only for filtered line
                const meta = chart.getDatasetMeta(i);
                if (!meta.hidden) {
                  ctx.save();
                  ctx.shadowColor = 'rgba(168, 85, 247, 1)';
                  ctx.shadowBlur = 30;
                  ctx.shadowOffsetX = 0;
                  ctx.shadowOffsetY = 0;
                  ctx.restore();
                }
              }
            });
          }
        }]
      });
    });

    return () => {
      if (chartRef.current) {
        chartRef.current.destroy();
      }
    };
  }, [timeData, filteredData, thresholdHigh, thresholdLow]);

  return (
    <div className="absolute inset-0 w-full h-full" style={{ paddingTop: '10px', paddingBottom: '0px' }}>
      <canvas ref={canvasRef} className="w-full h-full"></canvas>
    </div>
  );
}
