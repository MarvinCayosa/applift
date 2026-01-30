import Head from 'next/head';
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import BottomNav from '../components/BottomNav';
import ConnectPill from '../components/ConnectPill';
import EquipmentIcon from '../components/EquipmentIcon';
import WorkoutCard from '../components/WorkoutCard';
import LoadingScreen from '../components/LoadingScreen';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useUserProfile } from '../utils/userProfileStore';
import { useAuth } from '../context/AuthContext';
import ActivityOverview from '../components/ActivityOverview';
import { useBluetooth } from '../context/BluetoothProvider';
import { shouldUseAppMode } from '../utils/pwaInstalled';
import { getUserAvatarColorStyle, getUserTextColor, getFirstWord } from '../utils/colorUtils';

export default function Dashboard() {
  const { profile } = useUserProfile();
  const { user, userProfile, signOut, loading, isAuthenticated } = useAuth();
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

  // Sample recent workouts data (empty by default - will be populated from backend)
  const recentWorkouts = [
    // Example structure for when data is available:
    // { id: 1, exercise: 'Concentration Curls', equipment: 'Dumbbell', weight: 15, reps: 10, date: '2 days ago' },
    // { id: 2, exercise: 'Overhead Extension', equipment: 'Dumbbell', weight: 18, reps: 12, date: '2 days ago' },
  ];

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

  // Real workout history data - empty by default, will be populated from backend/database
  const workoutHistory = {
    // Store workout days per month for the last 3 months (empty by default)
    workoutDaysByMonth: {
      // 10: [], // November - no workouts logged
      // 0: [],  // January - no workouts logged  
      // 1: [],  // February - no workouts logged
    },
    lastWorkout: null, // No last workout yet
  };

  // Check if user has any workout history
  const hasWorkoutHistory = Object.values(workoutHistory.workoutDaysByMonth).some(days => days && days.length > 0);
  const hasRecentWorkouts = recentWorkouts && recentWorkouts.length > 0;

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

  // Load lifted data for different time periods (sample data with days of week for empty state)
  const loadLiftedDataByPeriod = {
    day: [
      // Empty by default - no workout data logged yet
      // Example structure:
      // { time: '6 AM', load: 0 },
      // { time: '9 AM', load: 12 },
    ],
    week: [
      // Sample data to show axes with days of the week
      { day: 'Mon', load: 0 },
      { day: 'Tue', load: 0 },
      { day: 'Wed', load: 0 },
      { day: 'Thu', load: 0 },
      { day: 'Fri', load: 0 },
      { day: 'Sat', load: 0 },
      { day: 'Sun', load: 0 },
    ],
    month: [
      // Empty by default - no workout data logged yet
      // Example structure:
      // { week: 'W1', load: 85 },
      // { week: 'W2', load: 92 },
    ],
  };

  // Get data based on current view
  const currentLoadData = loadLiftedDataByPeriod[liftViewType] || [];
  const dataKey = liftViewType === 'day' ? 'time' : liftViewType === 'week' ? 'day' : 'week';
  const totalLoad = currentLoadData.length > 0 ? currentLoadData.reduce((sum, item) => sum + item.load, 0) : 0;
  const maxLoad = currentLoadData.length > 0 ? Math.max(...currentLoadData.map(item => item.load)) : 0;
  const hasChartData = currentLoadData.length > 0 && currentLoadData.some(item => item.load > 0);

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
            <div className="w-full max-w-4xl mx-auto space-y-6">
              {/* Top bar: greetings + avatar left, controls right */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  {/* Colored profile avatar with initials - clickable */}
                  <div className="relative" ref={profileRef}>
                    <button
                      onClick={() => setProfileOpen(!profileOpen)}
                      className="w-12 h-12 sm:w-12 sm:h-12 rounded-full border border-white/20 flex items-center justify-center flex-shrink-0 hover:border-white/40 transition-colors"
                      style={{
                        ...getUserAvatarColorStyle(user?.uid),
                      }}
                      aria-label="Profile menu"
                    >
                      <span className="text-lg font-semibold text-white">{userInitials}</span>
                    </button>

                    {/* Dropdown menu */}
                    {profileOpen && (
                      <div
                        className="absolute top-14 left-0 z-50 min-w-[180px] rounded-2xl bg-[#00000066] border border-white/15 shadow-2xl modal-content-fade-in"
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

              {/* Greetings on upper-left */}
              <div className="flex flex-col leading-tight">
                <span className="text-2xl sm:text-3xl font-bold text-white">
                  Hello, <span style={{ color: getUserTextColor(user?.uid) }}>
                    {getFirstWord(userProfile?.username || profile?.username || user?.displayName || 'User')}
                  </span>!
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button className="p-2 rounded-full text-white/90" aria-label="Notifications">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" xmlns="http://www.w3.org/2000/svg"><path strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0 1 18 14.158V11a6 6 0 1 0-12 0v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 1 1-6 0v-1h6z"/></svg>
              </button>
            </div>
          </div>

          {/* Connection status pill */}
          <div className="flex justify-center content-fade-up-1">
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
          <div className="flex items-center justify-between mb-2 md:mb-6 content-fade-up-2">
            <h2 className="text-lg sm:text-xl font-semibold text-white">Overview</h2>
          </div>

          {/* Overview Card Carousel */}
          <section className="mb-8 md:mb-10 content-fade-up-3 -mx-4 sm:mx-0">
            <div>
              {/* Mobile Carousel - Scroll-snap centered with peek */}
              <div className="block md:hidden mb-6">
                <div
                  ref={carouselRef}
                  className="flex gap-4 overflow-x-auto pb-2 snap-x snap-mandatory snap-center scrollbar-hide scroll-smooth px-4"
                >
                  {/* Card 1: Activity Overview */}
                  <article className="min-w-[calc(100vw-24px)] w-[calc(100vw-24px)] max-w-[384px] shrink-0 snap-center rounded-3xl bg-white/10 p-5 shadow-2xl h-[320px] flex flex-col">
                    <ActivityOverview
                      currentWeek={currentWeek}
                      calendar3Months={calendar3Months}
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
                <div className="flex justify-center gap-2.5 mt-6">
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
          <section className="mb-8 md:mb-10 content-fade-up-4">
            <div className="bg-black rounded-3xl p-6 sm:p-8 shadow-2xl">
              {/* Header with title and stats */}
              <div className="flex items-start justify-between mb-6">
                <div>
                  <h3 className="text-lg font-semibold text-white mb-2">Workout</h3>
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
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
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
          className="fixed inset-0 z-50 flex items-center justify-center px-4 modal-fade-in"
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
