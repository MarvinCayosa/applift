import Head from 'next/head';
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import BottomNav from '../components/BottomNav';
import ConnectPill from '../components/ConnectPill';
import EquipmentIcon from '../components/EquipmentIcon';
import WorkoutCard from '../components/WorkoutCard';
import LoadingScreen from '../components/LoadingScreen';
import LoadTrendIndicator from '../components/LoadTrendIndicator';
import MovementQuality from '../components/MovementQuality';
import EquipmentDistributionCard from '../components/EquipmentDistributionCard';
import PlaceholderCard from '../components/PlaceholderCard';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useUserProfile } from '../utils/userProfileStore';
import { useWorkoutStreak } from '../utils/useWorkoutStreak';
import { useAuth } from '../context/AuthContext';
import { useWorkoutLogs } from '../utils/useWorkoutLogs';
import ActivityOverview from '../components/ActivityOverview';
import WorkoutStreak from '../components/WorkoutStreak';
import { useBluetooth } from '../context/BluetoothProvider';
import { shouldUseAppMode } from '../utils/pwaInstalled';
import { getUserAvatarColorStyle, getUserTextColor, getFirstWord } from '../utils/colorUtils';

// Profile colors for custom avatar (must match settings.js)
const PROFILE_COLORS = [
  { name: 'Purple', value: 'purple', bg: 'rgb(147, 51, 234)', gradient: 'linear-gradient(135deg, rgb(192, 132, 250), rgb(147, 51, 234))', textColor: '#c4b5fd' },
  { name: 'Blue', value: 'blue', bg: 'rgb(37, 99, 235)', gradient: 'linear-gradient(135deg, rgb(96, 165, 250), rgb(37, 99, 235))', textColor: '#93c5fd' },
  { name: 'Pink', value: 'pink', bg: 'rgb(219, 39, 119)', gradient: 'linear-gradient(135deg, rgb(244, 114, 182), rgb(219, 39, 119))', textColor: '#f9a8d4' },
  { name: 'Green', value: 'green', bg: 'rgb(34, 197, 94)', gradient: 'linear-gradient(135deg, rgb(74, 222, 128), rgb(34, 197, 94))', textColor: '#86efac' },
  { name: 'Orange', value: 'orange', bg: 'rgb(234, 88, 12)', gradient: 'linear-gradient(135deg, rgb(251, 146, 60), rgb(234, 88, 12))', textColor: '#fdba74' },
  { name: 'Cyan', value: 'cyan', bg: 'rgb(14, 165, 233)', gradient: 'linear-gradient(135deg, rgb(34, 211, 238), rgb(14, 165, 233))', textColor: '#67e8f9' },
  { name: 'Indigo', value: 'indigo', bg: 'rgb(79, 70, 229)', gradient: 'linear-gradient(135deg, rgb(129, 140, 248), rgb(79, 70, 229))', textColor: '#a5b4fc' },
  { name: 'Rose', value: 'rose', bg: 'rgb(225, 29, 72)', gradient: 'linear-gradient(135deg, rgb(251, 113, 133), rgb(225, 29, 72))', textColor: '#fda4af' },
  { name: 'Amber', value: 'amber', bg: 'rgb(217, 119, 6)', gradient: 'linear-gradient(135deg, rgb(251, 191, 36), rgb(217, 119, 6))', textColor: '#fcd34d' },
  { name: 'Lime', value: 'lime', bg: 'rgb(132, 204, 22)', gradient: 'linear-gradient(135deg, rgb(163, 230, 53), rgb(132, 204, 22))', textColor: '#bef264' },
];

// Get text color based on user's selected profile color or fallback to UID-based color
const getNameTextColor = (userProfile, uid) => {
  if (userProfile?.profileColor) {
    const color = PROFILE_COLORS.find(c => c.value === userProfile.profileColor);
    if (color) return color.textColor;
  }
  return getUserTextColor(uid);
};

export default function Dashboard() {
  const { profile } = useUserProfile();
  const { user, userProfile, signOut, loading, isAuthenticated } = useAuth();
  const { streakData, loading: streakLoading, error: streakError, refreshStreakData } = useWorkoutStreak();
  
  // Fetch real workout data from Firestore
  const { 
    logs,
    stats,
    lastWorkout,
    recentWorkouts,
    equipmentDistribution,
    calendarData,
    hasWorkouts,
    loading: workoutsLoading,
    error: workoutsError,
    refresh: refreshWorkouts,
    fetchCalendarData,
  } = useWorkoutLogs({ 
    autoFetch: true, 
    limitCount: 20,
    includeStats: true,
    includeCalendar: true,
  });
  
  const router = useRouter();
  const currentPath = router.pathname;
  
  // All hooks must be called before any conditional returns
  const {
    availability,
    permissionGranted,
    connecting,
    connectingDeviceId,
    connected,
    device,
    devicesFound,
    scanning,
    pairMessage,
    error,
    scanDevices,
    connectToDevice,
    disconnect,
    setPairMessage,
  } = useBluetooth();
  const [profileOpen, setProfileOpen] = useState(false);
  const [showSignOutModal, setShowSignOutModal] = useState(false);
  const [userInitials, setUserInitials] = useState('U');
  const profileRef = useRef(null);
  const [carouselIndex, setCarouselIndex] = useState(0);
  const carouselRef = useRef(null);
  const scrollSnapTimeoutRef = useRef(null);
  const trackRef = useRef(null);
  const [cardCount, setCardCount] = useState(0);
  const [slideMetrics, setSlideMetrics] = useState({ width: 0, gap: 16 });
  const PEEK_OFFSET = 56;
  const [liftViewType, setLiftViewType] = useState('week');

  // Protect the dashboard - redirect if not authenticated and auth is done loading
  useEffect(() => {
    console.log('🔒 Dashboard auth check:', { loading, isAuthenticated, user: !!user, userProfile: !!userProfile });
    
    if (!loading && !isAuthenticated) {
      console.warn('User not authenticated, redirecting to splash');
      
      // Use router.replace consistently to prevent back button issues
      // This removes the dashboard from history (can't go back to protected page)
      router.replace('/splash');
    }
  }, [isAuthenticated, loading, router]);

  // Calculate user initials from username or displayName
  useEffect(() => {
    // Priority: userProfile.username (Firestore) > user.displayName (Firebase Auth) > first part of email
    const username = userProfile?.username || user?.displayName || '';
    
    if (username) {
      const names = username.trim().split(' ').filter(n => n.length > 0);
      const initials = names.map(n => n[0].toUpperCase()).join('').slice(0, 2);
      if (initials) {
        console.log('Setting initials to:', initials, 'from username:', username);
        setUserInitials(initials);
      }
    } else if (user?.email) {
      // Fallback: use first letter of email
      const emailUsername = user.email.split('@')[0];
      const initials = emailUsername.slice(0, 2).toUpperCase();
      console.log('Setting initials to:', initials, 'from email');
      setUserInitials(initials);
    }
  }, [userProfile, user]);

  // close profile menu on outside click
  useEffect(() => {
    function onDocClick(e) {
      if (!profileRef.current) return;
      if (!profileRef.current.contains(e.target)) setProfileOpen(false);
    }
    if (profileOpen) document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [profileOpen]);

  // Measure slide width and gap so translation stays smooth and adaptive
  useEffect(() => {
    const measure = () => {
      if (!trackRef.current) return;
      const firstCard = trackRef.current.children?.[0];
      if (!firstCard) return;
      const rect = firstCard.getBoundingClientRect();
      const styles = window.getComputedStyle(trackRef.current);
      const gap = parseFloat(styles.columnGap || styles.gap || 0) || 0;
      setSlideMetrics({ width: rect.width, gap });
      setCardCount(trackRef.current.children.length);
    };

    const observer = new ResizeObserver(measure);
    if (trackRef.current) observer.observe(trackRef.current);
    window.addEventListener('resize', measure);
    measure();
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  // Clamp index if card count changes
  useEffect(() => {
    if (cardCount === 0) return;
    setCarouselIndex((prev) => Math.min(prev, cardCount - 1));
  }, [cardCount]);

  // Track mobile overview carousel scroll to update active index (snap-center with peek)
  useEffect(() => {
    const carousel = carouselRef.current;
    if (!carousel) return;

    const handleScroll = () => {
      const scrollLeft = carousel.scrollLeft;
      const cardWidth = 384 + 16; // card width + gap
      const peekAmount = 40; // pixels of peek
      const effectiveScroll = scrollLeft - peekAmount;
      const activeIndex = Math.max(0, Math.round(effectiveScroll / cardWidth));
      const maxIndex = Math.max((cardCount || 2) - 1, 1);
      setCarouselIndex(Math.min(activeIndex, maxIndex));

      // Debounce and snap to nearest card after scrolling stops (increased timeout for smoother feel)
      try { clearTimeout(scrollSnapTimeoutRef.current); } catch (_) {}
      scrollSnapTimeoutRef.current = setTimeout(() => {
        const nearest = Math.min(Math.max(activeIndex, 0), maxIndex);
        scrollToMobileIndex(nearest);
      }, 300);
    };

    carousel.addEventListener('scroll', handleScroll);
    return () => carousel.removeEventListener('scroll', handleScroll);
  }, [cardCount]);

  // service worker registration is handled in _app, but keep safe-check here
  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker
        .getRegistration('/sw.js')
        .then((reg) => {
          if (!reg) {
            navigator.serviceWorker
              .register('/sw.js')
              .then((r) => console.log('SW registered:', r.scope))
              .catch((err) => console.log('SW registration failed:', err));
          }
        })
        .catch(() => {});
    }
  }, []);

  // Show nothing while redirecting
  if (!loading && !isAuthenticated) {
    return null;
  }

  // Handle sign out with AuthContext
  const handleSignOutConfirm = async () => {
    try {
      setProfileOpen(false);
      setShowSignOutModal(false);
      
      // Sign out using AuthContext
      await signOut();
      
      // Redirect to splash - use replace to prevent going back to dashboard
      router.replace('/splash');
    } catch (error) {
      console.error('Error signing out:', error);
      alert('Failed to sign out. Please try again.');
    }
  };

  // Advance carousel by direction (1 = next, -1 = previous)
  const advanceCarousel = (direction) => {
    setCarouselIndex((prev) => {
      const total = Math.max(cardCount || 1, 1);
      let next = prev + direction;
      if (next < 0) next = total - 1;
      if (next >= total) next = 0;
      // Also scroll the carousel to keep index and position in sync
      scrollToMobileIndex(next);
      return next;
    });
  };

  // Smoothly scroll mobile carousel to a specific card by index
  const scrollToMobileIndex = (index) => {
    const carousel = carouselRef.current;
    if (!carousel) return;
    const child = carousel.children?.[index];
    if (!child) return;
    const left = child.offsetLeft - (carousel.clientWidth - child.clientWidth) / 2;
    try {
      carousel.scrollTo({ left, behavior: 'smooth' });
    } catch (_) {
      carousel.scrollLeft = left;
    }
    setCarouselIndex(index);
  };

  // Handle swipe/drag gestures for carousel with momentum
  const handleTouchStart = (e) => {
    const clientX = e.targetTouches?.[0]?.clientX ?? e.clientX;
    setTouchStart(clientX);
    setTouchTime(Date.now());
    setIsDragging(true);
    // Prevent body scroll
    document.body.style.overflow = 'hidden';
  };

  const handleTouchEnd = (e) => {
    const clientX = e.changedTouches?.[0]?.clientX ?? e.clientX;
    setTouchEnd(clientX);
    setIsDragging(false);
    // Re-enable body scroll
    document.body.style.overflow = 'auto';

    // Always snap to the nearest card based on current scroll position
    const carousel = carouselRef.current;
    if (carousel) {
      const scrollLeft = carousel.scrollLeft;
      const cardWidth = 320 + 16;
      const peekAmount = 40;
      const effectiveScroll = scrollLeft - peekAmount;
      const activeIndex = Math.round(Math.max(0, effectiveScroll / cardWidth));
      const maxIndex = Math.max((cardCount || 2) - 1, 1);
      const nearest = Math.min(Math.max(activeIndex, 0), maxIndex);
      scrollToMobileIndex(nearest);
    }

    setTouchStart(null);
    setTouchEnd(null);
    setTouchTime(null);
  };

  const handleMouseDown = (e) => {
    if (e.button === 0) { // Left mouse button
      handleTouchStart(e);
    }
  };

  // expose a UI-facing disconnect that also clears UI state
  const handleDisconnect = () => {
    disconnect();
  };

  const handleInstall = async () => {
    const e = typeof window !== 'undefined' && window.deferredPWAInstallPrompt;
    if (e) {
      e.prompt();
      const choice = await e.userChoice;
      console.log('PWA install choice', choice);
      window.deferredPWAInstallPrompt = null;
    } else {
      alert('Install prompt not available. Make sure the app is served over HTTPS and is installable.');
    }
  };

  // Build workout history from real Firebase data
  const buildWorkoutDaysByMonth = () => {
    const workoutDaysByMonth = {};
    
    logs.forEach((log) => {
      // Handle both timestamp formats
      const createdAt = log.timestamps?.started?.toDate?.() || 
                        log.timestamps?.created?.toDate?.() ||
                        (log.startTime ? new Date(log.startTime) : null);
      if (createdAt) {
        const month = createdAt.getMonth();
        const day = createdAt.getDate();
        
        if (!workoutDaysByMonth[month]) {
          workoutDaysByMonth[month] = [];
        }
        
        if (!workoutDaysByMonth[month].includes(day)) {
          workoutDaysByMonth[month].push(day);
        }
      }
    });
    
    return workoutDaysByMonth;
  };

  // Real workout history data from Firestore
  const workoutHistory = {
    workoutDaysByMonth: buildWorkoutDaysByMonth(),
    lastWorkout: lastWorkout,
  };

  // Check if user has any workout history
  const hasWorkoutHistory = hasWorkouts;
  const hasRecentWorkouts = recentWorkouts && recentWorkouts.length > 0;

  // Build workoutLogs for ActivityOverview from calendarData
  // Format: { dayNumber: [{ id, exercise, equipment, duration, startTime, exerciseCount }] }
  const buildWorkoutLogsForCalendar = () => {
    const workoutLogs = {};
    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();
    
    // Get calendar data for current month
    const monthKey = `${currentYear}-${currentMonth}`;
    const monthData = calendarData[monthKey] || {};
    
    // Also check logs directly for current month
    logs.forEach((log) => {
      // Handle both timestamp formats
      const createdAt = log.timestamps?.started?.toDate?.() || 
                        log.timestamps?.created?.toDate?.() ||
                        (log.startTime ? new Date(log.startTime) : null);
      if (!createdAt) return;
      
      // Only include current month
      if (createdAt.getMonth() !== currentMonth || createdAt.getFullYear() !== currentYear) return;
      
      const day = createdAt.getDate();
      
      if (!workoutLogs[day]) {
        workoutLogs[day] = [];
      }
      
      // Handle both old format (log.exercise.name) and new format (log.exercise as string)
      const exerciseName = log.exercise?.name || log.exercise || 'Unknown Exercise';
      const equipment = log.exercise?.equipment || log.equipment || 'Unknown';
      const totalReps = log.results?.totalReps || log.totalReps || 0;
      const totalSets = log.results?.totalSets || (log.sets ? Object.keys(log.sets).length : 0);
      const weight = log.planned?.weight || log.weight || 0;
      
      workoutLogs[day].push({
        id: log.id,
        exercise: exerciseName,
        equipment: equipment,
        duration: Math.round((log.results?.totalTime || 0) / 60), // Convert seconds to minutes
        startTime: createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }),
        exerciseCount: 1,
        status: log.status || 'completed',
        reps: totalReps,
        sets: totalSets,
        weight: weight,
      });
    });
    
    return workoutLogs;
  };

  const workoutLogsForCalendar = buildWorkoutLogsForCalendar();

  // Generate 3-month mini calendar data
  const generate3MonthCalendar = () => {
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth();
    const currentDay = today.getDate();

    const months = [];

    // Generate the last 3 months relative to current date
    for (let i = -2; i <= 0; i++) {
      const monthDate = new Date(currentYear, currentMonth + i, 1);
      const year = monthDate.getFullYear();
      const month = monthDate.getMonth();
      const firstDay = new Date(year, month, 1);
      const lastDay = new Date(year, month + 1, 0);
      const daysInMonth = lastDay.getDate();
      const startDate = firstDay.getDay();

      const days = [];
      // Add empty slots for days before month starts
      for (let j = 0; j < startDate; j++) {
        days.push({ day: null, isWorkout: false, isFuture: false });
      }

      // Add actual days of the month
      for (let day = 1; day <= daysInMonth; day++) {
        const isCurrentMonth = month === currentMonth;
        const isFuture = isCurrentMonth && day > currentDay;
        const isToday = isCurrentMonth && day === currentDay;
        const isWorkout = workoutHistory.workoutDaysByMonth[month]?.includes(day) || false;

        days.push({
          day,
          isWorkout,
          isFuture,
          isToday,
        });
      }

      months.push({
        month,
        monthName: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][month],
        year,
        days,
      });
    }

    return months;
  };

  const calendar3Months = generate3MonthCalendar();

  // Generate current week data (Sunday to Saturday)
  const generateCurrentWeek = () => {
    const today = new Date();
    const currentMonth = today.getMonth();
    const currentDay = today.getDate();
    
    // Get Sunday of current week
    const dayOfWeek = today.getDay();
    const sunday = new Date(today);
    sunday.setDate(today.getDate() - dayOfWeek);
    
    const weekDays = [];
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    
    for (let i = 0; i < 7; i++) {
      const date = new Date(sunday);
      date.setDate(sunday.getDate() + i);
      const dayNum = date.getDate();
      const month = date.getMonth();
      const isToday = dayNum === currentDay && month === currentMonth;
      const isFuture = date > today;
      const isWorkout = workoutHistory.workoutDaysByMonth[month]?.includes(dayNum) || false;
      
      weekDays.push({
        day: dayNum,
        dayName: dayNames[i],
        isToday,
        isFuture,
        isWorkout,
      });
    }
    
    return weekDays;
  };

  const currentWeek = generateCurrentWeek();

  // Calculate load from real workout data
  // Load formula: weight × reps (volume-load)
  const calculateLoadData = () => {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const sunday = new Date(today);
    sunday.setDate(today.getDate() - dayOfWeek);
    
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    
    // Initialize week data with 0 load for each day
    const weekData = dayNames.map(day => ({ day, load: 0 }));
    
    // Calculate load from workout logs
    logs.forEach((log) => {
      // Handle both timestamp formats
      const createdAt = log.timestamps?.started?.toDate?.() || 
                        log.timestamps?.created?.toDate?.() ||
                        (log.startTime ? new Date(log.startTime) : null);
      
      console.log('[Dashboard] Processing log:', {
        id: log.id,
        createdAt,
        startTime: log.startTime,
        timestampsStarted: log.timestamps?.started,
        weight: log.planned?.weight || log.weight,
        totalReps: log.results?.totalReps || log.totalReps
      });
      
      if (!createdAt) {
        console.log('[Dashboard] Skipping log - no valid date');
        return;
      }
      
      // Check if workout is in current week
      const logDate = new Date(createdAt);
      logDate.setHours(0, 0, 0, 0);
      const sundayDate = new Date(sunday);
      sundayDate.setHours(0, 0, 0, 0);
      const saturdayDate = new Date(sunday);
      saturdayDate.setDate(sunday.getDate() + 6);
      saturdayDate.setHours(23, 59, 59, 999);
      
      console.log('[Dashboard] Date check:', {
        logDate: logDate.toISOString(),
        sundayDate: sundayDate.toISOString(),
        saturdayDate: saturdayDate.toISOString(),
        isInWeek: logDate >= sundayDate && logDate <= saturdayDate
      });
      
      if (logDate >= sundayDate && logDate <= saturdayDate) {
        const dayIndex = logDate.getDay();
        // Handle both data formats
        const weight = log.planned?.weight || log.weight || 0;
        const reps = log.results?.totalReps || log.totalReps || 0;
        const load = weight * reps; // Volume load formula
        weekData[dayIndex].load += load;
        console.log('[Dashboard] Added load:', { dayIndex, dayName: dayNames[dayIndex], weight, reps, load });
      }
    });
    
    console.log('[Dashboard] Week data before reorder:', weekData);
    
    // Reorder to start from Monday
    const reorderedWeek = [
      weekData[1], // Mon
      weekData[2], // Tue
      weekData[3], // Wed
      weekData[4], // Thu
      weekData[5], // Fri
      weekData[6], // Sat
      weekData[0], // Sun
    ];
    
    return reorderedWeek;
  };

  // Calculate month data (weekly totals)
  const calculateMonthLoadData = () => {
    const today = new Date();
    const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    
    // Group by week
    const weeks = { W1: 0, W2: 0, W3: 0, W4: 0, W5: 0 };
    
    logs.forEach((log) => {
      // Handle both timestamp formats
      const createdAt = log.timestamps?.started?.toDate?.() || 
                        log.timestamps?.created?.toDate?.() ||
                        (log.startTime ? new Date(log.startTime) : null);
      if (!createdAt) return;
      
      const logDate = new Date(createdAt);
      
      // Check if in current month
      if (logDate.getMonth() === today.getMonth() && logDate.getFullYear() === today.getFullYear()) {
        const dayOfMonth = logDate.getDate();
        const weekNum = Math.ceil(dayOfMonth / 7);
        const weekKey = `W${weekNum}`;
        
        // Handle both data formats
        const weight = log.planned?.weight || log.weight || 0;
        const reps = log.results?.totalReps || log.totalReps || 0;
        const load = weight * reps;
        
        if (weeks[weekKey] !== undefined) {
          weeks[weekKey] += load;
        }
      }
    });
    
    return Object.entries(weeks).map(([week, load]) => ({ week, load }));
  };

  // Load lifted data for different time periods (real data from Firestore)
  const loadLiftedDataByPeriod = {
    day: [], // Day view not implemented yet
    week: calculateLoadData(),
    month: calculateMonthLoadData(),
  };

  console.log('[Dashboard] loadLiftedDataByPeriod.week:', loadLiftedDataByPeriod.week);
  console.log('[Dashboard] logs count:', logs.length);

  // Get data based on current view
  const currentLoadData = loadLiftedDataByPeriod[liftViewType] || [];
  const dataKey = liftViewType === 'day' ? 'time' : liftViewType === 'week' ? 'day' : 'week';
  const totalLoad = currentLoadData.length > 0 ? currentLoadData.reduce((sum, item) => sum + item.load, 0) : 0;
  const maxLoad = currentLoadData.length > 0 ? Math.max(...currentLoadData.map(item => item.load)) : 0;
  const hasChartData = currentLoadData.length > 0 && currentLoadData.some(item => item.load > 0);

  console.log('[Dashboard] Chart data:', { currentLoadData, totalLoad, maxLoad, hasChartData });

  // Calculate trend data from real workout logs
  const calculateTrendData = () => {
    const today = new Date();
    const oneWeekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const twoWeeksAgo = new Date(today.getTime() - 14 * 24 * 60 * 60 * 1000);
    
    let thisWeekLoad = 0;
    let lastWeekLoad = 0;
    
    logs.forEach((log) => {
      // Handle both timestamp formats
      const createdAt = log.timestamps?.started?.toDate?.() || 
                        log.timestamps?.created?.toDate?.() ||
                        (log.startTime ? new Date(log.startTime) : null);
      if (!createdAt) return;
      
      // Handle both data formats
      const weight = log.planned?.weight || log.weight || 0;
      const reps = log.results?.totalReps || log.totalReps || 0;
      const load = weight * reps;
      
      if (createdAt >= oneWeekAgo) {
        thisWeekLoad += load;
      } else if (createdAt >= twoWeeksAgo) {
        lastWeekLoad += load;
      }
    });
    
    const difference = thisWeekLoad - lastWeekLoad;
    const percentChange = lastWeekLoad > 0 
      ? ((difference / lastWeekLoad) * 100) 
      : (thisWeekLoad > 0 ? 100 : 0);
    
    return {
      difference: Math.round(difference * 10) / 10,
      percentChange: Math.round(percentChange * 10) / 10,
      period: 'last week',
      thisWeekLoad,
      lastWeekLoad,
    };
  };

  const loadTrendData = calculateTrendData();

  // Build equipment distribution from real data
  const buildEquipmentDistribution = () => {
    const colorMap = {
      'Dumbbell': '#3B82F6',     // Blue
      'Dumbell': '#3B82F6',      // Blue (alternate spelling)
      'Barbell': '#FBBF24',      // Yellow
      'Weight Stack': '#EF4444', // Red
      'custom': '#7c3aed',       // Purple for unknown
    };
    
    const distribution = {};
    let total = 0;
    
    logs.forEach((log) => {
      // Handle both data formats
      const equipment = log.exercise?.equipment || log.equipment;
      if (equipment) {
        distribution[equipment] = (distribution[equipment] || 0) + 1;
        total++;
      }
    });
    
    return Object.entries(distribution).map(([name, count]) => ({
      name,
      value: total > 0 ? Math.round((count / total) * 100) : 0,
      count,
      color: colorMap[name] || '#7c3aed',
    }));
  };

  const equipmentDistributionData = buildEquipmentDistribution();

  // Build movement quality data from real workout logs
  // If no workouts, return null to show empty state
  const buildMovementQualityData = () => {
    if (!hasWorkouts || logs.length === 0) {
      return null; // No data - component will show empty state
    }
    
    // Group workouts by equipment type and calculate quality metrics
    // For now, we don't have actual movement quality data from IMU
    // This returns null to indicate "no data available yet"
    // Once ML model provides classification, this can be populated
    return null;
  };

  const movementQualityData = buildMovementQualityData();

  // Equipment icon mapper
  const getEquipmentIcon = (equipment) => {
    const iconMap = {
      'Dumbbell': '🏋️',
      'Barbell': '⚖️',
      'Weight Stack': '⛓️',
    };
    return iconMap[equipment] || '🏋️';
  };

  // Map fitness level from profile data
  const getFitnessLevelDisplay = () => {
    const strengthExp = profile.strengthExperience;
    const map = {
      'beginner': 'Beginner',
      'intermediate': 'Intermediate',
      'advanced': 'Advanced',
    };
    return map[strengthExp] || 'Not Set';
  };

  // Map goal from profile data
  const getGoalDisplay = () => {
    const goal = profile.fitnessGoal;
    const map = {
      'build_strength': 'Build Strength',
      'hypertrophy': 'Increase Muscle',
      'conditioning': 'Improve Conditioning',
    };
    return map[goal] || 'Not Set';
  };

  // Show loading screen while auth is being determined
  if (loading) {
    return <LoadingScreen message="Loading..." />;
  }

  // Don't render dashboard if not authenticated (redirect will happen via useEffect)
  if (!isAuthenticated) {
    return <LoadingScreen message="Redirecting..." />;
  }

  return (
    <div className="min-h-screen bg-black text-white pb-32">
      <Head>
        <title>AppLift Dashboard</title>
        <meta name="theme-color" content="#0b0b0d" />
      </Head>

      <BottomNav />

      <main className="w-full px-4 sm:px-6 md:px-8 pt-10 sm:pt-10 pb-4 md:pb-6">
            <div className="w-full max-w-4xl mx-auto space-y-4">
              {/* Top bar: greetings left, avatar right */}
              <div className="flex items-center justify-between content-fade-up-1">
                {/* Greetings on left */}
                <div className="flex flex-col leading-tight">
                  <span className="text-sm text-white/40 mb-1">Start your training today!</span>
                  <span className="text-2xl sm:text-3xl font-bold text-white">
                    Hi, <span style={{ color: getNameTextColor(userProfile, user?.uid) }}>
                      {getFirstWord(userProfile?.username || profile?.username || user?.displayName || 'User')}
                    </span>
                  </span>
                </div>

                {/* Colored profile avatar with initials - clickable, now on right */}
                <div className="relative z-[10100]" ref={profileRef}>
                  <button
                    onClick={() => setProfileOpen(!profileOpen)}
                    className="w-12 h-12 sm:w-12 sm:h-12 rounded-full border border-white/20 flex items-center justify-center flex-shrink-0 hover:border-white/40 transition-colors overflow-hidden"
                    style={userProfile?.profileImage ? {} : (userProfile?.profileColor ? { background: PROFILE_COLORS.find(c => c.value === userProfile.profileColor)?.gradient || getUserAvatarColorStyle(user?.uid).background } : getUserAvatarColorStyle(user?.uid))}
                    aria-label="Profile menu"
                  >
                    {userProfile?.profileImage ? (
                      <img src={userProfile.profileImage} alt="Profile" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-lg font-semibold text-white">{userInitials}</span>
                    )}
                  </button>

                  {/* Dropdown menu */}
                  {profileOpen && (
                    <div
                      className="absolute top-14 right-0 z-[10100] min-w-[180px] rounded-2xl bg-[#00000066] border border-white/15 shadow-2xl modal-content-fade-in"
                      style={{
                        backdropFilter: 'blur(14px)',
                        WebkitBackdropFilter: 'blur(14px)',
                      }}
                    >
                      <button
                        onClick={() => {
                          setProfileOpen(false);
                          setShowSignOutModal(true);
                        }}
                        className="w-full px-4 py-3 text-left text-red-400 hover:text-red-300 hover:bg-white/8 transition-colors rounded-2xl text-sm font-semibold first:rounded-t-2xl last:rounded-b-2xl flex items-center justify-between"
                      >
                        <span>Sign out</span>
                        <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 12L13 12" />
                          <path d="M18 15L20.913 12.087V12.087C20.961 12.039 20.961 11.961 20.913 11.913V11.913L18 9" />
                          <path d="M16 5V4.5V4.5C16 3.67157 15.3284 3 14.5 3H5C3.89543 3 3 3.89543 3 5V19C3 20.1046 3.89543 21 5 21H14.5C15.3284 21 16 20.3284 16 19.5V19.5V19" />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>
              </div>

          {/* Connection status pill */}
          <div className="flex justify-center content-fade-up-2">
            <ConnectPill 
              connected={connected}
              device={device}
              onScan={scanDevices}
              onConnect={connectToDevice}
              onDisconnect={handleDisconnect}
              scanning={scanning}
              devicesFound={devicesFound}
              availability={availability}
            />
          </div>

          {/* Overview label outside the carousel */}
          <div className="flex items-center justify-between mb-1 md:mb-3 content-fade-up-2">
            <h2 className="text-lg sm:text-xl font-semibold text-white">Overview</h2>
          </div>

          {/* Workout Streak Section - positioned under Overview */}
          <div className="content-fade-up-2">
            <WorkoutStreak 
              streakDays={streakData.currentStreak}
              lastWorkoutDate={streakData.lastWorkoutDate ? new Date(streakData.lastWorkoutDate.seconds * 1000).toISOString() : null}
              loading={streakLoading}
            />
          </div>

          {/* Overview Card Carousel */}
          <section className="mb-4 md:mb-6 -mx-4 sm:mx-0 content-fade-up-3">
            <div>
              {/* Mobile Carousel - Scroll-snap centered with peek */}
              <div className="block md:hidden mb-3">
                <div
                  ref={carouselRef}
                  className="flex gap-4 overflow-x-auto pb-2 snap-x snap-mandatory snap-center scrollbar-hide scroll-smooth px-4"
                >
                  {/* Card 1: Activity Overview */}
                  <article className="min-w-[calc(100vw-24px)] w-[calc(100vw-24px)] max-w-[384px] shrink-0 snap-center rounded-3xl bg-white/10 p-5 shadow-2xl h-[320px] flex flex-col">
                    <ActivityOverview
                      currentWeek={currentWeek}
                      calendar3Months={calendar3Months}
                      workoutLogs={workoutLogsForCalendar}
                      onDaySelect={(day) => router.push(`/history?day=${day.day}`)}
                      onMonthSelect={(month, year) => router.push(`/history?month=${month}&year=${year}`)}
                      variant="mobile"
                    />
                  </article>

                  {/* Card 2: Recent Workouts */}
                  <article className="min-w-[calc(100vw-24px)] w-[calc(100vw-24px)] max-w-[384px] shrink-0 snap-center rounded-3xl bg-white/10 p-5 shadow-2xl h-[320px] flex flex-col">
                    <h3 className="text-sm font-semibold text-white/90 mb-4">Recent Workouts</h3>
                    <div className="flex-1 overflow-y-auto scrollbar-hide">
                      {hasRecentWorkouts ? (
                        <div className="space-y-2.5">
                          {recentWorkouts.slice(0, 5).map((workout) => (
                            <WorkoutCard key={workout.id} workout={workout} />
                          ))}
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center h-full text-center">
                          <svg 
                            fill="rgba(255,255,255,0.4)" 
                            width="48" 
                            height="48" 
                            viewBox="0 0 24 24" 
                            xmlns="http://www.w3.org/2000/svg"
                            className="mb-4"
                          >
                            <g data-name="Layer 2">
                              <g data-name="plus-circle">
                                <rect width="24" height="24" opacity="0"/>
                                <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8z"/>
                                <path d="M15 11h-2V9a1 1 0 0 0-2 0v2H9a1 1 0 0 0 0 2h2v2a1 1 0 0 0 2 0v-2h2a1 1 0 0 0 0-2z"/>
                              </g>
                            </g>
                          </svg>
                          <button 
                            onClick={() => router.push('/workouts')}
                            className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium rounded-full transition-colors"
                          >
                            Add a Workout
                          </button>
                        </div>
                      )}
                    </div>
                  </article>
                </div>

                {/* Indicator dots (clickable) */}
                <div className="flex justify-center gap-2.5 mt-3">
                  {Array.from({ length: 2 }).map((_, index) => (
                    <button
                      key={index}
                      onClick={() => scrollToMobileIndex(index)}
                      className={`${index === carouselIndex ? 'bg-white h-2 w-8' : 'bg-white/30 h-2 w-2'} rounded-full transition-all duration-300`}
                      aria-label={`Go to slide ${index + 1}`}
                    />
                  ))}
                </div>
              </div>

              {/* Desktop/Tablet View - Two Cards Side by Side */}
              <div className="hidden md:grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Card 1: Activity Overview */}
                <div className="backdrop-blur-md bg-white/10 rounded-3xl p-6 shadow-2xl hover:shadow-3xl transition-all duration-300 h-[320px] flex flex-col">
                  <ActivityOverview
                    currentWeek={currentWeek}
                    calendar3Months={calendar3Months}
                    workoutLogs={workoutLogsForCalendar}
                    onDaySelect={(day) => router.push(`/history?day=${day.day}`)}
                    onMonthSelect={(month, year) => router.push(`/history?month=${month}&year=${year}`)}
                    variant="desktop"
                  />
                </div>

                {/* Card 2: Recent Workouts */}
                <div className="backdrop-blur-md bg-white/10 rounded-3xl p-6 shadow-2xl hover:shadow-3xl transition-all duration-300 h-[320px] flex flex-col">
                  <h3 className="text-sm font-semibold text-white/90 mb-5 uppercase tracking-wide">Recent Workouts</h3>
                  <div className="flex-1 overflow-y-auto scrollbar-hide">
                    {hasRecentWorkouts ? (
                      <div className="space-y-3">
                        {recentWorkouts.slice(0, 5).map((workout) => (
                          <WorkoutCard key={workout.id} workout={workout} />
                        ))}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center h-full text-center">
                        <svg 
                          fill="rgba(255,255,255,0.4)" 
                          width="56" 
                          height="56" 
                          viewBox="0 0 24 24" 
                          xmlns="http://www.w3.org/2000/svg"
                          className="mb-4"
                        >
                          <g data-name="Layer 2">
                            <g data-name="plus-circle">
                              <rect width="24" height="24" opacity="0"/>
                              <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8z"/>
                              <path d="M15 11h-2V9a1 1 0 0 0-2 0v2H9a1 1 0 0 0 0 2h2v2a1 1 0 0 0 2 0v-2h2a1 1 0 0 0 0-2z"/>
                            </g>
                          </g>
                        </svg>
                        <button 
                          onClick={() => router.push('/workouts')}
                          className="px-6 py-2.5 bg-orange-500 hover:bg-orange-600 text-white font-medium rounded-full transition-colors"
                        >
                          Add a Workout
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Load Lifted Section */}
          <section className="mb-4 md:mb-6 content-fade-up-3">
            <div className="bg-black rounded-3xl p-5 sm:p-6 shadow-2xl">
              {/* Header with title and stats */}
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-white mb-2">Workout Load</h3>
                  <p className="text-xs text-white/60 capitalize">
                    {hasChartData 
                      ? (liftViewType === 'day' ? 'Today' : liftViewType === 'week' ? 'Last 7 Days' : 'Last 4 Weeks')
                      : 'No data available'
                    }
                  </p>
                </div>
                <div className="text-right">
                  <div className={`text-2xl sm:text-3xl font-bold ${hasChartData ? 'text-yellow-300' : 'text-white/30'}`}>
                    {totalLoad.toFixed(1)} kg
                  </div>
                  <div className="text-xs text-white/60">Total</div>
                </div>
              </div>

              {/* Line Chart - Always shown with axes */}
              <div className="w-full h-64 sm:h-72 md:h-80 relative">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={currentLoadData} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                    <XAxis 
                      dataKey={dataKey} 
                      stroke="rgba(255,255,255,0.5)" 
                      style={{ fontSize: '12px' }}
                      axisLine={true}
                      tickLine={false}
                      interval={0}
                      tick={{ fill: 'rgba(255,255,255,0.5)' }}
                    />
                    <YAxis 
                      stroke="rgba(255,255,255,0.5)" 
                      style={{ fontSize: '12px' }}
                      domain={[0, hasChartData ? 'dataMax' : 100]}
                      axisLine={true}
                      tickLine={false}
                      width={35}
                      tick={{ fill: 'rgba(255,255,255,0.5)' }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'rgba(0,0,0,0.9)',
                        border: '1px solid rgba(255,255,255,0.2)',
                        borderRadius: '12px',
                        padding: '12px 16px',
                      }}
                      labelStyle={{ color: '#fef08a' }}
                      formatter={(value) => [`${value} kg`, 'Load']}
                    />
                    <Line
                      type="monotone"
                      dataKey="load"
                      stroke="#fef08a"
                      strokeWidth={3}
                      dot={{ fill: '#fef08a', strokeWidth: 2, r: 4 }}
                      activeDot={{ r: 6, fill: '#fef08a' }}
                      animationDuration={500}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </section>

          {/* Weekly Comparison Card - Full width gray card */}
          <section className="mb-4 md:mb-5 content-fade-up-3">
            <LoadTrendIndicator
              difference={loadTrendData.difference}
              percentChange={loadTrendData.percentChange}
              period={loadTrendData.period}
              currentTotal={loadTrendData.thisWeekLoad}
              previousTotal={loadTrendData.lastWeekLoad}
              hasData={logs.length > 0}
            />
          </section>

          {/* Two half-width cards side by side */}
          <section className="mb-4 md:mb-6 content-fade-up-4">
            <div className="grid grid-cols-2 gap-4">
              {/* Left: Equipment Distribution */}
            <EquipmentDistributionCard
              data={equipmentDistributionData}
              period="This Month"
              animate={true}
              hasData={equipmentDistributionData.length > 0}
            />              {/* Right: Placeholder for future feature */}
              <PlaceholderCard
                title="Quick Stats"
                subtitle="Coming soon"
              />
            </div>
          </section>

          {/* Movement Quality Card - Weekly aggregated IMU metrics */}
          <section className="mb-4 md:mb-5 content-fade-up-4">
            <MovementQuality
              equipmentData={movementQualityData}
              hasData={logs.length > 0}
              loading={workoutsLoading}
              animate={true}
              onFilterChange={(filter) => console.log('Filter changed:', filter)}
            />
          </section>

          {/* Spacer for bottom nav */}
          <div className="h-4" />
        </div>
      </main>



      {/* Disconnect control visible when connected */}
      <div className="fixed bottom-6 right-6">
        {connected ? (
          <button onClick={handleDisconnect} className="px-4 py-2 rounded-md bg-white/6 text-white border border-white/10" aria-label="Disconnect device">Disconnect</button>
        ) : null}
      </div>

      {/* Sign-out confirmation modal */}
      {showSignOutModal && (
        <div
          className="fixed inset-0 z-[10500] flex items-center justify-center px-4 modal-fade-in"
          style={{
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
          }}
          onClick={() => setShowSignOutModal(false)}
        >
          <div
            className="relative max-w-xs w-full p-6 rounded-2xl bg-white/10 shadow-xl modal-content-fade-in"
            style={{
              boxShadow: '0 10px 40px #00000066',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-center">
              <h3 className="text-lg font-medium text-white mb-3">Sign Out</h3>
              <p className="text-sm text-white/70 mb-6 leading-relaxed">
                Are you sure you would like to sign out?
              </p>
            </div>
            
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowSignOutModal(false)}
                className="flex-1 px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/90 font-medium transition-colors modal-element-fade-in border border-white/10"
                style={{ animationDelay: '50ms' }}
              >
                Cancel
              </button>
              <button
                onClick={handleSignOutConfirm}
                className="flex-1 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-medium transition-colors modal-element-fade-in"
                style={{ animationDelay: '120ms' }}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
