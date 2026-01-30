import Head from 'next/head';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';

// Birthday Picker - iOS-style wheel with center-based selection (same as signup)
function BirthdayPicker({ months, years, selectedMonth, selectedYear, onMonthChange, onYearChange }) {
  const monthRef = useRef(null);
  const yearRef = useRef(null);
  const scrollTimeoutRef = useRef(null);
  const itemHeight = 44;

  // Initialize scroll position on mount
  useEffect(() => {
    if (monthRef.current && selectedMonth !== undefined) {
      const idx = months.indexOf(selectedMonth);
      if (idx !== -1) monthRef.current.scrollTop = idx * itemHeight;
    }
    if (yearRef.current && selectedYear !== undefined) {
      const idx = years.indexOf(selectedYear);
      if (idx !== -1) yearRef.current.scrollTop = idx * itemHeight;
    }
  }, [selectedMonth, selectedYear, months, years]);

  const handleScroll = (ref, items, setter, isMonth) => {
    if (!ref.current) return;
    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    scrollTimeoutRef.current = setTimeout(() => {
      const scrollTop = ref.current.scrollTop;
      const index = Math.round(scrollTop / itemHeight);
      const clamped = Math.max(0, Math.min(items.length - 1, index));
      const selected = items[clamped];
      setter(selected);
      ref.current.scrollTop = clamped * itemHeight;
    }, 100);
  };

  const handleClickItem = (index, items, setter, isMonth) => {
    const ref = isMonth ? monthRef : yearRef;
    const selected = items[index];
    setter(selected);
    if (ref.current) ref.current.scrollTop = index * itemHeight;
  };

  return (
    <div className="relative rounded-2xl overflow-hidden">
      {/* Selection indicator */}
      <div
        className="absolute inset-x-0 z-10 pointer-events-none rounded-xl"
        style={{
          top: '50%',
          transform: 'translateY(-50%)',
          height: itemHeight,
          backgroundColor: 'rgba(139, 92, 246, 0.1)',
          borderTop: '1px solid rgba(238,235,217,0.2)',
          borderBottom: '1px solid rgba(238,235,217,0.2)',
        }}
      />

      {/* Top fade */}
      <div
        className="absolute inset-x-0 top-0 z-20 pointer-events-none rounded-t-2xl"
        style={{
          height: '88px',
          background: 'linear-gradient(to bottom, rgba(11,11,13,1), rgba(11,11,13,0))',
        }}
      />

      {/* Bottom fade */}
      <div
        className="absolute inset-x-0 bottom-0 z-20 pointer-events-none rounded-b-2xl"
        style={{
          height: '88px',
          background: 'linear-gradient(to top, rgba(11,11,13,1), rgba(11,11,13,0))',
        }}
      />

      <div className="flex gap-4">
        {/* Month Picker */}
        <div className="flex-1">
          <div
            ref={monthRef}
            className="h-52 overflow-y-scroll scrollbar-hide relative"
            style={{ scrollSnapType: 'y mandatory' }}
            onScroll={() => handleScroll(monthRef, months, onMonthChange, true)}
          >
            <div style={{ height: itemHeight * 2 }} />
            {months.map((month, idx) => (
              <div
                key={idx}
                className={`h-11 flex items-center justify-center text-center cursor-pointer transition-all ${
                  month === selectedMonth
                    ? 'text-white font-semibold'
                    : 'text-white/40 font-normal'
                }`}
                style={{ scrollSnapAlign: 'center', minHeight: itemHeight }}
                onClick={() => handleClickItem(idx, months, onMonthChange, true)}
              >
                {month}
              </div>
            ))}
            <div style={{ height: itemHeight * 2 }} />
          </div>
        </div>

        {/* Year Picker */}
        <div className="flex-1">
          <div
            ref={yearRef}
            className="h-52 overflow-y-scroll scrollbar-hide relative"
            style={{ scrollSnapType: 'y mandatory' }}
            onScroll={() => handleScroll(yearRef, years, onYearChange, false)}
          >
            <div style={{ height: itemHeight * 2 }} />
            {years.map((year, idx) => (
              <div
                key={year}
                className={`h-11 flex items-center justify-center text-center cursor-pointer transition-all ${
                  year === selectedYear
                    ? 'text-white font-semibold'
                    : 'text-white/40 font-normal'
                }`}
                style={{ scrollSnapAlign: 'center', minHeight: itemHeight }}
                onClick={() => handleClickItem(idx, years, onYearChange, false)}
              >
                {year}
              </div>
            ))}
            <div style={{ height: itemHeight * 2 }} />
          </div>
        </div>
      </div>

      <style jsx>{`
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </div>
  );
}
import BottomNav from '../components/BottomNav';
import LoadingScreen from '../components/LoadingScreen';
import { useAuth } from '../context/AuthContext';
import { getUserAvatarColorStyle, getUserTextColor, getFirstWord } from '../utils/colorUtils';
import { deleteUser, updatePassword, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { doc, deleteDoc } from 'firebase/firestore';
import { db } from '../config/firestore';

export default function Settings() {
  const router = useRouter();
  const { user, userProfile, updateUserProfile, signOut, loading, isAuthenticated } = useAuth();
  
  const [userInitials, setUserInitials] = useState('U');
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [isEditingBody, setIsEditingBody] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showSignOutModal, setShowSignOutModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  
  // Password change state
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [passwordError, setPasswordError] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  
  // Form state for profile
  const [profileForm, setProfileForm] = useState({
    username: '',
    email: '',
  });

  // Form state for body metrics
  const [bodyForm, setBodyForm] = useState({
    birthMonth: '',
    birthYear: '',
    weight: '',
    height: '',
  });

  // Weight and height unit states (like signup)
  const [weightUnit, setWeightUnit] = useState('kg');
  const [heightUnit, setHeightUnit] = useState('ft');
  const [heightFeet, setHeightFeet] = useState('');
  const [heightInches, setHeightInches] = useState('');

  // Birthday picker data - 18+ age limit
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const currentYear = new Date().getFullYear();
  const minAge = 18;
  const maxYear = currentYear - minAge; // Must be at least 18 years old
  const years = Array.from({ length: 100 }, (_, i) => maxYear - i); // From maxYear down to maxYear-99

  // Protect the page
  useEffect(() => {
    if (!loading && !isAuthenticated) {
      router.replace('/splash');
    }
  }, [isAuthenticated, loading, router]);

  // Initialize form data and initials
  useEffect(() => {
    const username = userProfile?.username || user?.displayName || '';
    const email = userProfile?.email || user?.email || '';
    
    setProfileForm({
      username,
      email,
    });

    // Get user's preferred units (default: kg for weight, ft for height)
    const prefWeightUnit = userProfile?.weightUnit || 'kg';
    const prefHeightUnit = userProfile?.heightUnit || 'ft';
    setWeightUnit(prefWeightUnit);
    setHeightUnit(prefHeightUnit);

    // Convert stored values (always in kg/cm) to user's preferred display units
    const storedWeightKg = userProfile?.weight || '';
    const storedHeightCm = userProfile?.height || '';

    // Weight: convert kg to lbs if user prefers lbs
    let displayWeight = storedWeightKg;
    if (storedWeightKg && prefWeightUnit === 'lbs') {
      displayWeight = Math.round(storedWeightKg * 2.20462 * 10) / 10;
    }

    // Height: convert cm to ft/in if user prefers ft
    let displayHeight = storedHeightCm;
    let displayFeet = '';
    let displayInches = '';
    if (storedHeightCm && prefHeightUnit === 'ft') {
      const totalInches = storedHeightCm / 2.54;
      displayFeet = Math.floor(totalInches / 12).toString();
      displayInches = Math.round(totalInches % 12).toString();
    }

    setBodyForm({
      birthMonth: userProfile?.birthMonth || '',
      birthYear: userProfile?.birthYear || '',
      weight: displayWeight,
      height: displayHeight,
    });
    setHeightFeet(displayFeet);
    setHeightInches(displayInches);
    
    if (username) {
      const names = username.trim().split(' ').filter(n => n.length > 0);
      const initials = names.map(n => n[0].toUpperCase()).join('').slice(0, 2);
      if (initials) setUserInitials(initials);
    } else if (email) {
      const emailUsername = email.split('@')[0];
      setUserInitials(emailUsername.slice(0, 2).toUpperCase());
    }
  }, [userProfile, user]);

  const handleProfileChange = (e) => {
    const { name, value } = e.target;
    setProfileForm(prev => ({ ...prev, [name]: value }));
  };

  const handleBodyChange = (e) => {
    const { name, value } = e.target;
    setBodyForm(prev => ({ ...prev, [name]: value }));
  };

  const handlePasswordChange = (e) => {
    const { name, value } = e.target;
    setPasswordData(prev => ({ ...prev, [name]: value }));
    setPasswordError('');
  };

  const handleSaveProfile = async () => {
    setIsSaving(true);
    try {
      await updateUserProfile({
        username: profileForm.username,
      });
      setIsEditingProfile(false);
    } catch (error) {
      console.error('Error saving profile:', error);
      alert('Failed to save changes. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveBody = async () => {
    setIsSaving(true);
    try {
      // Always store in standardized units: kg for weight, cm for height
      let heightCm = null;
      let weightKg = null;

      // Convert height to cm for storage
      if (heightUnit === 'ft') {
        const feet = parseInt(heightFeet, 10) || 0;
        const inches = parseInt(heightInches, 10) || 0;
        heightCm = Math.round(feet * 30.48 + inches * 2.54);
      } else {
        heightCm = bodyForm.height ? parseFloat(bodyForm.height) : null;
      }

      // Convert weight to kg for storage
      if (weightUnit === 'lbs') {
        weightKg = bodyForm.weight ? Math.round(parseFloat(bodyForm.weight) * 0.453592 * 10) / 10 : null;
      } else {
        weightKg = bodyForm.weight ? parseFloat(bodyForm.weight) : null;
      }

      // Only save standardized values (kg, cm) and user's preferred units
      await updateUserProfile({
        birthMonth: bodyForm.birthMonth || null,
        birthYear: bodyForm.birthYear ? parseInt(bodyForm.birthYear) : null,
        weight: weightKg,  // Always in kg
        height: heightCm,  // Always in cm
        weightUnit,        // User's preferred display unit
        heightUnit,        // User's preferred display unit
      });
      setIsEditingBody(false);
    } catch (error) {
      console.error('Error saving body metrics:', error);
      alert('Failed to save changes. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelProfile = () => {
    setProfileForm({
      username: userProfile?.username || user?.displayName || '',
      email: userProfile?.email || user?.email || '',
    });
    setIsEditingProfile(false);
  };

  const handleCancelBody = () => {
    // Reset to user's preferred units
    const prefWeightUnit = userProfile?.weightUnit || 'kg';
    const prefHeightUnit = userProfile?.heightUnit || 'ft';
    setWeightUnit(prefWeightUnit);
    setHeightUnit(prefHeightUnit);

    // Convert stored values (always in kg/cm) back to display units
    const storedWeightKg = userProfile?.weight || '';
    const storedHeightCm = userProfile?.height || '';

    let displayWeight = storedWeightKg;
    if (storedWeightKg && prefWeightUnit === 'lbs') {
      displayWeight = Math.round(storedWeightKg * 2.20462 * 10) / 10;
    }

    let displayHeight = storedHeightCm;
    let displayFeet = '';
    let displayInches = '';
    if (storedHeightCm && prefHeightUnit === 'ft') {
      const totalInches = storedHeightCm / 2.54;
      displayFeet = Math.floor(totalInches / 12).toString();
      displayInches = Math.round(totalInches % 12).toString();
    }

    setBodyForm({
      birthMonth: userProfile?.birthMonth || '',
      birthYear: userProfile?.birthYear || '',
      weight: displayWeight,
      height: displayHeight,
    });
    setHeightFeet(displayFeet);
    setHeightInches(displayInches);
    setIsEditingBody(false);
  };

  const handleChangePassword = async () => {
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setPasswordError('Passwords do not match');
      return;
    }
    if (passwordData.newPassword.length < 6) {
      setPasswordError('Password must be at least 6 characters');
      return;
    }

    setIsChangingPassword(true);
    setPasswordError('');

    try {
      // Re-authenticate user first
      const credential = EmailAuthProvider.credential(user.email, passwordData.currentPassword);
      await reauthenticateWithCredential(user, credential);
      
      // Update password
      await updatePassword(user, passwordData.newPassword);
      
      setShowPasswordModal(false);
      setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
      alert('Password changed successfully!');
    } catch (error) {
      console.error('Error changing password:', error);
      if (error.code === 'auth/wrong-password') {
        setPasswordError('Current password is incorrect');
      } else if (error.code === 'auth/weak-password') {
        setPasswordError('Password is too weak');
      } else {
        setPasswordError('Failed to change password. Please try again.');
      }
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== 'DELETE') return;
    
    setIsDeleting(true);
    try {
      // Delete user data from Firestore
      if (user?.uid) {
        await deleteDoc(doc(db, 'users', user.uid));
      }
      
      // Delete Firebase Auth account
      await deleteUser(user);
      
      // Redirect to splash
      router.replace('/splash');
    } catch (error) {
      console.error('Error deleting account:', error);
      if (error.code === 'auth/requires-recent-login') {
        alert('For security, please sign out and sign back in before deleting your account.');
      } else {
        alert('Failed to delete account. Please try again.');
      }
    } finally {
      setIsDeleting(false);
      setShowDeleteModal(false);
    }
  };

  const handleSignOutConfirm = async () => {
    try {
      setShowSignOutModal(false);
      await signOut();
      router.replace('/splash');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  if (loading) {
    return <LoadingScreen message="Loading..." />;
  }

  if (!isAuthenticated) {
    return <LoadingScreen message="Redirecting..." />;
  }

  const isEmailProvider = userProfile?.provider !== 'google';
  
  // Get month name from month number
  const getMonthName = (month) => {
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 
                    'July', 'August', 'September', 'October', 'November', 'December'];
    if (!month) return '';
    if (typeof month === 'string') {
      // If it's already a month name, return it (case-insensitive match)
      const found = months.find(m => m.toLowerCase() === month.toLowerCase());
      if (found) return found;
      // If it's a number string, convert to month name
      const num = parseInt(month);
      if (!isNaN(num) && num >= 1 && num <= 12) return months[num - 1];
      return month; // fallback: return as-is
    }
    if (typeof month === 'number' && month >= 1 && month <= 12) {
      return months[month - 1];
    }
    return '';
  };

  // Format birthdate display
  const getBirthdateDisplay = () => {
    if (bodyForm.birthMonth && bodyForm.birthYear) {
      return `${getMonthName(bodyForm.birthMonth)} ${bodyForm.birthYear}`;
    }
    return 'Not set';
  };

  return (
    <div className="min-h-screen bg-black text-white pb-32">
      <Head>
        <title>Settings — AppLift</title>
        <meta name="theme-color" content="#0b0b0d" />
      </Head>

      <BottomNav />
      
      <main className="w-full px-4 sm:px-6 md:px-8 pt-10 sm:pt-10 pb-4 md:pb-6">
        <div className="w-full max-w-xl mx-auto space-y-6">
          
          {/* Header */}
          <div className="content-fade-up-1">
            <h1 className="text-2xl sm:text-3xl font-bold text-white">Settings</h1>
            <p className="text-sm text-white/60 mt-1">Manage your account</p>
          </div>

          {/* Profile Card */}
          <section className="content-fade-up-2">
            <div className="rounded-2xl bg-white/10  overflow-hidden">
              {/* Profile Header */}
              <div className="p-5 flex items-center gap-4 border-b border-white/10">
                {/* Avatar */}
                <div 
                  className="w-16 h-16 rounded-full border-2 border-white/20 flex items-center justify-center flex-shrink-0"
                  style={getUserAvatarColorStyle(user?.uid)}
                >
                  <span className="text-xl font-semibold text-white">{userInitials}</span>
                </div>
                
                {/* Name & Email */}
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg font-semibold text-white truncate">
                    {userProfile?.username || user?.displayName || 'User'}
                  </h2>
                  <p className="text-sm text-white/60 truncate">
                    {userProfile?.email || user?.email}
                  </p>
                </div>

                {/* Edit Button - Violet pencil icon */}
                {!isEditingProfile && (
                  <button
                    onClick={() => setIsEditingProfile(true)}
                    className="p-2 rounded-full hover:bg-violet-500/20 transition-colors"
                    aria-label="Edit profile"
                  >
                    <svg className="w-5 h-5 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </button>
                )}
              </div>

              {/* Edit Profile Form */}
              {isEditingProfile && (
                <div className="p-5 space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-white/60 mb-1.5 uppercase tracking-wide">
                      Username
                    </label>
                    <input
                      type="text"
                      name="username"
                      value={profileForm.username}
                      onChange={handleProfileChange}
                      className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/40 focus:outline-none focus:border-white/30 focus:bg-white/10 transition-colors"
                      placeholder="Enter username"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-white/60 mb-1.5 uppercase tracking-wide">
                      Email
                    </label>
                    <input
                      type="email"
                      name="email"
                      value={profileForm.email}
                      disabled
                      className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white/50 cursor-not-allowed"
                    />
                    <p className="text-xs text-white/40 mt-1">Email cannot be changed</p>
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={handleCancelProfile}
                      className="flex-1 px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/90 font-medium transition-colors border border-white/10"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveProfile}
                      disabled={isSaving}
                      className="flex-1 px-4 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-medium transition-colors disabled:opacity-50"
                    >
                      {isSaving ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Personal Information Section */}
          <section className="content-fade-up-3">
            <div className="flex items-center justify-between mb-3 px-1">
              <h3 className="text-xs font-semibold text-white/50 uppercase tracking-wide">Personal Information</h3>
              {!isEditingBody && (
                <button
                  onClick={() => setIsEditingBody(true)}
                  className="p-1.5 rounded-full hover:bg-violet-500/20 transition-colors"
                  aria-label="Edit personal information"
                >
                  <svg className="w-4 h-4 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                </button>
              )}
            </div>
            <div className="rounded-2xl bg-white/10  overflow-hidden">
              {isEditingBody ? (
                <div className="p-5 space-y-4">
                  {/* Birth Month & Year - iOS-style scroll picker */}
                  <div>
                    <label className="block text-xs font-medium text-white/60 mb-3 uppercase tracking-wide text-center">
                      Birth Month & Year
                    </label>
                    <BirthdayPicker
                      months={months}
                      years={years}
                      selectedMonth={bodyForm.birthMonth || months[0]}
                      selectedYear={bodyForm.birthYear ? parseInt(bodyForm.birthYear) : years[0]}
                      onMonthChange={(month) => setBodyForm(prev => ({ ...prev, birthMonth: month }))}
                      onYearChange={(year) => setBodyForm(prev => ({ ...prev, birthYear: year }))}
                    />
                  </div>

                  {/* Weight - same style as signup */}
                  <div>
                    <label className="block text-xs font-medium text-white/60 mb-2 uppercase tracking-wide">Weight</label>
                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        <input
                          value={bodyForm.weight}
                          inputMode="numeric"
                          pattern="[0-9]*"
                          onChange={(e) => setBodyForm(prev => ({ ...prev, weight: e.target.value }))}
                          className="w-full rounded-full px-4 bg-black/40 text-white placeholder-white/40 border border-white/10 focus:outline-none focus:ring-2 focus:ring-[#8b5cf6]/50 transition-all"
                          style={{ height: '2.5rem' }}
                          placeholder={userProfile?.weight ? `Current: ${userProfile.weight}` : 'e.g., 70'}
                        />
                      </div>
                      <div className="flex gap-1" style={{ minWidth: 'fit-content' }}>
                        {[{ value: 'kg', label: 'kg' }, { value: 'lbs', label: 'lbs' }].map((unit) => {
                          const selected = weightUnit === unit.value;
                          return (
                            <button
                              key={unit.value}
                              type="button"
                              onClick={() => {
                                if (weightUnit !== unit.value && bodyForm.weight) {
                                  const currentWeight = parseFloat(bodyForm.weight);
                                  if (!isNaN(currentWeight)) {
                                    let convertedWeight;
                                    if (unit.value === 'lbs' && weightUnit === 'kg') {
                                      // kg to lbs
                                      convertedWeight = (currentWeight * 2.20462).toFixed(1);
                                    } else if (unit.value === 'kg' && weightUnit === 'lbs') {
                                      // lbs to kg
                                      convertedWeight = (currentWeight / 2.20462).toFixed(1);
                                    }
                                    if (convertedWeight) {
                                      setBodyForm(prev => ({ ...prev, weight: convertedWeight }));
                                    }
                                  }
                                }
                                setWeightUnit(unit.value);
                              }}
                              className={`rounded-xl text-xs font-medium transition flex items-center justify-center ${selected ? 'bg-[#8b5cf6] text-white' : 'bg-white/10 text-white/70 border border-white/20'}`}
                              style={{ width: '2.75rem', height: '2.5rem' }}
                            >
                              {unit.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Height - same style as signup */}
                  {heightUnit === 'ft' ? (
                    <div className="space-y-2">
                      <label className="block text-xs font-medium text-white/60 uppercase tracking-wide">Height</label>
                      <div className="flex items-end gap-2">
                        <div className="flex gap-2 flex-1">
                          <label className="flex-1 block">
                            <span className="text-xs block mb-1 text-white/50">Feet</span>
                            <input
                              value={heightFeet}
                              inputMode="numeric"
                              pattern="[0-9]*"
                              onChange={(e) => setHeightFeet(e.target.value)}
                              className="w-full rounded-full px-4 bg-black/40 text-white placeholder-white/40 border border-white/10 focus:outline-none focus:ring-2 focus:ring-[#8b5cf6]/50 transition-all"
                              style={{ height: '2.5rem' }}
                              placeholder={userProfile?.heightFeet ? `${userProfile.heightFeet}` : 'e.g., 5'}
                            />
                          </label>
                          <label className="flex-1 block">
                            <span className="text-xs block mb-1 text-white/50">Inches</span>
                            <input
                              value={heightInches}
                              inputMode="numeric"
                              pattern="[0-9]*"
                              onChange={(e) => setHeightInches(e.target.value)}
                              className="w-full rounded-full px-4 bg-black/40 text-white placeholder-white/40 border border-white/10 focus:outline-none focus:ring-2 focus:ring-[#8b5cf6]/50 transition-all"
                              style={{ height: '2.5rem' }}
                              placeholder={userProfile?.heightInches ? `${userProfile.heightInches}` : 'e.g., 10'}
                            />
                          </label>
                        </div>
                        <div className="flex gap-1" style={{ minWidth: 'fit-content' }}>
                          {[{ value: 'ft', label: 'ft' }, { value: 'cm', label: 'cm' }].map((unit) => {
                            const selected = heightUnit === unit.value;
                            return (
                              <button
                                key={unit.value}
                                type="button"
                                onClick={() => {
                                  if (heightUnit !== unit.value) {
                                    if (unit.value === 'cm' && heightUnit === 'ft') {
                                      // ft/in to cm
                                      const feet = parseFloat(heightFeet) || 0;
                                      const inches = parseFloat(heightInches) || 0;
                                      if (feet > 0 || inches > 0) {
                                        const totalCm = Math.round((feet * 30.48) + (inches * 2.54));
                                        setBodyForm(prev => ({ ...prev, height: totalCm.toString() }));
                                      }
                                    } else if (unit.value === 'ft' && heightUnit === 'cm') {
                                      // cm to ft/in
                                      const cm = parseFloat(bodyForm.height) || 0;
                                      if (cm > 0) {
                                        const totalInches = cm / 2.54;
                                        const feet = Math.floor(totalInches / 12);
                                        const inches = Math.round(totalInches % 12);
                                        setHeightFeet(feet.toString());
                                        setHeightInches(inches.toString());
                                      }
                                    }
                                  }
                                  setHeightUnit(unit.value);
                                }}
                                className={`rounded-xl text-xs font-medium transition flex items-center justify-center ${selected ? 'bg-[#8b5cf6] text-white' : 'bg-white/10 text-white/70 border border-white/20'}`}
                                style={{ width: '2.75rem', height: '2.5rem' }}
                              >
                                {unit.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <label className="block text-xs font-medium text-white/60 mb-2 uppercase tracking-wide">Height</label>
                      <div className="flex items-center gap-2">
                        <div className="flex-1">
                          <input
                            value={bodyForm.height}
                            inputMode="numeric"
                            pattern="[0-9]*"
                            onChange={(e) => setBodyForm(prev => ({ ...prev, height: e.target.value }))}
                            className="w-full rounded-full px-4 bg-black/40 text-white placeholder-white/40 border border-white/10 focus:outline-none focus:ring-2 focus:ring-[#8b5cf6]/50 transition-all"
                            style={{ height: '2.5rem' }}
                            placeholder={userProfile?.height ? `Current: ${userProfile.height}` : 'e.g., 170'}
                          />
                        </div>
                        <div className="flex gap-1" style={{ minWidth: 'fit-content' }}>
                          {[{ value: 'ft', label: 'ft' }, { value: 'cm', label: 'cm' }].map((unit) => {
                            const selected = heightUnit === unit.value;
                            return (
                              <button
                                key={unit.value}
                                type="button"
                                onClick={() => {
                                  if (heightUnit !== unit.value) {
                                    if (unit.value === 'cm' && heightUnit === 'ft') {
                                      // ft/in to cm
                                      const feet = parseFloat(heightFeet) || 0;
                                      const inches = parseFloat(heightInches) || 0;
                                      if (feet > 0 || inches > 0) {
                                        const totalCm = Math.round((feet * 30.48) + (inches * 2.54));
                                        setBodyForm(prev => ({ ...prev, height: totalCm.toString() }));
                                      }
                                    } else if (unit.value === 'ft' && heightUnit === 'cm') {
                                      // cm to ft/in
                                      const cm = parseFloat(bodyForm.height) || 0;
                                      if (cm > 0) {
                                        const totalInches = cm / 2.54;
                                        const feet = Math.floor(totalInches / 12);
                                        const inches = Math.round(totalInches % 12);
                                        setHeightFeet(feet.toString());
                                        setHeightInches(inches.toString());
                                      }
                                    }
                                  }
                                  setHeightUnit(unit.value);
                                }}
                                className={`rounded-xl text-xs font-medium transition flex items-center justify-center ${selected ? 'bg-[#8b5cf6] text-white' : 'bg-white/10 text-white/70 border border-white/20'}`}
                                style={{ width: '2.75rem', height: '2.5rem' }}
                              >
                                {unit.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={handleCancelBody}
                      className="flex-1 px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/90 font-medium transition-colors border border-white/10"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveBody}
                      disabled={isSaving}
                      className="flex-1 px-4 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-medium transition-colors disabled:opacity-50"
                    >
                      {isSaving ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {/* Birthdate - New calendar SVG icon */}
                  <div className="px-5 py-4 flex items-center justify-between border-b border-white/10">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
                        <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                          <path d="M3 9H21M7 3V5M17 3V5M6 12H8M11 12H13M16 12H18M6 15H8M11 15H13M16 15H18M6 18H8M11 18H13M16 18H18M6.2 21H17.8C18.9201 21 19.4802 21 19.908 20.782C20.2843 20.5903 20.5903 20.2843 20.782 19.908C21 19.4802 21 18.9201 21 17.8V8.2C21 7.07989 21 6.51984 20.782 6.09202C20.5903 5.71569 20.2843 5.40973 19.908 5.21799C19.4802 5 18.9201 5 17.8 5H6.2C5.0799 5 4.51984 5 4.09202 5.21799C3.71569 5.40973 3.40973 5.71569 3.21799 6.09202C3 6.51984 3 7.07989 3 8.2V17.8C3 18.9201 3 19.4802 3.21799 19.908C3.40973 20.2843 3.71569 20.5903 4.09202 20.782C4.51984 21 5.07989 21 6.2 21Z" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-white">Birthdate</p>
                        <p className="text-xs text-white/50">{getBirthdateDisplay()}</p>
                      </div>
                    </div>
                  </div>

                  {/* Weight - New scale SVG icon */}
                  <div className="px-5 py-4 flex items-center justify-between border-b border-white/10">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
                        <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 8L13 6M7.0998 7.0011C7.03435 7.32387 7 7.65792 7 8C7 10.7614 9.23858 13 12 13C14.7614 13 17 10.7614 17 8C17 7.65792 16.9656 7.32387 16.9002 7.0011M7.0998 7.0011C7.56264 4.71831 9.58065 3 12 3C14.4193 3 16.4374 4.71831 16.9002 7.0011M7.0998 7.0011C5.87278 7.00733 5.1837 7.04895 4.63803 7.32698C4.07354 7.6146 3.6146 8.07354 3.32698 8.63803C3 9.27976 3 10.1198 3 11.8V16.2C3 17.8802 3 18.7202 3.32698 19.362C3.6146 19.9265 4.07354 20.3854 4.63803 20.673C5.27976 21 6.11984 21 7.8 21H16.2C17.8802 21 18.7202 21 19.362 20.673C19.9265 20.3854 20.3854 19.9265 20.673 19.362C21 18.7202 21 17.8802 21 16.2V11.8C21 10.1198 21 9.27976 20.673 8.63803C20.3854 8.07354 19.9265 7.6146 19.362 7.32698C18.8163 7.04895 18.1272 7.00733 16.9002 7.0011" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-white">Weight</p>
                        <p className="text-xs text-white/50">{bodyForm.weight ? `${bodyForm.weight} kg` : 'Not set'}</p>
                      </div>
                    </div>
                  </div>

                  {/* Height - New height SVG icon */}
                  <div className="px-5 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
                        <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 22V2M12 22L8 18M12 22L16 18M12 2L8 6M12 2L16 6" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-white">Height</p>
                        <p className="text-xs text-white/50">{bodyForm.height ? `${bodyForm.height} cm` : 'Not set'}</p>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </section>

          {/* Account Section */}
          <section className="content-fade-up-4">
            <h3 className="text-xs font-semibold text-white/50 uppercase tracking-wide mb-3 px-1">Account</h3>
            <div className="rounded-2xl bg-white/10  overflow-hidden">
              {/* Account Provider - Non-editable with disabled styling */}
              <div className="px-5 py-4 flex items-center justify-between border-b border-white/10 opacity-60">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center">
                    {userProfile?.provider === 'google' ? (
                      <svg className="w-4 h-4 opacity-70" viewBox="0 0 24 24">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                      </svg>
                    ) : (
                      <svg className="w-4 h-4 text-white/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white/70">Sign-in Method</p>
                    <p className="text-xs text-white/40 capitalize">{userProfile?.provider || 'Email'}</p>
                  </div>
                </div>
              </div>

              {/* Change Password - Only for email users - New lock SVG icon */}
              {isEmailProvider && (
                <button
                  onClick={() => setShowPasswordModal(true)}
                  className="w-full px-5 py-4 flex items-center justify-between border-b border-white/10 hover:bg-white/5 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
                      <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 14.5V16.5M7 10.0288C7.47142 10 8.05259 10 8.8 10H15.2C15.9474 10 16.5286 10 17 10.0288M7 10.0288C6.41168 10.0647 5.99429 10.1455 5.63803 10.327C5.07354 10.6146 4.6146 11.0735 4.32698 11.638C4 12.2798 4 13.1198 4 14.8V16.2C4 17.8802 4 18.7202 4.32698 19.362C4.6146 19.9265 5.07354 20.3854 5.63803 20.673C6.27976 21 7.11984 21 8.8 21H15.2C16.8802 21 17.7202 21 18.362 20.673C18.9265 20.3854 19.3854 19.9265 19.673 19.362C20 18.7202 20 17.8802 20 16.2V14.8C20 13.1198 20 12.2798 19.673 11.638C19.3854 11.0735 18.9265 10.6146 18.362 10.327C18.0057 10.1455 17.5883 10.0647 17 10.0288M7 10.0288V8C7 5.23858 9.23858 3 12 3C14.7614 3 17 5.23858 17 8V10.0288" />
                      </svg>
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-medium text-white">Change Password</p>
                      <p className="text-xs text-white/50">Update your password</p>
                    </div>
                  </div>
                  <svg className="w-4 h-4 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              )}

              {/* Member Since - Non-editable with disabled styling */}
              <div className="px-5 py-4 flex items-center justify-between opacity-60">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center">
                    <svg className="w-4 h-4 text-white/50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M3 9H21M7 3V5M17 3V5M6 12H8M11 12H13M16 12H18M6 15H8M11 15H13M16 15H18M6 18H8M11 18H13M16 18H18M6.2 21H17.8C18.9201 21 19.4802 21 19.908 20.782C20.2843 20.5903 20.5903 20.2843 20.782 19.908C21 19.4802 21 18.9201 21 17.8V8.2C21 7.07989 21 6.51984 20.782 6.09202C20.5903 5.71569 20.2843 5.40973 19.908 5.21799C19.4802 5 18.9201 5 17.8 5H6.2C5.0799 5 4.51984 5 4.09202 5.21799C3.71569 5.40973 3.40973 5.71569 3.21799 6.09202C3 6.51984 3 7.07989 3 8.2V17.8C3 18.9201 3 19.4802 3.21799 19.908C3.40973 20.2843 3.71569 20.5903 4.09202 20.782C4.51984 21 5.07989 21 6.2 21Z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white/70">Member Since</p>
                    <p className="text-xs text-white/40">
                      {userProfile?.createdAt?.toDate ? 
                        userProfile.createdAt.toDate().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : 
                        user?.metadata?.creationTime ? 
                          new Date(user.metadata.creationTime).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) :
                          'Recently'
                      }
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Danger Zone */}
          <section className="content-fade-up-4">
            <h3 className="text-xs font-semibold text-white/50 uppercase tracking-wide mb-3 px-1">Danger Zone</h3>
            <div className="rounded-2xl bg-white/10  overflow-hidden">
              {/* Sign Out */}
              <button
                onClick={() => setShowSignOutModal(true)}
                className="w-full px-5 py-4 flex items-center gap-3 hover:bg-white/5 transition-colors border-b border-white/10"
              >
                <div className="w-8 h-8 rounded-full bg-orange-500/20 flex items-center justify-center">
                  <svg className="w-4 h-4 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 12L13 12" />
                    <path d="M18 15L20.913 12.087V12.087C20.961 12.039 20.961 11.961 20.913 11.913V11.913L18 9" />
                    <path d="M16 5V4.5V4.5C16 3.67157 15.3284 3 14.5 3H5C3.89543 3 3 3.89543 3 5V19C3 20.1046 3.89543 21 5 21H14.5C15.3284 21 16 20.3284 16 19.5V19.5V19" />
                  </svg>
                </div>
                <span className="text-sm font-medium text-orange-400">Sign Out</span>
              </button>

              {/* Delete Account */}
              <button
                onClick={() => setShowDeleteModal(true)}
                className="w-full px-5 py-4 flex items-center gap-3 hover:bg-white/5 transition-colors"
              >
                <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center">
                  <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </div>
                <span className="text-sm font-medium text-red-400">Delete Account</span>
              </button>
            </div>
          </section>

          {/* Footer */}
          <div className="text-center content-fade-up-4 pt-6 pb-4 space-y-1">
            <p className="text-xs text-white/30">AppLift v1.0.0</p>
            <p className="text-xs text-white/20">© 2026 AppLift. All rights reserved.</p>
          </div>
        </div>
      </main>

      {/* Sign Out Confirmation Modal */}
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
            className="relative max-w-xs w-full p-6 rounded-2xl bg-white/10  shadow-xl modal-content-fade-in"
            style={{
              boxShadow: '0 10px 40px rgba(0, 0, 0, 0.4)',
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
                className="flex-1 px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/90 font-medium transition-colors border border-white/10"
              >
                Cancel
              </button>
              <button
                onClick={handleSignOutConfirm}
                className="flex-1 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-medium transition-colors"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Change Password Modal */}
      {showPasswordModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4 modal-fade-in"
          style={{
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
          }}
          onClick={() => setShowPasswordModal(false)}
        >
          <div
            className="relative max-w-sm w-full p-6 rounded-2xl bg-white/10  shadow-xl modal-content-fade-in"
            style={{
              boxShadow: '0 10px 40px rgba(0, 0, 0, 0.4)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-center mb-5">
              <div className="w-14 h-14 rounded-full bg-white/10 flex items-center justify-center mx-auto mb-4">
                <svg className="w-7 h-7 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 14.5V16.5M7 10.0288C7.47142 10 8.05259 10 8.8 10H15.2C15.9474 10 16.5286 10 17 10.0288M7 10.0288C6.41168 10.0647 5.99429 10.1455 5.63803 10.327C5.07354 10.6146 4.6146 11.0735 4.32698 11.638C4 12.2798 4 13.1198 4 14.8V16.2C4 17.8802 4 18.7202 4.32698 19.362C4.6146 19.9265 5.07354 20.3854 5.63803 20.673C6.27976 21 7.11984 21 8.8 21H15.2C16.8802 21 17.7202 21 18.362 20.673C18.9265 20.3854 19.3854 19.9265 19.673 19.362C20 18.7202 20 17.8802 20 16.2V14.8C20 13.1198 20 12.2798 19.673 11.638C19.3854 11.0735 18.9265 10.6146 18.362 10.327C18.0057 10.1455 17.5883 10.0647 17 10.0288M7 10.0288V8C7 5.23858 9.23858 3 12 3C14.7614 3 17 5.23858 17 8V10.0288" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">Change Password</h3>
            </div>
            
            <div className="space-y-4 mb-5">
              <div>
                <label className="block text-xs font-medium text-white/60 mb-1.5 uppercase tracking-wide">
                  Current Password
                </label>
                <input
                  type="password"
                  name="currentPassword"
                  value={passwordData.currentPassword}
                  onChange={handlePasswordChange}
                  className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:border-orange-500/50 transition-colors"
                  placeholder="••••••••"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-white/60 mb-1.5 uppercase tracking-wide">
                  New Password
                </label>
                <input
                  type="password"
                  name="newPassword"
                  value={passwordData.newPassword}
                  onChange={handlePasswordChange}
                  className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:border-orange-500/50 transition-colors"
                  placeholder="••••••••"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-white/60 mb-1.5 uppercase tracking-wide">
                  Confirm New Password
                </label>
                <input
                  type="password"
                  name="confirmPassword"
                  value={passwordData.confirmPassword}
                  onChange={handlePasswordChange}
                  className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:border-orange-500/50 transition-colors"
                  placeholder="••••••••"
                />
              </div>
              {passwordError && (
                <p className="text-sm text-red-400 text-center">{passwordError}</p>
              )}
            </div>
            
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  setShowPasswordModal(false);
                  setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
                  setPasswordError('');
                }}
                className="flex-1 px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/90 font-medium transition-colors border border-white/10"
              >
                Cancel
              </button>
              <button
                onClick={handleChangePassword}
                disabled={isChangingPassword || !passwordData.currentPassword || !passwordData.newPassword || !passwordData.confirmPassword}
                className="flex-1 px-4 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isChangingPassword ? 'Changing...' : 'Change'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Account Modal */}
      {showDeleteModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4 modal-fade-in"
          style={{
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
          }}
          onClick={() => setShowDeleteModal(false)}
        >
          <div
            className="relative max-w-sm w-full p-6 rounded-2xl bg-white/10  shadow-xl modal-content-fade-in"
            style={{
              boxShadow: '0 10px 40px rgba(0, 0, 0, 0.4)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-center mb-5">
              <div className="w-14 h-14 rounded-full bg-yellow-500/20 flex items-center justify-center mx-auto mb-4">
                <svg className="w-7 h-7 text-yellow-400" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19.5099 5.85L13.5699 2.42C12.5999 1.86 11.3999 1.86 10.4199 2.42L4.48992 5.85C3.51992 6.41 2.91992 7.45 2.91992 8.58V15.42C2.91992 16.54 3.51992 17.58 4.48992 18.15L10.4299 21.58C11.3999 22.14 12.5999 22.14 13.5799 21.58L19.5199 18.15C20.4899 17.59 21.0899 16.55 21.0899 15.42V8.58C21.0799 7.45 20.4799 6.42 19.5099 5.85ZM11.2499 7.75C11.2499 7.34 11.5899 7 11.9999 7C12.4099 7 12.7499 7.34 12.7499 7.75V13C12.7499 13.41 12.4099 13.75 11.9999 13.75C11.5899 13.75 11.2499 13.41 11.2499 13V7.75ZM12.9199 16.63C12.8699 16.75 12.7999 16.86 12.7099 16.96C12.5199 17.15 12.2699 17.25 11.9999 17.25C11.8699 17.25 11.7399 17.22 11.6199 17.17C11.4899 17.12 11.3899 17.05 11.2899 16.96C11.1999 16.86 11.1299 16.75 11.0699 16.63C11.0199 16.51 10.9999 16.38 10.9999 16.25C10.9999 15.99 11.0999 15.73 11.2899 15.54C11.3899 15.45 11.4899 15.38 11.6199 15.33C11.9899 15.17 12.4299 15.26 12.7099 15.54C12.7999 15.64 12.8699 15.74 12.9199 15.87C12.9699 15.99 12.9999 16.12 12.9999 16.25C12.9999 16.38 12.9699 16.51 12.9199 16.63Z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">Delete Account</h3>
              <p className="text-sm text-red-400/90 font-medium mb-2">
                This action cannot be reverted
              </p>
              <p className="text-sm text-white/60 leading-relaxed">
                Deleting your account will permanently remove all your data, including workout history, settings, and personal information. This cannot be undone.
              </p>
            </div>
            
            <div className="mb-5">
              <label className="block text-xs font-medium text-white/60 mb-2 text-center">
                Type <span className="text-red-400 font-semibold">DELETE</span> to confirm
              </label>
              <input
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:border-red-500/50 transition-colors text-center"
                placeholder="DELETE"
              />
            </div>
            
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setDeleteConfirmText('');
                }}
                className="flex-1 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={deleteConfirmText !== 'DELETE' || isDeleting}
                className="flex-1 px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/90 font-medium transition-colors border border-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isDeleting ? 'Deleting...' : 'Delete Forever'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
