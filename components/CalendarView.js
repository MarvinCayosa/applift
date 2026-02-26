import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';

/*───────────────────────────  HELPERS  ───────────────────────────*/

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** Return the Sunday that starts the week containing `date`. */
function weekStart(date) {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Format a date key like "2026-2-26" for O(1) lookups. */
function dateKey(d) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** Check if two dates are the same calendar day. */
function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

/** Format duration seconds into "Xm" or "Xh Ym" */
function fmtDuration(sec) {
  if (!sec || sec <= 0) return '';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    return `${h}h ${m % 60}m`;
  }
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

/** Normalise kebab-case → Title Case */
function titleCase(str) {
  if (!str) return '';
  return str.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

/**
 * Equipment color — matches dashboard / WorkoutCard / ActivityOverview.
 * Dumbbell = #3B82F6 (Blue), Barbell = #FBBF24 (Yellow), Weight Stack = #EF4444 (Red)
 */
function equipColor(eq) {
  const e = (eq || '').toLowerCase();
  if (e.includes('dumbbell') || e.includes('dumbell')) return '#3B82F6';
  if (e.includes('barbell')) return '#FBBF24';
  if (e.includes('weight') || e.includes('stack')) return '#EF4444';
  return '#7c3aed'; // default purple
}

/*───────────────────────────  COMPONENT  ───────────────────────────*/

export default function CalendarView({ logs = [], userCreatedAt }) {
  const router = useRouter();

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  // Earliest allowed month
  const earliestDate = useMemo(() => {
    if (userCreatedAt) {
      const d = new Date(userCreatedAt);
      d.setDate(1);
      d.setHours(0, 0, 0, 0);
      return d;
    }
    const d = new Date(today);
    d.setMonth(d.getMonth() - 6);
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [userCreatedAt, today]);

  const [currentMonth, setCurrentMonth] = useState(() => today.getMonth());
  const [currentYear, setCurrentYear] = useState(() => today.getFullYear());
  const [selectedDate, setSelectedDate] = useState(today);
  const [showMonthPicker, setShowMonthPicker] = useState(false);

  // Build a quick-access map: dateKey → [activities]
  const activityMap = useMemo(() => {
    const map = {};
    logs.forEach(log => {
      const ts = log.timestamps?.started?.toDate?.() ||
        log.timestamps?.created?.toDate?.() ||
        (log.startTime ? new Date(log.startTime) : null);
      if (!ts) return;

      const key = dateKey(ts);
      if (!map[key]) map[key] = [];

      const exercise = log._exercise || log.exercise?.namePath || log.exercise?.name ||
        (typeof log.exercise === 'string' ? log.exercise : '') || '';
      const equipment = log._equipment || log.exercise?.equipmentPath || log.exercise?.equipment || '';
      const weight = log.planned?.weight || log.weight || 0;
      const weightUnit = log.planned?.weightUnit || 'kg';
      const reps = log.results?.totalReps || log.totalReps || 0;
      const sets = log.results?.totalSets || log.results?.completedSets || 0;
      const duration = log.results?.totalTime || 0;
      const calories = log.results?.calories || 0;

      map[key].push({
        id: log.id,
        exercise: titleCase(exercise),
        equipment: titleCase(equipment),
        rawEquipment: equipment,
        rawExercise: exercise,
        weight,
        weightUnit,
        reps,
        sets,
        duration,
        calories,
        time: ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }),
        timestamp: ts,
      });
    });
    Object.values(map).forEach(arr => arr.sort((a, b) => b.timestamp - a.timestamp));
    return map;
  }, [logs]);

  // Generate weeks for the current month
  const weeks = useMemo(() => {
    const first = new Date(currentYear, currentMonth, 1);
    const last = new Date(currentYear, currentMonth + 1, 0);
    const ws = [];
    let cursor = weekStart(first);

    while (cursor <= last || ws.length < 1) {
      const week = [];
      for (let i = 0; i < 7; i++) {
        week.push(new Date(cursor));
        cursor.setDate(cursor.getDate() + 1);
      }
      ws.push(week);
      if (cursor > last && ws.length >= 4) break;
    }
    return ws;
  }, [currentMonth, currentYear]);

  const weekScrollRef = useRef(null);
  const isScrollingRef = useRef(false);
  const scrollTimeoutRef = useRef(null);

  const [activeWeekIdx, setActiveWeekIdx] = useState(() => {
    const todayWeekStart = weekStart(today);
    for (let i = 0; i < weeks.length; i++) {
      if (isSameDay(weeks[i][0], todayWeekStart)) return i;
    }
    return 0;
  });

  // Reset week + selection when month changes
  useEffect(() => {
    const todayInMonth = today.getMonth() === currentMonth && today.getFullYear() === currentYear;
    if (todayInMonth) {
      const todayWS = weekStart(today);
      const idx = weeks.findIndex(w => isSameDay(w[0], todayWS));
      setActiveWeekIdx(idx >= 0 ? idx : 0);
      setSelectedDate(today);
    } else {
      setActiveWeekIdx(0);
      setSelectedDate(new Date(currentYear, currentMonth, 1));
    }
  }, [currentMonth, currentYear]);

  // Programmatically scroll to active week (no jitter)
  useEffect(() => {
    const el = weekScrollRef.current;
    if (!el) return;
    isScrollingRef.current = true;
    el.scrollTo({ left: activeWeekIdx * el.offsetWidth, behavior: 'smooth' });
    // Allow scroll handler to ignore programmatic scrolls
    clearTimeout(scrollTimeoutRef.current);
    scrollTimeoutRef.current = setTimeout(() => { isScrollingRef.current = false; }, 400);
  }, [activeWeekIdx]);

  // Handle user-initiated scroll with debounce to prevent glitches
  const handleWeekScroll = useCallback(() => {
    if (isScrollingRef.current) return; // ignore programmatic scroll
    const el = weekScrollRef.current;
    if (!el) return;
    clearTimeout(scrollTimeoutRef.current);
    scrollTimeoutRef.current = setTimeout(() => {
      const idx = Math.round(el.scrollLeft / el.offsetWidth);
      const clamped = Math.min(Math.max(idx, 0), weeks.length - 1);
      if (clamped !== activeWeekIdx) setActiveWeekIdx(clamped);
    }, 80);
  }, [weeks.length, activeWeekIdx]);

  // Available months for picker
  const availableMonths = useMemo(() => {
    const months = [];
    const cursor = new Date(earliestDate);
    const todayMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    while (cursor <= todayMonth) {
      months.push({ month: cursor.getMonth(), year: cursor.getFullYear() });
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return months;
  }, [earliestDate, today]);

  const selectedActivities = useMemo(() => {
    return activityMap[dateKey(selectedDate)] || [];
  }, [activityMap, selectedDate]);

  // Navigate to session-details
  const goToSession = (act) => {
    const eq = act.rawEquipment || act.equipment?.toLowerCase().replace(/\s+/g, '-') || '';
    const ex = act.rawExercise || act.exercise?.toLowerCase().replace(/\s+/g, '-') || '';
    router.push(`/session-details?logId=${act.id}&eq=${encodeURIComponent(eq)}&ex=${encodeURIComponent(ex)}`);
  };

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 200px)' }}>
      {/* ═══ Sticky Header ═══ */}
      <div className="flex-shrink-0">
      {/* ═══ Month Header ═══ */}
      <div className="flex items-center justify-center mb-4">
        <button
          onClick={() => setShowMonthPicker(!showMonthPicker)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full hover:bg-white/10 transition-colors"
        >
          <span className="text-base font-semibold text-white">
            {MONTH_NAMES[currentMonth]} {currentYear}
          </span>
          <svg className={`w-3.5 h-3.5 text-white/60 transition-transform ${showMonthPicker ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {/* ═══ Month Picker Dropdown ═══ */}
      {showMonthPicker && (
        <div className="mx-1 mb-4 bg-zinc-900 rounded-2xl p-3 max-h-48 overflow-y-auto scrollbar-hide border border-white/10">
          <div className="grid grid-cols-3 gap-1.5">
            {availableMonths.map(({ month, year }) => {
              const isActive = month === currentMonth && year === currentYear;
              return (
                <button
                  key={`${year}-${month}`}
                  onClick={() => {
                    setCurrentMonth(month);
                    setCurrentYear(year);
                    setShowMonthPicker(false);
                  }}
                  className={`px-2 py-2 rounded-xl text-xs font-medium transition-all ${
                    isActive
                      ? 'bg-orange-500 text-black'
                      : 'text-white/70 hover:bg-white/10'
                  }`}
                >
                  {MONTH_NAMES[month].slice(0, 3)} {year !== today.getFullYear() ? year : ''}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══ Weekly Calendar Strip ═══ */}
      <div
        ref={weekScrollRef}
        onScroll={handleWeekScroll}
        className="flex overflow-x-auto scrollbar-hide mb-2"
        style={{
          scrollSnapType: 'x mandatory',
          scrollBehavior: 'smooth',
          WebkitOverflowScrolling: 'touch',
          scrollbarWidth: 'none',
        }}
      >
        {weeks.map((week, wIdx) => (
          <div
            key={wIdx}
            className="grid grid-cols-7 gap-2 flex-shrink-0 px-1"
            style={{ width: '100%', minWidth: '100%', scrollSnapAlign: 'start' }}
          >
            {week.map((day, dIdx) => {
              const isToday = isSameDay(day, today);
              const isSelected = isSameDay(day, selectedDate);
              const isCurrentMonth = day.getMonth() === currentMonth;
              const key = dateKey(day);
              const hasActivity = !!activityMap[key];
              const activityCount = activityMap[key]?.length || 0;

              // Border & background logic
              const borderColor = isSelected
                ? '2px solid #F97316'
                : isToday
                ? '2px solid rgba(255,255,255,0.20)'
                : '2px solid transparent';

              const bgColor = isSelected
                ? 'rgba(249,115,22,0.10)'
                : isToday
                ? 'rgba(255,255,255,0.04)'
                : 'transparent';

              return (
                <button
                  key={dIdx}
                  onClick={() => setSelectedDate(new Date(day))}
                  className="flex flex-col items-center py-2.5 px-1 rounded-xl transition-all"
                  style={{
                    border: borderColor,
                    backgroundColor: bgColor,
                  }}
                >
                  {/* Day name */}
                  <span className={`text-[10px] font-semibold tracking-wider mb-2 ${
                    isToday
                      ? 'text-orange-400'
                      : isCurrentMonth ? 'text-white/40' : 'text-white/15'
                  }`}>
                    {DAY_NAMES[dIdx]}
                  </span>

                  {/* Day number */}
                  <span
                    className={`text-xl font-bold leading-none ${
                      isToday
                        ? 'text-orange-400'
                        : isSelected
                        ? 'text-orange-300'
                        : isCurrentMonth
                        ? 'text-white/80'
                        : 'text-white/20'
                    }`}
                  >
                    {day.getDate()}
                  </span>

                  {/* Activity dots — equipment colors */}
                  <div className="flex gap-0.5 mt-1 h-1.5">
                    {hasActivity ? (
                      activityCount <= 3 ? (
                        Array.from({ length: activityCount }).map((_, i) => (
                          <div
                            key={i}
                            className="w-1.5 h-1.5 rounded-full"
                            style={{ backgroundColor: equipColor(activityMap[key][i]?.rawEquipment) }}
                          />
                        ))
                      ) : (
                        <>
                          {/* Show first 3 unique equipment colors */}
                          {[...new Set(activityMap[key].map(a => equipColor(a.rawEquipment)))].slice(0, 3).map((c, i) => (
                            <div key={i} className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: c }} />
                          ))}
                        </>
                      )
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* Week dots */}
      {weeks.length > 1 && (
        <div className="flex items-center justify-center gap-2.5 mb-4">
          {weeks.map((_, i) => (
            <div
              key={i}
              className={`rounded-full transition-all duration-300 ${
                activeWeekIdx === i ? 'w-4 h-1.5 bg-orange-400' : 'w-1.5 h-1.5 bg-white/25'
              }`}
            />
          ))}
        </div>
      )}

      </div>{/* end sticky header */}

      {/* ═══ Timeline Activities ═══ */}
      <div className="flex-1 min-h-0 px-1 overflow-y-auto scrollbar-hide" style={{ scrollbarWidth: 'none' }}>
        {selectedActivities.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <svg className="w-10 h-10 text-white/15" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <p className="text-sm text-white/30">No workouts on this day</p>
          </div>
        ) : (
          <div className="relative pl-5">
            {/* Continuous timeline rail */}
            <div
              className="absolute left-[9px] top-3 bottom-3 w-[2px] rounded-full"
              style={{
                background: 'linear-gradient(to bottom, rgba(255,255,255,0.15), rgba(255,255,255,0.05))',
              }}
            />

            {selectedActivities.map((act, idx) => {
              const eqCol = equipColor(act.rawEquipment);
              const isFirst = idx === 0;

              return (
                <div
                  key={act.id || idx}
                  onClick={() => goToSession(act)}
                  className="relative flex items-start gap-3 cursor-pointer group opacity-0 animate-fade-up"
                  style={{ animationDelay: `${idx * 80}ms`, animationFillMode: 'forwards' }}
                  role="button"
                  aria-label={`View session: ${act.exercise}`}
                >
                  {/* ── Timeline node ── */}
                  <div className="absolute left-[-20px] flex flex-col items-center z-10" style={{ top: '16px' }}>
                    {/* Outer glow ring */}
                    <div
                      className="w-5 h-5 rounded-full flex items-center justify-center"
                      style={{
                        backgroundColor: `${eqCol}20`,
                        boxShadow: `0 0 8px ${eqCol}30`,
                      }}
                    >
                      {/* Inner dot */}
                      <div
                        className="w-2.5 h-2.5 rounded-full"
                        style={{
                          backgroundColor: eqCol,
                          boxShadow: `0 0 6px ${eqCol}80`,
                        }}
                      />
                    </div>
                  </div>

                  {/* ── Content card ── */}
                  <div
                    className="flex-1 rounded-2xl px-4 py-3.5 mb-3 transition-all duration-200 group-hover:scale-[1.01] group-active:scale-[0.98]"
                    style={{
                      backgroundColor: 'rgba(255,255,255,0.04)',
                      borderLeft: `3px solid ${eqCol}`,
                    }}
                  >
                    {/* Time + duration */}
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[11px] text-white/40 font-medium">{act.time}</span>
                      <div className="flex items-center gap-2">
                        {act.duration > 0 && (
                          <span className="text-[10px] text-white/25 font-medium">{fmtDuration(act.duration)}</span>
                        )}
                        {/* Chevron */}
                        <svg className="w-3.5 h-3.5 text-white/20 group-hover:text-white/40 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </div>

                    {/* Exercise name */}
                    <p className="text-[15px] font-semibold text-white leading-tight">
                      {act.exercise || 'Workout'}
                    </p>

                    {/* Equipment tag */}
                    {act.equipment && (
                      <span
                        className="inline-block text-[10px] font-semibold uppercase tracking-wide mt-1.5 px-2 py-0.5 rounded-full"
                        style={{ color: eqCol, backgroundColor: `${eqCol}18` }}
                      >
                        {act.equipment}
                      </span>
                    )}

                    {/* Stats row */}
                    <div className="flex items-center gap-3 mt-2.5">
                      {act.weight > 0 && (
                        <span className="text-xs text-white/40">
                          <span className="font-bold text-white/60">{act.weight}</span> {act.weightUnit}
                        </span>
                      )}
                      {act.sets > 0 && (
                        <span className="text-xs text-white/40">
                          <span className="font-bold text-white/60">{act.sets}</span> sets
                        </span>
                      )}
                      {act.reps > 0 && (
                        <span className="text-xs text-white/40">
                          <span className="font-bold text-white/60">{act.reps}</span> reps
                        </span>
                      )}
                      {act.calories > 0 && (
                        <span className="text-xs text-white/40">
                          <span className="font-bold text-white/60">{act.calories}</span> kcal
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
