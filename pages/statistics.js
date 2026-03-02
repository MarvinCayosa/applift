import Head from 'next/head';
import { useState, useMemo, useRef, useEffect } from 'react';
import { useRouter } from 'next/router';
import BottomNav from '../components/BottomNav';
import EquipmentCards from '../components/EquipmentCards';
import CalendarView from '../components/CalendarView';
import { useWorkoutLogs } from '../utils/useWorkoutLogs';
import { parseLogDate } from '../utils/workoutCache';
import { useAuth } from '../context/AuthContext';
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

// Filter label map
const FILTER_LABELS = { week: 'This Week', month: 'This Month', allTime: 'All Time' };
const FILTER_ORDER = ['week', 'month', 'allTime'];

const FREQ_LABELS = { week: 'Per Week', month: 'Per Month' };
const FREQ_ORDER = ['week', 'month'];

function cycleFreqFilter(current) {
  const idx = FREQ_ORDER.indexOf(current);
  return FREQ_ORDER[(idx + 1) % FREQ_ORDER.length];
}

function cycleFilter(current) {
  const idx = FILTER_ORDER.indexOf(current);
  return FILTER_ORDER[(idx + 1) % FILTER_ORDER.length];
}
function AnimatedValue({ value, className }) {
  const [displayed, setDisplayed] = useState(value);
  const [animating, setAnimating] = useState(false);

  useEffect(() => {
    if (value !== displayed) {
      setAnimating(true);
      const t = setTimeout(() => {
        setDisplayed(value);
        setAnimating(false);
      }, 150);
      return () => clearTimeout(t);
    }
  }, [value]);

  return (
    <span
      className={`inline-block transition-all duration-300 ease-out ${className} ${
        animating ? 'opacity-0 translate-y-1' : 'opacity-100 translate-y-0'
      }`}
    >
      {displayed}
    </span>
  );
}

// Metric Cards Carousel Component matching the reference design
function MetricCardsCarousel({
  workoutValue, workoutFilter, onWorkoutFilterChange,
  durationValue, durationFilter, onDurationFilterChange,
  frequencyValue, frequencyLabel, onFrequencyFilterChange
}) {
  const scrollRef = useRef(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const cards = [
    {
      label: 'Total Workouts',
      value: workoutValue.toString(),
      sublabel: FILTER_LABELS[workoutFilter],
      bgColor: 'bg-orange-500',
      textColor: 'text-black',
      labelColor: 'text-black/80',
      onTap: onWorkoutFilterChange
    },
    {
      label: 'Duration',
      value: durationValue,
      sublabel: FILTER_LABELS[durationFilter],
      bgColor: 'bg-lime-400',
      textColor: 'text-black',
      labelColor: 'text-black/70',
      onTap: onDurationFilterChange
    },
    {
      label: 'Avg Frequency',
      value: frequencyValue,
      sublabel: frequencyLabel,
      bgColor: 'bg-violet-400',
      textColor: 'text-black',
      labelColor: 'text-black/70',
      onTap: onFrequencyFilterChange
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
            onClick={card.onTap || undefined}
            className={`${card.bgColor} rounded-3xl p-5 flex-shrink-0 snap-start ${card.onTap ? 'cursor-pointer active:scale-[0.97] transition-transform' : ''}`}
            style={{ width: '75%', minHeight: '140px' }}
          >
            <div className={`text-sm font-medium ${card.labelColor}`}>
              {card.label}
            </div>
            <div className="mt-3">
              <div>
                <AnimatedValue
                  value={card.value}
                  className={`text-5xl font-bold ${card.textColor}`}
                />
              </div>
              <div 
                className={`text-sm mt-2 ${card.onTap ? 'inline-flex items-center gap-1 px-2.5 py-1 rounded-full' : card.labelColor}`}
                style={card.onTap ? { backgroundColor: 'hsl(0deg 0% 3.1% / 9%)' } : undefined}
              >
                <AnimatedValue
                  value={card.sublabel}
                  className={card.onTap ? 'text-black/70 font-medium' : ''}
                />
                {card.onTap && (
                  <svg className="w-3 h-3 text-black/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                  </svg>
                )}
              </div>
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
  const { user } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('statistics');
  const [liftViewType, setLiftViewType] = useState('week');
  const [workoutFilter, setWorkoutFilter] = useState('allTime');
  const [durationFilter, setDurationFilter] = useState('week');
  const [freqFilter, setFreqFilter] = useState('week');

  // Read tab from query params (e.g. ?tab=calendar)
  useEffect(() => {
    if (router.isReady && router.query.tab === 'calendar') {
      setActiveTab('calendar');
    }
  }, [router.isReady, router.query.tab]);

  // Helper: get load from a log entry
  const getLogLoad = (log) => {
    const weight = log.planned?.weight || log.weight || 0;
    const reps = log.results?.totalReps || log.totalReps || 0;
    return weight * reps;
  };

  // Helper: parse log date
  const getLogDate = (log) => {
    return parseLogDate(log);
  };

  // Calculate daily load data for the CURRENT WEEK (Sun-Sat)
  const calculateWeekLoadData = () => {
    const today = new Date();
    const dayOfWeek = today.getDay();
    
    const sunday = new Date(today);
    sunday.setDate(today.getDate() - dayOfWeek);
    sunday.setHours(0, 0, 0, 0);
    
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const todayIndex = dayOfWeek;
    
    const weekData = dayNames.map((day, idx) => ({ 
      label: day, 
      load: idx > todayIndex ? null : 0,
      isToday: idx === todayIndex,
      isFuture: idx > todayIndex
    }));
    
    logs.forEach((log) => {
      const createdAt = getLogDate(log);
      if (!createdAt) return;
      
      const logDate = new Date(createdAt);
      logDate.setHours(0, 0, 0, 0);
      
      const sundayDate = new Date(sunday);
      const saturdayDate = new Date(sunday);
      saturdayDate.setDate(sunday.getDate() + 6);
      saturdayDate.setHours(23, 59, 59, 999);
      
      if (logDate >= sundayDate && logDate <= saturdayDate) {
        const dayIndex = logDate.getDay();
        if (dayIndex <= todayIndex) {
          weekData[dayIndex].load += getLogLoad(log);
        }
      }
    });
    
    return weekData;
  };

  // Calculate DAILY load data for the entire current month (zoomed out daily view)
  // Labels show W1, W2, W3, etc. on the first day of each week
  const calculateMonthLoadData = () => {
    const today = new Date();
    const currentDay = today.getDate();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();
    
    // Build array with one entry per day up to today
    const days = [];
    for (let d = 1; d <= currentDay; d++) {
      const weekNum = Math.ceil(d / 7);
      const isFirstDayOfWeek = (d - 1) % 7 === 0; // 1, 8, 15, 22, 29...
      days.push({
        label: isFirstDayOfWeek ? `W${weekNum}` : '',
        load: 0,
        isToday: d === currentDay,
        isFuture: false
      });
    }
    
    logs.forEach((log) => {
      const createdAt = getLogDate(log);
      if (!createdAt) return;
      const logDate = new Date(createdAt);
      if (logDate.getMonth() === currentMonth && logDate.getFullYear() === currentYear) {
        const dayNum = logDate.getDate();
        if (dayNum <= currentDay && days[dayNum - 1]) {
          days[dayNum - 1].load += getLogLoad(log);
        }
      }
    });
    
    return days;
  };

  // Calculate DAILY load data for the entire current year (zoomed out daily view)
  // Labels show Jan, Feb, Mar, etc. on the first day of each month
  const calculateYearLoadData = () => {
    const today = new Date();
    const currentYear = today.getFullYear();
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    // Build daily entries from Jan 1 to today
    const days = [];
    const start = new Date(currentYear, 0, 1);
    const end = new Date(today);
    end.setHours(23, 59, 59, 999);
    
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const monthIdx = d.getMonth();
      const dayOfMonth = d.getDate();
      const isFirstOfMonth = dayOfMonth === 1;
      days.push({
        label: isFirstOfMonth ? monthNames[monthIdx] : '',
        load: 0,
        isToday: d.getDate() === today.getDate() && d.getMonth() === today.getMonth(),
        isFuture: false,
        _date: new Date(d)
      });
    }
    
    logs.forEach((log) => {
      const createdAt = getLogDate(log);
      if (!createdAt) return;
      const logDate = new Date(createdAt);
      if (logDate.getFullYear() !== currentYear) return;
      
      // Find the index for this date (days since Jan 1)
      const jan1 = new Date(currentYear, 0, 1);
      const diffDays = Math.floor((logDate - jan1) / 86400000);
      if (diffDays >= 0 && diffDays < days.length) {
        days[diffDays].load += getLogLoad(log);
      }
    });
    
    // Clean up _date helper
    days.forEach(d => delete d._date);
    return days;
  };

  // Load lifted data for different time periods (all daily granularity)
  const loadLiftedDataByPeriod = useMemo(() => ({
    week: calculateWeekLoadData(),
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

  // Get data based on current view (all use 'label' as key now)
  const currentLoadData = loadLiftedDataByPeriod[liftViewType] || [];
  const dataKey = 'label';
  const totalLoad = currentLoadData.length > 0 ? currentLoadData.reduce((sum, item) => sum + (item.load || 0), 0) : 0;
  const hasChartData = currentLoadData.length > 0 && currentLoadData.some(item => item.load > 0);

  // ── Filtered Workout Count (week / month / allTime) ──
  const filteredWorkoutCount = useMemo(() => {
    if (workoutFilter === 'allTime') return logs.length;

    const today = new Date();
    let start;
    if (workoutFilter === 'week') {
      start = new Date(today);
      start.setDate(today.getDate() - today.getDay());
      start.setHours(0, 0, 0, 0);
    } else {
      // month
      start = new Date(today.getFullYear(), today.getMonth(), 1);
    }

    return logs.filter(log => {
      const d = parseLogDate(log);
      return d && new Date(d) >= start;
    }).length;
  }, [logs, workoutFilter]);

  // ── Duration calculation helper ──
  const calcDuration = (filterLogs) => {
    let totalMinutes = 0;
    filterLogs.forEach(log => {
      const durationMs = log.results?.durationMs || 0;
      const totalTimeSeconds = log.results?.totalTime || 0;
      if (durationMs > 0) totalMinutes += durationMs / 60000;
      else if (totalTimeSeconds > 0) totalMinutes += totalTimeSeconds / 60;
    });
    const hours = Math.floor(totalMinutes / 60);
    const minutes = Math.round(totalMinutes % 60);
    return `${hours}h ${minutes}m`;
  };

  // ── Filtered Duration (week / month / allTime) ──
  const filteredDuration = useMemo(() => {
    if (durationFilter === 'allTime') return calcDuration(logs);

    const today = new Date();
    let start;
    if (durationFilter === 'week') {
      start = new Date(today);
      start.setDate(today.getDate() - today.getDay());
      start.setHours(0, 0, 0, 0);
    } else {
      start = new Date(today.getFullYear(), today.getMonth(), 1);
    }

    const filtered = logs.filter(log => {
      const d = parseLogDate(log);
      return d && new Date(d) >= start;
    });
    return calcDuration(filtered);
  }, [logs, durationFilter]);

  // Total workouts (used by chart section)
  const totalWorkouts = logs.length;

  // Calculate average load per workout
  const avgLoadPerWorkout = totalWorkouts > 0 ? Math.round(totalLoad / totalWorkouts) : 0;

  // ── Workout Frequency (per week or per month, over last 90 days) ──
  const workoutFrequency = useMemo(() => {
    const DAYS_WINDOW = 90;
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    const startDate = new Date(today);
    startDate.setDate(today.getDate() - (DAYS_WINDOW - 1));
    startDate.setHours(0, 0, 0, 0);

    const logsInWindow = logs.filter(log => {
      const d = parseLogDate(log);
      return d && new Date(d) >= startDate;
    }).length;

    const weeks = DAYS_WINDOW / 7;
    const months = DAYS_WINDOW / 30;

    const perWeek = (logsInWindow / weeks).toFixed(1);
    const perMonth = (logsInWindow / months).toFixed(1);

    return { perWeek, perMonth };
  }, [logs]);

  return (
    <div className="min-h-screen bg-black text-white pb-32">
      <Head>
        <title>Statistics — AppLift</title>
      </Head>

      <BottomNav />
      
      <main className="w-full px-4 sm:px-6 md:px-8 pt-2.5 sm:pt-3.5 pt-pwa-dynamic pb-4 md:pb-6">
        <div className="w-full max-w-4xl mx-auto">
          {/* Page Header + Tab Toggle */}
          <div className="mb-5">
            <h1 className="text-2xl font-bold text-white">Statistics</h1>
            <p className="text-sm text-white/60 mt-1 mb-4">Track your workout progress</p>

            {/* Tab Toggle */}
            <div className="flex border-b border-white/10">
              {[
                { key: 'statistics', label: 'Analytics' },
                { key: 'calendar', label: 'Calendar' },
              ].map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex-1 pb-2.5 text-sm font-semibold transition-colors relative ${
                    activeTab === tab.key
                      ? 'text-orange-400'
                      : 'text-white/40'
                  }`}
                >
                  {tab.label}
                  {activeTab === tab.key && (
                    <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-orange-400 rounded-full" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* ═══ Statistics Tab ═══ */}
          {activeTab === 'statistics' && (
            <>
              {/* Workout Load Chart */}
              <section className="mb-6 opacity-0 animate-fade-up" style={{ animationDelay: '0.1s', animationFillMode: 'forwards' }}>
                <div className="bg-zinc-900 rounded-3xl p-5 sm:p-6 shadow-2xl">
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
                  <div className="w-full h-56 sm:h-64 relative">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={currentLoadData} margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
                        <CartesianGrid 
                          strokeDasharray="3 3" 
                          stroke="rgba(255,255,255,0.08)" 
                          verticalCoordinatesGenerator={(props) => {
                            const { width, offset } = props;
                            const coordinates = [];
                            currentLoadData.forEach((item, index) => {
                              if (item.label && item.label.trim() !== '') {
                                const x = offset.left + (index * (width - offset.left - offset.right) / (currentLoadData.length - 1 || 1));
                                coordinates.push(x);
                              }
                            });
                            return coordinates;
                          }}
                        />
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

              {/* Metric Cards */}
              <section className="mb-6 opacity-0 animate-fade-up" style={{ animationDelay: '0.35s', animationFillMode: 'forwards' }}>
                <MetricCardsCarousel
                  workoutValue={filteredWorkoutCount}
                  workoutFilter={workoutFilter}
                  onWorkoutFilterChange={() => setWorkoutFilter(f => cycleFilter(f))}
                  durationValue={filteredDuration}
                  durationFilter={durationFilter}
                  onDurationFilterChange={() => setDurationFilter(f => cycleFilter(f))}
                  frequencyValue={freqFilter === 'week' ? workoutFrequency.perWeek : workoutFrequency.perMonth}
                  frequencyLabel={FREQ_LABELS[freqFilter]}
                  onFrequencyFilterChange={() => setFreqFilter(f => cycleFreqFilter(f))}
                />
              </section>

              {/* Equipment Cards */}
              <section className="mb-6 opacity-0 animate-fade-up" style={{ animationDelay: '0.55s', animationFillMode: 'forwards' }}>
                <EquipmentCards />
              </section>
            </>
          )}

          {/* ═══ Calendar Tab ═══ */}
          {activeTab === 'calendar' && (
            <section className="opacity-0 animate-fade-up" style={{ animationDelay: '0.05s', animationFillMode: 'forwards' }}>
              <CalendarView
                logs={logs}
                userCreatedAt={user?.metadata?.creationTime}
                initialMonth={router.query.month !== undefined ? parseInt(router.query.month) : undefined}
                initialYear={router.query.year !== undefined ? parseInt(router.query.year) : undefined}
              />
            </section>
          )}
        </div>
      </main>
      
    </div>
  );
}
