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

      // Create gradient for the filtered line (purple gradient)
      // More evident purple gradient stroke
      const gradientStroke = ctx.createLinearGradient(0, 0, ctx.canvas.width, 0);
      gradientStroke.addColorStop(0, 'rgba(192, 132, 252, 1)'); // #c084fc
      gradientStroke.addColorStop(0.3, 'rgba(168, 85, 247, 1)');
      gradientStroke.addColorStop(0.7, 'rgba(147, 51, 234, 1)');
      gradientStroke.addColorStop(1, 'rgba(139, 92, 246, 1)'); // #8b5cf6

      // More obvious, soft, airy vertical gradient fill
      const gradientFill = ctx.createLinearGradient(0, 0, 0, ctx.canvas.height);
      gradientFill.addColorStop(0, 'rgba(168, 85, 247, 0.45)'); // Top: solid primary
      gradientFill.addColorStop(0.15, 'rgba(168, 85, 247, 0.25)');
      gradientFill.addColorStop(0.4, 'rgba(168, 85, 247, 0.13)');
      gradientFill.addColorStop(0.7, 'rgba(168, 85, 247, 0.07)');
      gradientFill.addColorStop(1, 'rgba(168, 85, 247, 0)'); // Bottom: transparent

      chartRef.current = new Chart(ctx, {
        type: 'line',
        data: {
          labels: timeData,
          datasets: [
            // REMOVED: Raw Acceleration line - no longer displayed
            {
              label: 'Filtered (Kalman)',
              data: filteredData,
              borderColor: gradientStroke,
              backgroundColor: gradientFill,
              borderWidth: 7,
              pointRadius: 0,
              tension: 0.4, // Smooth curves
              fill: true,
              shadowOffsetX: 0,
              shadowOffsetY: 0,
              shadowBlur: 48,
              shadowColor: 'rgba(168, 85, 247, 0.85)', // Stronger purple glow effect
              segment: {
                borderColor: ctx => {
                  // Re-create gradient for each segment to maintain smooth gradient
                  const gradient = ctx.chart.ctx.createLinearGradient(0, 0, ctx.chart.width, 0);
                  gradient.addColorStop(0, 'rgba(192, 132, 252, 1)');
                  gradient.addColorStop(0.3, 'rgba(168, 85, 247, 1)');
                  gradient.addColorStop(0.7, 'rgba(147, 51, 234, 1)');
                  gradient.addColorStop(1, 'rgba(139, 92, 246, 1)');
                  return gradient;
                }
              }
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
