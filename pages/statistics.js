import Head from 'next/head';
import { useState, useMemo, useRef, useEffect } from 'react';
import BottomNav from '../components/BottomNav';
import { useWorkoutLogs } from '../utils/useWorkoutLogs';
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip
} from 'recharts';

// Metric Cards Carousel Component matching the reference design
function MetricCardsCarousel({ totalWorkouts, weekDuration, avgLoadPerWorkout }) {
  const scrollRef = useRef(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const cards = [
    {
      label: 'Total Workouts',
      value: totalWorkouts.toString(),
      sublabel: null,
      bgColor: 'bg-orange-500',
      textColor: 'text-black',
      labelColor: 'text-black/80'
    },
    {
      label: 'Duration',
      value: weekDuration.formatted,
      sublabel: 'This Week',
      bgColor: 'bg-lime-400',
      textColor: 'text-black',
      labelColor: 'text-black/70'
    },
    {
      label: 'Total Workouts',
      value: totalWorkouts.toString(),
      sublabel: null,
      bgColor: 'bg-violet-400',
      textColor: 'text-black',
      labelColor: 'text-black/80'
    }
  ];

  const handleScroll = () => {
    if (scrollRef.current) {
      const scrollLeft = scrollRef.current.scrollLeft;
      const cardWidth = scrollRef.current.offsetWidth * 0.75; // 75% of container width
      const newIndex = Math.round(scrollLeft / cardWidth);
      setActiveIndex(Math.min(Math.max(newIndex, 0), cards.length - 1));
    }
  };

  useEffect(() => {
    const scrollEl = scrollRef.current;
    if (scrollEl) {
      scrollEl.addEventListener('scroll', handleScroll);
      return () => scrollEl.removeEventListener('scroll', handleScroll);
    }
  }, []);

  return (
    <div className="relative">
      {/* Scrollable Cards Container */}
      <div
        ref={scrollRef}
        className="flex gap-3 overflow-x-auto snap-x snap-mandatory scrollbar-hide pb-4"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {cards.map((card, index) => (
          <div
            key={index}
            className={`${card.bgColor} rounded-3xl p-5 flex-shrink-0 snap-start`}
            style={{ width: '75%', minHeight: '140px' }}
          >
            <div className={`text-sm font-medium ${card.labelColor}`}>
              {card.label}
            </div>
            <div className="mt-3">
              <div className={`text-5xl font-bold ${card.textColor}`}>
                {card.value}
              </div>
              {card.sublabel && (
                <div className={`text-sm ${card.labelColor} mt-1`}>
                  {card.sublabel}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Pagination Dots */}
      <div className="flex justify-center gap-2 mt-2">
        {cards.map((_, index) => (
          <div
            key={index}
            className={`h-2 rounded-full transition-all duration-300 ${
              index === activeIndex ? 'w-6 bg-white' : 'w-2 bg-white/30'
            }`}
          />
        ))}
      </div>
    </div>
  );
}

export default function Statistics() {
  const { logs } = useWorkoutLogs({ 
    autoFetch: true, 
    limitCount: 500,
    includeStats: true 
  });
  const [liftViewType, setLiftViewType] = useState('week');

  // Calculate load from real workout data (weekly)
  const calculateLoadData = () => {
    const today = new Date();
    const dayOfWeek = today.getDay();
    
    const sunday = new Date(today);
    sunday.setDate(today.getDate() - dayOfWeek);
    sunday.setHours(0, 0, 0, 0);
    
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const todayIndex = dayOfWeek;
    
    const weekData = dayNames.map((day, idx) => ({ 
      day, 
      load: idx > todayIndex ? null : 0,
      isToday: idx === todayIndex,
      isFuture: idx > todayIndex
    }));
    
    logs.forEach((log) => {
      const createdAt = log.timestamps?.started?.toDate?.() || 
                        log.timestamps?.created?.toDate?.() ||
                        (log.startTime ? new Date(log.startTime) : null);
      if (!createdAt) return;
      
      const logDate = new Date(createdAt);
      logDate.setHours(0, 0, 0, 0);
      
      const sundayDate = new Date(sunday);
      sundayDate.setHours(0, 0, 0, 0);
      
      const saturdayDate = new Date(sunday);
      saturdayDate.setDate(sunday.getDate() + 6);
      saturdayDate.setHours(23, 59, 59, 999);
      
      if (logDate >= sundayDate && logDate <= saturdayDate) {
        const dayIndex = logDate.getDay();
        if (dayIndex <= todayIndex) {
          const weight = log.planned?.weight || log.weight || 0;
          const reps = log.results?.totalReps || log.totalReps || 0;
          const load = weight * reps;
          weekData[dayIndex].load += load;
        }
      }
    });
    
    return weekData;
  };

  // Calculate month data (weekly totals)
  const calculateMonthLoadData = () => {
    const today = new Date();
    const currentWeekNum = Math.ceil(today.getDate() / 7);
    
    const weeks = {};
    for (let i = 1; i <= currentWeekNum; i++) {
      weeks[`W${i}`] = { week: `W${i}`, load: 0, isCurrentWeek: i === currentWeekNum };
    }
    
    logs.forEach((log) => {
      const createdAt = log.timestamps?.started?.toDate?.() || 
                        log.timestamps?.created?.toDate?.() ||
                        (log.startTime ? new Date(log.startTime) : null);
      if (!createdAt) return;
      
      const logDate = new Date(createdAt);
      
      if (logDate.getMonth() === today.getMonth() && logDate.getFullYear() === today.getFullYear()) {
        const dayOfMonth = logDate.getDate();
        const weekNum = Math.ceil(dayOfMonth / 7);
        const weekKey = `W${weekNum}`;
        
        if (weekNum <= currentWeekNum && weeks[weekKey]) {
          const weight = log.planned?.weight || log.weight || 0;
          const reps = log.results?.totalReps || log.totalReps || 0;
          const load = weight * reps;
          weeks[weekKey].load += load;
        }
      }
    });
    
    return Object.values(weeks);
  };

  // Calculate year data (monthly totals)
  const calculateYearLoadData = () => {
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth();
    
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    const months = {};
    for (let i = 0; i <= currentMonth; i++) {
      months[monthNames[i]] = { month: monthNames[i], load: 0, isCurrentMonth: i === currentMonth };
    }
    
    logs.forEach((log) => {
      const createdAt = log.timestamps?.started?.toDate?.() || 
                        log.timestamps?.created?.toDate?.() ||
                        (log.startTime ? new Date(log.startTime) : null);
      if (!createdAt) return;
      
      const logDate = new Date(createdAt);
      
      if (logDate.getFullYear() === currentYear && logDate.getMonth() <= currentMonth) {
        const monthKey = monthNames[logDate.getMonth()];
        
        const weight = log.planned?.weight || log.weight || 0;
        const reps = log.results?.totalReps || log.totalReps || 0;
        const load = weight * reps;
        
        if (months[monthKey]) {
          months[monthKey].load += load;
        }
      }
    });
    
    return Object.values(months);
  };

  // Load lifted data for different time periods
  const loadLiftedDataByPeriod = useMemo(() => ({
    week: calculateLoadData(),
    month: calculateMonthLoadData(),
    year: calculateYearLoadData(),
  }), [logs]);

  // Cycle through view types
  const cycleViewType = () => {
    const viewOrder = ['week', 'month', 'year'];
    const currentIndex = viewOrder.indexOf(liftViewType);
    const nextIndex = (currentIndex + 1) % viewOrder.length;
    setLiftViewType(viewOrder[nextIndex]);
  };

  // View type labels
  const viewTypeLabels = {
    week: 'This Week',
    month: 'This Month',
    year: 'This Year'
  };

  // Get data based on current view
  const currentLoadData = loadLiftedDataByPeriod[liftViewType] || [];
  const dataKey = liftViewType === 'week' ? 'day' : liftViewType === 'month' ? 'week' : 'month';
  const totalLoad = currentLoadData.length > 0 ? currentLoadData.reduce((sum, item) => sum + (item.load || 0), 0) : 0;
  const hasChartData = currentLoadData.length > 0 && currentLoadData.some(item => item.load > 0);

  // Calculate total workouts
  const totalWorkouts = logs.length;

  // Calculate total duration this week
  const calculateWeekDuration = () => {
    const today = new Date();
    const dayOfWeek = today.getDay();
    
    const sunday = new Date(today);
    sunday.setDate(today.getDate() - dayOfWeek);
    sunday.setHours(0, 0, 0, 0);
    
    const saturdayDate = new Date(sunday);
    saturdayDate.setDate(sunday.getDate() + 6);
    saturdayDate.setHours(23, 59, 59, 999);
    
    let totalMinutes = 0;
    
    logs.forEach((log) => {
      const createdAt = log.timestamps?.started?.toDate?.() || 
                        log.timestamps?.created?.toDate?.() ||
                        (log.startTime ? new Date(log.startTime) : null);
      if (!createdAt) return;
      
      const logDate = new Date(createdAt);
      if (logDate >= sunday && logDate <= saturdayDate) {
        // Check for durationMs (milliseconds) or totalTime (seconds)
        const durationMs = log.results?.durationMs || 0;
        const totalTimeSeconds = log.results?.totalTime || 0;
        
        if (durationMs > 0) {
          totalMinutes += durationMs / 60000; // Convert ms to minutes
        } else if (totalTimeSeconds > 0) {
          totalMinutes += totalTimeSeconds / 60; // Convert seconds to minutes
        }
      }
    });
    
    const hours = Math.floor(totalMinutes / 60);
    const minutes = Math.round(totalMinutes % 60);
    return { hours, minutes, formatted: `${hours}h ${minutes}m` };
  };

  const weekDuration = calculateWeekDuration();

  // Calculate average load per workout
  const avgLoadPerWorkout = totalWorkouts > 0 ? Math.round(totalLoad / totalWorkouts) : 0;

  return (
    <div className="min-h-screen bg-black text-white pb-32">
      <Head>
        <title>Statistics — AppLift</title>
      </Head>

      <BottomNav />
      
      <main className="w-full px-4 sm:px-6 md:px-8 pt-2.5 sm:pt-3.5 pt-pwa-dynamic pb-4 md:pb-6">
        <div className="w-full max-w-4xl mx-auto">
          {/* Page Header */}
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-white">Statistics</h1>
            <p className="text-sm text-white/60 mt-1">Track your workout progress</p>
          </div>

          {/* Workout Load Chart */}
          <section className="mb-6">
            <div className="bg-zinc-900 rounded-3xl p-5 sm:p-6 shadow-2xl">
              {/* Header with title and stats */}
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-white mb-2">Total Load Lifted</h3>
                  <button 
                    onClick={cycleViewType}
                    className="text-xs text-white/60 capitalize bg-white/10 px-3 py-1 rounded-full hover:bg-white/20 transition-colors flex items-center gap-1"
                  >
                    {viewTypeLabels[liftViewType]}
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                </div>
                <div className="text-right">
                  <div className={`text-2xl sm:text-3xl font-bold ${hasChartData ? 'text-yellow-300' : 'text-white/30'}`}>
                    {totalLoad.toFixed(1)} kg
                  </div>
                  <div className="text-xs text-white/60">Total</div>
                </div>
              </div>

              {/* Line Chart - No Y axis labels, tap to reveal values */}
              <div className="w-full h-56 sm:h-64 relative">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={currentLoadData} margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                    <XAxis 
                      dataKey={dataKey} 
                      stroke="rgba(255,255,255,0.5)" 
                      style={{ fontSize: '11px' }}
                      axisLine={false}
                      tickLine={false}
                      interval={0}
                      tick={{ fill: 'rgba(255,255,255,0.5)' }}
                    />
                    <YAxis hide={true} domain={[0, hasChartData ? 'dataMax' : 100]} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'rgba(0,0,0,0.95)',
                        border: '1px solid rgba(255,255,255,0.2)',
                        borderRadius: '12px',
                        padding: '10px 14px',
                      }}
                      labelStyle={{ color: '#fef08a', fontWeight: 600 }}
                      formatter={(value, name) => {
                        // Only show Line data, not Area (which has name="areaFill")
                        if (name === 'areaFill') return null;
                        return [`${value?.toFixed(1) || 0} kg`, 'Load'];
                      }}
                    />
                    <defs>
                      <linearGradient id="statsLoadAreaGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#fef08a" stopOpacity={0.5} />
                        <stop offset="100%" stopColor="#000000" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <Area
                      type="monotone"
                      dataKey="load"
                      name="areaFill"
                      stroke="none"
                      fill="url(#statsLoadAreaGradient)"
                      connectNulls={false}
                      animationDuration={500}
                    />
                    <Line
                      type="monotone"
                      dataKey="load"
                      stroke="#fef08a"
                      strokeWidth={5}
                      connectNulls={false}
                      name="Load"
                      dot={(props) => {
                        const { cx, cy, payload } = props;
                        if (payload?.isToday || payload?.isCurrentWeek || payload?.isCurrentMonth) {
                          return <circle cx={cx} cy={cy} r={5} fill="#fef08a" stroke="#fef08a" strokeWidth={2} />;
                        }
                        return null;
                      }}
                      activeDot={{ r: 6, fill: '#fef08a', stroke: '#fff', strokeWidth: 2 }}
                      animationDuration={500}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          </section>

          {/* Colorful Metric Cards - Horizontal Carousel */}
          <section className="mb-6">
            <MetricCardsCarousel
              totalWorkouts={totalWorkouts}
              weekDuration={weekDuration}
              avgLoadPerWorkout={avgLoadPerWorkout}
            />
          </section>
        </div>
      </main>
    </div>
  );
}
