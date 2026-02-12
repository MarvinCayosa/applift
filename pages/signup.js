import Head from 'next/head'
import Link from 'next/link'
import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/router'
import { useUserProfile } from '../utils/userProfileStore'
import { useAuth } from '../context/AuthContext'
import { shouldUseAppMode } from '../utils/pwaInstalled'
import GoogleSignInButton from '../components/GoogleSignInButton'
import AuthErrorAlert from '../components/AuthErrorAlert'
import LoadingScreen from '../components/LoadingScreen'

const steps = [
  { id: 1, label: 'Terms' },
  { id: 2, label: 'Account' },
  { id: 3, label: 'Birthday' },
  { id: 4, label: 'Physical' },
  { id: 5, label: 'Fitness' },
]

// Birthday Picker - iOS-style wheel with center-based selection
function BirthdayPicker({ months, years, selectedMonth, selectedYear, onMonthChange, onYearChange, updateProfile }) {
  const monthRef = useRef(null)
  const yearRef = useRef(null)
  const scrollTimeoutRef = useRef(null)
  const lastIndexRef = useRef({ month: -1, year: -1 }) // Track last index for haptic feedback
  const itemHeight = 44

  // Initialize scroll position on mount
  useEffect(() => {
    if (monthRef.current) {
      if (selectedMonth && selectedMonth !== '') {
        // If there's a selected month, scroll to it
        const idx = months.indexOf(selectedMonth)
        if (idx !== -1) {
          monthRef.current.scrollTop = idx * itemHeight
          lastIndexRef.current.month = idx
        }
      } else {
        // If no selection, initialize with first visible item in center (index 0)
        monthRef.current.scrollTop = 0
        lastIndexRef.current.month = 0
        // Set the initial value to the first month
        if (onMonthChange) {
          onMonthChange(months[0])
        }
        if (updateProfile) {
          updateProfile({ birthMonth: months[0] })
        }
      }
    }
    if (yearRef.current) {
      if (selectedYear && selectedYear !== '') {
        // If there's a selected year, scroll to it
        const idx = years.indexOf(selectedYear)
        if (idx !== -1) {
          yearRef.current.scrollTop = idx * itemHeight
          lastIndexRef.current.year = idx
        }
      } else {
        // If no selection, initialize with first visible item in center (index 0)
        yearRef.current.scrollTop = 0
        lastIndexRef.current.year = 0
        // Set the initial value to the first year
        if (onYearChange) {
          onYearChange(years[0])
        }
        if (updateProfile) {
          updateProfile({ birthYear: years[0] })
        }
      }
    }
  }, [])

  // Haptic feedback helper for PWA
  const triggerHaptic = () => {
    if (navigator.vibrate) {
      navigator.vibrate(15) // Slightly more noticeable haptic feedback
    }
  }

  const handleScroll = (ref, items, setter, isMonth) => {
    if (!ref.current) return
    
    // Get current index while scrolling
    const scrollTop = ref.current.scrollTop
    const currentIndex = Math.round(scrollTop / itemHeight)
    const clamped = Math.max(0, Math.min(items.length - 1, currentIndex))
    
    // Check if index changed and trigger haptic for each tick
    const lastIndex = isMonth ? lastIndexRef.current.month : lastIndexRef.current.year
    if (lastIndex !== clamped) {
      triggerHaptic() // Haptic feedback for each value change
      if (isMonth) {
        lastIndexRef.current.month = clamped
      } else {
        lastIndexRef.current.year = clamped
      }
    }
    
    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current)
    scrollTimeoutRef.current = setTimeout(() => {
      const scrollTop = ref.current.scrollTop
      const index = Math.round(scrollTop / itemHeight)
      const clamped = Math.max(0, Math.min(items.length - 1, index))
      const selected = items[clamped]
      setter(selected)
      ref.current.scrollTop = clamped * itemHeight
      if (updateProfile) {
        if (isMonth) {
          updateProfile({ birthMonth: selected })
        } else {
          updateProfile({ birthYear: selected })
        }
      }
    }, 100)
  }

  const handleClickItem = (index, items, setter, isMonth) => {
    const ref = isMonth ? monthRef : yearRef
    const selected = items[index]
    setter(selected)
    if (ref.current) ref.current.scrollTop = index * itemHeight
    triggerHaptic() // Haptic feedback on date change
    if (isMonth) {
      lastIndexRef.current.month = index
    } else {
      lastIndexRef.current.year = index
    }
    if (updateProfile) {
      if (isMonth) {
        updateProfile({ birthMonth: selected })
      } else {
        updateProfile({ birthYear: selected })
      }
    }
  }

  return (
    <div className="relative">
      {/* Selection indicator */}
      <div
        className="absolute inset-x-0 z-10 pointer-events-none"
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
        className="absolute inset-x-0 top-0 z-20 pointer-events-none"
        style={{
          height: '88px',
          background: 'linear-gradient(to bottom, rgba(0,0,0,1), rgba(0,0,0,0))',
        }}
      />

      {/* Bottom fade */}
      <div
        className="absolute inset-x-0 bottom-0 z-20 pointer-events-none"
        style={{
          height: '88px',
          background: 'linear-gradient(to top, rgba(0,0,0,1), rgba(0,0,0,0))',
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
  )
}

export default function Signup() {
  const router = useRouter()
  const { profile, updateProfile } = useUserProfile()
  const { 
    user,
    userProfile,
    signUpWithEmail, 
    signInWithGoogle,
    completeOnboarding,
    isAuthenticated,
    isOnboardingComplete,
    loading,
    authError,
    clearError
  } = useAuth()
  
  // Get query params for Google OAuth flow
  const { step: queryStep, provider } = router.query
  const isGoogleUser = provider === 'google' || userProfile?.provider === 'google'
  
  // Initialize step - skip to step 3 for Google users
  const [step, setStep] = useState(1)
  const totalSteps = steps.length
  const reviewStep = totalSteps + 1
  const activeStepForBar = Math.min(step, totalSteps)
  const [isAppMode, setIsAppMode] = useState(false)
  const [localError, setLocalError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Step 1: Terms (session-based only, never persisted from profile)
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [consentAccepted, setConsentAccepted] = useState(false)
  const [termsScrolledToBottom, setTermsScrolledToBottom] = useState(false)
  const [consentScrolledToBottom, setConsentScrolledToBottom] = useState(false)
  const [step1Phase, setStep1Phase] = useState('terms') // 'terms' or 'consent'
  const termsContentRef = useRef(null)
  const consentContentRef = useRef(null)

  // Step 2: Account - MOVED BEFORE useEffects that reference these variables
  const [username, setUsername] = useState(profile.username || '')
  const [email, setEmail] = useState(profile.email || '')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [emailError, setEmailError] = useState(false)
  const [passwordError, setPasswordError] = useState(false)
  const [showPwReminder, setShowPwReminder] = useState(false)
  const emailRef = useRef(null)
  const passwordRef = useRef(null)
  const confirmRef = useRef(null)

  // Step 3: Gender & Birthday
  const [gender, setGender] = useState(profile.gender || '')
  const [birthMonth, setBirthMonth] = useState(profile.birthMonth || '')
  const [birthYear, setBirthYear] = useState(profile.birthYear || '')
  const [age, setAge] = useState(profile.age?.toString() || '')

  // Step 4: Physical
  const [weight, setWeight] = useState(profile.weight?.toString() || '')
  const [weightUnit, setWeightUnit] = useState(profile.weightUnit || 'kg')
  const [heightFeet, setHeightFeet] = useState(profile.heightFeet || '')
  const [heightInches, setHeightInches] = useState(profile.heightInches || '')
  const [heightValue, setHeightValue] = useState(profile.heightCm?.toString() || '')
  const [heightUnit, setHeightUnit] = useState(profile.heightUnit || 'cm')
  const [bmi, setBmi] = useState(profile.bmi || null)
  const [bmiCategory, setBmiCategory] = useState('')

  // Step 5: Fitness questionnaire
  const [questionAnswers, setQuestionAnswers] = useState({
    bodyType: '',
    weightResponse: '',
    strengthExperience: '',
    workoutFrequency: '',
    mainGoal: '',
    trainingPriority: '',
  })
  const [step5Phase, setStep5Phase] = useState('intro') // 'intro', 'question', 'summary'
  const [step5QuestionIndex, setStep5QuestionIndex] = useState(0)

  const [errors, setErrors] = useState([])

  useEffect(() => {
    if (typeof window === 'undefined') return
    setIsAppMode(shouldUseAppMode())
  }, [])

  // Handle step from URL query for Google users coming from login page
  useEffect(() => {
    if (queryStep && provider === 'google') {
      const stepNum = parseInt(queryStep, 10)
      // If coming from login with Google, start at step 3 (birthday)
      // This skips Terms (step 1) and Account creation (step 2) since Google provides auth
      if (stepNum >= 3 && stepNum <= totalSteps) {
        setStep(stepNum)
      }
    }
  }, [queryStep, provider, totalSteps])

  // Pre-fill email for Google users
  useEffect(() => {
    if (isGoogleUser && userProfile?.email && !email) {
      setEmail(userProfile.email)
      if (userProfile.displayName) {
        setUsername(userProfile.displayName)
      }
    }
  }, [isGoogleUser, userProfile, email])

  // Redirect if onboarding is already complete
  useEffect(() => {
    if (loading) return
    if (isAuthenticated && isOnboardingComplete) {
      router.replace('/dashboard')
    }
  }, [isAuthenticated, isOnboardingComplete, loading, router])

  // Clear all form inputs when user navigates away from signup page
  useEffect(() => {
    const handleRouteChange = (url) => {
      // Only clear if navigating away from signup
      if (!url.includes('/signup')) {
        // Clear all form state
        setUsername('')
        setEmail('')
        setPassword('')
        setConfirmPassword('')
        setGender('')
        setBirthMonth('')
        setBirthYear('')
        setAge('')
        setWeight('')
        setWeightUnit('kg')
        setHeightUnit('cm')
        setHeightFeet('')
        setHeightInches('')
        setHeightValue('')
        setBmi(null)
        setBmiCategory('')
        setQuestionAnswers({
          bodyType: '',
          weightResponse: '',
          strengthExperience: '',
          workoutFrequency: '',
          mainGoal: '',
          trainingPriority: '',
        })
        setStep(1)
        setStep1Phase('terms')
        setStep5Phase('intro')
        setStep5QuestionIndex(0)
        setTermsScrolledToBottom(false)
        setConsentScrolledToBottom(false)
        setLocalError('')
        setErrors([])
      }
    }

    router.events.on('routeChangeStart', handleRouteChange)
    
    return () => {
      router.events.off('routeChangeStart', handleRouteChange)
    }
  }, [router])

  function genUserId() {
    if (profile.userId) return profile.userId
    const id = `user_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`
    updateProfile({ userId: id })
    return id
  }

  const requirements = {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    number: /[0-9]/.test(password),
    special: /[!@#$%^&*(),.?"':{}|<>\-_=+\/\\\[\]`~;]/.test(password),
  }

  const passwordsMatch = password && password === confirmPassword
  const currentYear = new Date().getFullYear()
  const minYear = 1960
  const maxYear = currentYear - 18

  // Month options
  const monthOptions = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ]

  // Year options - sorted newest to oldest for user convenience
  const yearOptions = Array.from({ length: maxYear - minYear + 1 }, (_, i) => maxYear - i)

  // Height options - feet (4-7) and inches (0-11)
  const heightFeetOptions = Array.from({ length: 4 }, (_, i) => (4 + i).toString())
  const heightInchOptions = Array.from({ length: 12 }, (_, i) => i.toString())
  const heightCmOptions = Array.from({ length: 101 }, (_, i) => (120 + i).toString())

  // Compute age from month/year selections (approx: month-based without day)
  useEffect(() => {
    if (!birthMonth || !birthYear) {
      setAge('')
      updateProfile({ birthMonth, birthYear, age: null })
      return
    }
    const yearNum = birthYear
    const monthIndex = monthOptions.indexOf(birthMonth)
    if (Number.isNaN(yearNum) || monthIndex === -1) {
      setAge('')
      updateProfile({ birthMonth, birthYear, age: null })
      return
    }
    const now = new Date()
    let computed = now.getFullYear() - yearNum
    if (monthIndex > now.getMonth()) {
      computed -= 1
    }
    setAge(computed.toString())
    updateProfile({ birthMonth, birthYear, age: computed })
  }, [birthMonth, birthYear, monthOptions])

  // Calculate BMI when weight or height changes
  useEffect(() => {
    const weightNum = parseInt(weight, 10)
    // Convert weight to kg for BMI calculation if in lbs
    const weightInKg = weightUnit === 'lbs' ? weightNum * 0.453592 : weightNum
    let heightCm = 0

    if (heightUnit === 'ft') {
      const feet = parseInt(heightFeet, 10) || 0
      const inches = parseInt(heightInches, 10) || 0
      heightCm = Math.round(feet * 30.48 + inches * 2.54)
    } else {
      heightCm = parseInt(heightValue, 10) || 0
    }

    if (weightInKg > 0 && heightCm > 0) {
      const heightM = heightCm / 100
      const calculatedBmi = weightInKg / (heightM * heightM)
      const roundedBmi = Math.round(calculatedBmi * 10) / 10
      setBmi(roundedBmi)
      updateProfile({ bmi: roundedBmi, weight: Math.round(weightInKg), weightUnit })

      // Determine BMI category
      if (calculatedBmi < 18.5) {
        setBmiCategory('underweight')
      } else if (calculatedBmi < 25) {
        setBmiCategory('normal')
      } else if (calculatedBmi < 30) {
        setBmiCategory('overweight')
      } else {
        setBmiCategory('obese')
      }
    } else {
      setBmi(null)
      setBmiCategory('')
      updateProfile({ bmi: null })
    }
  }, [weight, weightUnit, heightFeet, heightInches, heightValue, heightUnit])

  const step5Questions = [
    {
      key: 'bodyType',
      title: 'How would you describe your natural body build?',
      subtitle: '',
      profileKey: 'bodyType',
      options: [
        { value: 'lean_slim', label: 'Slim', description: 'I have a lighter frame and less natural muscle mass.' },
        { value: 'average_medium', label: 'Average', description: 'I have a balanced frame with some natural muscle.' },
        { value: 'broad_muscular', label: 'Broad', description: 'I naturally have a stockier frame and more muscle mass.' },
      ],
    },
    {
      key: 'weightResponse',
      title: 'How easily do you gain or lose weight/muscle?',
      subtitle: '',
      profileKey: 'weightResponse',
      options: [
        { value: 'gain_easy_hard_lose', label: 'Gain Muscle Easily', description: 'My body responds quickly to training.' },
        { value: 'average_response', label: 'Average Response', description: 'I gain or lose slowly, depending on effort.' },
        { value: 'gain_slow_lose_easy', label: 'Lose Fat Easily', description: 'I struggle to build mass but lose fat fast.' },
      ],
    },
    {
      key: 'strengthExperience',
      title: 'How would you rate your current experience with strength training?',
      subtitle: '',
      profileKey: 'strengthExperience',
      options: [
        { value: 'beginner', label: 'Beginner', description: 'Little to no experience with dumbbells, barbells, or machines.' },
        { value: 'intermediate', label: 'Intermediate', description: 'I can perform exercises correctly and consistently.' },
        { value: 'advanced', label: 'Advanced', description: 'I have extensive experience and lift heavier weights safely.' },
      ],
    },
    {
      key: 'workoutFrequency',
      title: 'What is your current activity level?',
      subtitle: '',
      profileKey: 'activityLevel',
      isActivityLevel: true,
      options: [
        { value: 1, label: 'Sedentary', description: 'Daily basic activities' },
        { value: 2, label: 'Somewhat Active', description: '30-60 min daily moderate activity' },
        { value: 3, label: 'Active', description: 'Daily exercise or 3-4x per week' },
        { value: 4, label: 'Very Active', description: 'Intense exercise 6-7x per week' },
      ],
    },
    {
      key: 'mainGoal',
      title: 'What is your main goal for using AppLift?',
      subtitle: '',
      profileKey: 'fitnessGoal',
      options: [
        { value: 'build_strength', label: 'Build Strength', description: 'I want to lift heavier and improve power.' },
        { value: 'hypertrophy', label: 'Increase Muscle', description: 'I want to grow and shape my muscles.' },
        { value: 'conditioning', label: 'Improve Conditioning', description: 'I want better stamina and consistent performance.' },
      ],
    },
    {
      key: 'trainingPriority',
      title: 'What’s most important to you in your training?',
      subtitle: '',
      profileKey: 'trainingPriority',
      options: [
        { value: 'safety_form', label: 'Safety and Correct Form', description: 'Avoid injury and train correctly.' },
        { value: 'progressive_load', label: 'Progressive Load and Gains', description: 'See measurable improvement over time.' },
        { value: 'consistency', label: 'Consistency and Habit Building', description: 'Make workouts part of my routine.' },
      ],
    },
  ]

  const getStep5Label = (key, value) => {
    const question = step5Questions.find((q) => q.key === key)
    const option = question?.options.find((o) => o.value === value)
    return option?.label || value || '—'
  }


  function resetValidity() {
    if (emailRef.current) emailRef.current.setCustomValidity('')
    if (passwordRef.current) passwordRef.current.setCustomValidity('')
    if (confirmRef.current) confirmRef.current.setCustomValidity('')
    setEmailError(false)
    setPasswordError(false)
  }

  function handleTermsScroll(e) {
    const element = e.target
    const isAtBottom = Math.abs(
      element.scrollHeight - element.clientHeight - element.scrollTop
    ) < 10
    if (isAtBottom && !termsScrolledToBottom) {
      setTermsScrolledToBottom(true)
    }
  }

  function handleConsentScroll(e) {
    const element = e.target
    const isAtBottom = Math.abs(
      element.scrollHeight - element.clientHeight - element.scrollTop
    ) < 10
    if (isAtBottom && !consentScrolledToBottom) {
      setConsentScrolledToBottom(true)
    }
  }

  function validateAccountStep() {
    resetValidity()

    if (!email) {
      if (emailRef.current) {
        emailRef.current.reportValidity()
        emailRef.current.focus()
        setEmailError(true)
      }
      return false
    }

    if (!email.includes('@')) {
      if (emailRef.current) {
        emailRef.current.setCustomValidity('Email must contain an @')
        emailRef.current.reportValidity()
        emailRef.current.focus()
      }
      return false
    }

    const pwErrors = []
    if (!requirements.uppercase) pwErrors.push('include an uppercase letter')
    if (!requirements.number) pwErrors.push('include a number')
    if (!requirements.special) pwErrors.push('include a special character')
    if (!requirements.length) pwErrors.push('be at least 8 characters')

    if (pwErrors.length) {
      const message = `Password must ${pwErrors.join(', ')}`
      if (passwordRef.current) {
        passwordRef.current.setCustomValidity(message)
        passwordRef.current.reportValidity()
        passwordRef.current.focus()
        setPasswordError(true)
      }
      return false
    }

    if (!passwordsMatch) {
      if (confirmRef.current) {
        confirmRef.current.setCustomValidity('Passwords do not match')
        confirmRef.current.reportValidity()
        confirmRef.current.focus()
      }
      return false
    }

    return true
  }

  // Check if email already exists in Firebase
  async function checkEmailExists(emailToCheck) {
    try {
      // Temporarily disable email checking due to Firebase Admin config issues
      // TODO: Fix Firebase Admin configuration and re-enable this check
      console.log('Email checking disabled - Firebase Admin not configured');
      return false;
      
      // Use the Firebase REST API to check if user exists
      const response = await fetch('/api/check-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailToCheck.toLowerCase().trim() })
      });
      
      const data = await response.json();
      return data.exists === true;
    } catch (error) {
      console.error('Error checking email:', error);
      return false;
    }
  }

  function validateStep() {
    if (step === 1) {
      if (step1Phase === 'terms') {
        if (!termsAccepted) {
          setErrors(['Please agree to the Terms and Conditions to continue.'])
          return false
        }
        setErrors([])
        return true
      } else {
        if (!consentAccepted) {
          setErrors(['Please provide your informed consent to continue.'])
          return false
        }
        setErrors([])
        return true
      }
    }

    if (step === 2) {
      if (!username) {
        setErrors(['Please add a username or nickname.'])
        return false
      }
      const ok = validateAccountStep()
      setErrors(ok ? [] : [])
      return ok
    }

    if (step === 3) {
      if (!gender) {
        setErrors(['Please select a gender.'])
        return false
      }
      if (!birthMonth || !birthYear) {
        setErrors(['Please select both birth month and year.'])
        return false
      }
      setErrors([])
      return true
    }

    if (step === 4) {
      if (!weight) {
        setErrors(['Please add your weight.'])
        return false
      }
      if (heightUnit === 'ft' && (!heightFeet || !heightInches)) {
        setErrors(['Please select your height in feet and inches.'])
        return false
      }
      if (heightUnit === 'cm' && !heightValue) {
        setErrors(['Please select your height in centimeters.'])
        return false
      }
      setErrors([])
      return true
    }

    if (step === 5) {
      if (step5Phase === 'intro') {
        setErrors([])
        return true
      }
      if (step5Phase === 'question') {
        const currentQuestion = step5Questions[step5QuestionIndex]
        const answer = questionAnswers[currentQuestion.key]
        if (!answer) {
          setErrors(['Please choose an option to continue.'])
          return false
        }
        setErrors([])
        return true
      }
      if (step5Phase === 'summary') {
        setErrors([])
        return true
      }
    }

    return true
  }

  async function handleNext() {
    if (!validateStep()) return
    
    // Special handling for step 2 (Account) - check if email already exists
    if (step === 2 && !isGoogleUser) {
      setLocalError('');
      setIsSubmitting(true);
      
      try {
        const emailExists = await checkEmailExists(email);
        if (emailExists) {
          setLocalError('This email is already registered. Please use a different email or sign in instead.');
          setIsSubmitting(false);
          return;
        }
      } catch (error) {
        console.error('Error checking email:', error);
        setLocalError('Error verifying email. Please try again.');
        setIsSubmitting(false);
        return;
      }
      
      setIsSubmitting(false);
    }
    
    if (step === 1) {
      if (step1Phase === 'terms') {
        // Move to consent phase, same step
        setStep1Phase('consent')
        setConsentScrolledToBottom(false)
      } else {
        // User completed both terms and consent - save both to profile
        updateProfile({ 
          termsAccepted: true,
          termsAcceptedAt: new Date().toISOString(),
          consentAccepted: true,
          consentAcceptedAt: new Date().toISOString()
        })
        // For Google users, skip step 2 (Account) and go directly to step 3
        if (isGoogleUser) {
          setStep(3)
        } else {
          setStep(2)
        }
      }
    } else if (step === 5) {
      // Handle Step 5 question flow
      if (step5Phase === 'intro') {
        setStep5Phase('question')
        setStep5QuestionIndex(0)
      } else if (step5Phase === 'question') {
        const currentQuestion = step5Questions[step5QuestionIndex]
        const answer = questionAnswers[currentQuestion.key]
        if (!answer) return
        const isLast = step5QuestionIndex === step5Questions.length - 1
        if (isLast) {
          setStep5Phase('summary')
        } else {
          setStep5QuestionIndex((idx) => idx + 1)
        }
      } else if (step5Phase === 'summary') {
        // Move to review step (step 6) after fitness summary
        setStep(reviewStep)
      }
    } else if (step < totalSteps) {
      setStep(step + 1)
    } else {
      setStep(reviewStep)
    }
  }

  function handleBack() {
    if (step === 1 && step1Phase === 'consent') {
      // Go back to terms phase
      setStep1Phase('terms')
      setTermsScrolledToBottom(false)
      return
    }
    if (step === 5) {
      if (step5Phase === 'summary') {
        setStep5Phase('question')
        setStep5QuestionIndex(step5Questions.length - 1)
        return
      }
      if (step5Phase === 'question') {
        if (step5QuestionIndex > 0) {
          setStep5QuestionIndex((idx) => idx - 1)
          return
        }
        // If first question, return to intro
        setStep5Phase('intro')
        setStep5QuestionIndex(0)
        return
      }
    }
    // For Google users on step 3, go back to step 1 (skipping step 2)
    if (step === 3 && isGoogleUser) {
      setStep(1)
      setStep1Phase('consent')
      return
    }
    if (step === reviewStep) {
      setStep(totalSteps)
    } else if (step > 1) {
      setStep(step - 1)
    }
    // Note: Back button to splash is now handled separately at top of form
  }

  async function handleSubmit(e) {
    e.preventDefault();
    
    // Only create account at the final review step
    if (step !== reviewStep) {
      return;
    }
    
    setLocalError('');
    clearError();
    
    // For Google users, skip account validation (they already have credentials)
    if (!isGoogleUser && !validateAccountStep()) {
      setStep(2);
      return;
    }
    
    setIsSubmitting(true);
    
    // Gather all profile data
    // Always store standardized units: kg for weight, cm for height
    const weightNum = parseInt(weight, 10) || 0;
    const weightInKg = weightUnit === 'lbs' ? Math.round(weightNum * 0.453592) : weightNum;
    const heightInCm = heightUnit === 'ft' 
      ? Math.round((parseInt(heightFeet, 10) || 0) * 30.48 + (parseInt(heightInches, 10) || 0) * 2.54)
      : parseInt(heightValue, 10) || 0;

    // Build profile data, filtering out blank/null/undefined values
    const rawProfileData = {
      username,
      gender,
      birthMonth,
      birthYear,
      age: parseInt(age, 10) || null,
      weight: weightInKg || null,  // Always stored in kg
      weightUnit,                   // User's preferred display unit
      height: heightInCm || null,   // Always stored in cm
      heightUnit,                   // User's preferred display unit
      bmi,
      bmiCategory,
      // Map questionAnswers to actual profile keys
      bodyType: questionAnswers.bodyType || null,
      weightResponse: questionAnswers.weightResponse || null,
      strengthExperience: questionAnswers.strengthExperience || null,
      activityLevel: questionAnswers.workoutFrequency || null, // Save as activityLevel
      fitnessGoal: questionAnswers.mainGoal || null,
      trainingPriority: questionAnswers.trainingPriority || null,
      termsAccepted: true,
      termsAcceptedAt: new Date().toISOString(),
      consentAccepted: true,
      consentAcceptedAt: new Date().toISOString(),
      onboardingCompleted: true,
    };
    
    // Filter out null, undefined, and empty string values
    const profileData = Object.fromEntries(
      Object.entries(rawProfileData).filter(([key, value]) => 
        value !== null && value !== undefined && value !== ''
      )
    );
    
    try {
      console.log('📝 Starting account creation...');
      
      if (isGoogleUser) {
        // Google user completing onboarding - just update profile
        console.log('🔄 Completing Google onboarding...');
        await completeOnboarding(profileData);
      } else {
        // Email signup - create account with full profile data
        console.log('📧 Creating email account...');
        await signUpWithEmail(email, password, profileData);
      }
      
      console.log('✅ Account created successfully!');
      
      // Clear sensitive data
      setPassword('');
      setConfirmPassword('');
      
      // Update local profile store for immediate use
      updateProfile({
        ...profileData,
        email,
        onboardingCompleted: true,
      });
      
      console.log('🚀 Redirecting to dashboard...');
      
      // Use window.location.href for a hard redirect to ensure it works
      window.location.href = '/dashboard';
      
    } catch (err) {
      console.error('❌ Account creation error:', err);
      setLocalError(err.message);
      setErrors([err.message]);
      setIsSubmitting(false);
    }
  }

  // Handle Google Sign-in during signup
  async function handleGoogleSignUp() {
    setLocalError('');
    clearError();
    setIsSubmitting(true);
    
    try {
      const result = await signInWithGoogle();
      
      if (result.onboardingCompleted) {
        // Already completed onboarding - redirect happens automatically via useEffect
      } else {
        // New user or incomplete onboarding
        // Skip step 1 (Terms) and step 2 (Account credentials) since they have Google credentials
        // Go directly to step 3 (Birthday) to collect needed profile details
        if (result.user?.email) {
          setEmail(result.user.email);
        }
        if (result.user?.displayName) {
          setUsername(result.user.displayName);
        }
        // Start from step 3 (Birthday) - skip terms and account creation
        setStep(3);
        setIsSubmitting(false);
      }
    } catch (err) {
      setLocalError(err.message);
      setIsSubmitting(false);
    }
  }

  // Handle back to splash page
  const handleBackToSplash = (e) => {
    e.preventDefault();
    e.stopPropagation();
    // Go to splash page final slide (slide 3 = index 3 with Create Account/Sign In buttons)
    window.location.href = '/splash?slide=3';
  }

  const StepHeader = (
    <div style={{ marginBottom: 'clamp(0.75rem, 2vh, 1.5rem)' }}>
      <div className="flex items-center justify-between" style={{ marginBottom: 'clamp(0.5rem, 1.5vh, 0.75rem)' }}>
        <div className="font-medium" style={{ color: 'var(--app-white)', fontSize: 'clamp(0.8rem, 2.75vw, 0.875rem)' }}>Create your account</div>
        <div style={{ color: 'rgba(238,235,217,0.65)', fontSize: 'clamp(0.7rem, 2.5vw, 0.75rem)' }}>
          Step {Math.min(step, totalSteps)} of {totalSteps}
        </div>
      </div>
      <div className="flex items-center" style={{ gap: 'clamp(0.25rem, 1vw, 0.5rem)' }} aria-hidden>
        {steps.map((s, idx) => {
          const filled = idx < activeStepForBar
          const halfFilled = step === 1 && idx === 0
          return (
            <span
              key={s.id}
              className={`flex-1 rounded-full transition-all duration-200 ${filled ? 'bg-[#8b5cf6]' : halfFilled ? 'bg-[#8b5cf6]/50' : 'bg-white/15'}`}
              style={{ height: 'clamp(0.375rem, 1.5vh, 0.5rem)' }}
            />
          )
        })}
      </div>
    </div>
  )

  const termsContent = `TERMS & CONDITIONS

Accepting these Terms & Conditions enables your AppLift account and describes permitted uses, user responsibilities, intellectual property, limitation of liability, and termination.

ACCEPTANCE
By registering for an AppLift account, you agree to these Terms & Conditions and to AppLift's Data Privacy Notice. If you do not agree, do not register.

ELIGIBILITY
You must be an adult (18+) to create an AppLift account. AppLift is not intended for children.

ACCOUNT RESPONSIBILITIES
You are responsible for the accuracy and completeness of the information you provide at sign-up (profile, anthropometrics, injury history). You agree not to provide false or misleading information.

SERVICE DESCRIPTION AND LIMITATIONS
AppLift provides workout monitoring, rep counting, mistake classification, and AI-generated recommendations. The system is assistive only — not a medical professional. Models are probabilistic and may misclassify repetitions or produce suboptimal recommendations; AppLift does not guarantee injury prevention.

USER CONDUCT
You will not tamper with devices, alter sensor attachments, or intentionally provide data that manipulates the system. You will follow device mounting and safety instructions supplied in the PWA.

INTELLECTUAL PROPERTY
AppLift software, documentation, UI designs, and model implementations are the property of the project proponents. Users receive a limited, non-exclusive license to use the PWA.

DATA, RESEARCH & MODEL IMPROVEMENT
With your consent, AppLift may use anonymized workout and profile data to improve models, conduct research, and refine recommendations. You will be informed about anonymization practices and have the right to opt out of non-essential research uses.

SECURITY & STORAGE
AppLift uses Google Cloud Platform services (Cloud Run, Cloud Storage, Cloud Firestore, Firebase Authentication). Data in transit is encrypted (TLS) and stored securely; access is limited to authorized project personnel bound by confidentiality agreements.

LIABILITY & DISCLAIMER
To the extent permitted by law, AppLift disclaims liability for injuries, losses, or damages resulting from use of the service, including but not limited to reliance on AI recommendations. You should seek professional medical advice for health concerns.

TERMINATION
AppLift may suspend or terminate accounts that violate these Terms. You may request account deletion anytime; see the Data Privacy section for deletion details.

GOVERNING LAW & COMPLIANCE
The service will comply with applicable laws, including the Philippines Data Privacy Act (RA 10173). These Terms are governed by the laws applicable to your deployment.

---

INFORMED USER CONSENT

Before creating your account, please read this consent form carefully. By proceeding with account creation, you acknowledge that AppLift is an assistive training device and will collect and process your profile and motion data to produce workout insights and recommendations.

I confirm that I have read and understood the information below and voluntarily consent to the collection and processing of my data by AppLift for the purposes described.

WHAT APPLIFT DOES
AppLift is an assistive system that collects equipment-mounted motion data and user profile information to analyze repetitions, detect likely execution mistakes, and generate progressive-overload recommendations for exercises. It is intended as a decision-support tool and is not a medical device or replacement for a trained professional.

DATA COLLECTED AT SIGN-UP
During registration, AppLift will collect basic profile and anthropometric information such as username, birthday/age, height, weight (BMI), activity/skill level, and any current illnesses or injuries that you disclose. This information is used to create initial recommendations and to personalize the service.

SENSOR DATA COLLECTED DURING USE
During workouts, the equipment-mounted IMU and device components (RFID/RC522) will capture motion and equipment identification data. Raw IMU logs and aggregated workout results may be transmitted to the cloud for processing.

AI AND ANALYTICS
AppLift uses machine learning (Random Forest) to classify repetitions and Vertex AI (GenAI) to create exercise/load suggestions. These models have limitations and may not always be correct; recommendations should be validated by you and human experts where appropriate.

VOLUNTARY PARTICIPATION & WITHDRAWAL
Participation is voluntary. You may withdraw consent and request account and data deletion at any time; withdrawal will not affect data already processed while consent was active, except where removal is feasible under retention rules.

RISKS & RESPONSIBILITIES
You acknowledge the system's limits (e.g., single IMU, equipment-based sensing) and accept responsibility to consult a qualified professional for medical concerns. Use the recommendations at your own risk and stop any exercise that causes pain.`

  const StepTerms = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(0.75rem, 2vh, 1rem)' }}>
      {/* Terms and Conditions Phase */}
      {step1Phase === 'terms' && (
        <div>
          <h2 style={{ fontSize: 'clamp(0.875rem, 3vw, 1rem)', fontWeight: '600', color: 'var(--app-white)', margin: 0, marginBottom: 'clamp(0.5rem, 1.5vh, 0.75rem)' }}>Terms and Conditions</h2>
          <p style={{ fontSize: 'clamp(0.7rem, 2.5vw, 0.75rem)', color: 'rgba(238,235,217,0.7)', marginBottom: 'clamp(0.5rem, 1.5vh, 0.75rem)', marginTop: 0 }}>
            By proceeding to use AppLift, you confirm that you have read, understood, and agreed to the Terms and Conditions of the application.
          </p>
          <div className="relative rounded-lg bg-black/30 overflow-hidden" style={{ height: 'clamp(10rem, 25vh, 14rem)' }}>
            <div 
              ref={termsContentRef}
              className="h-full overflow-y-auto leading-relaxed" 
              style={{ padding: 'clamp(0.75rem, 2vh, 1rem)', fontSize: 'clamp(0.65rem, 2.25vw, 0.7rem)', color: 'rgba(255,255,255,0.7)' }}
              onScroll={handleTermsScroll}
            >
              {termsContent.split('---')[0].trim()}
            </div>
          </div>
          <label className="flex items-center mt-3" style={{ gap: 'clamp(0.5rem, 2vw, 0.75rem)', fontSize: 'clamp(0.7rem, 2.5vw, 0.75rem)', color: 'var(--app-white)' }}>
            <input
              type="checkbox"
              checked={termsAccepted}
              onChange={(e) => {
                const checked = e.target.checked
                setTermsAccepted(checked)
              }}
              disabled={!termsScrolledToBottom}
              className="rounded border-white/30 bg-black/50 text-[#8b5cf6] focus:ring-0 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ width: 'clamp(0.875rem, 3vw, 1rem)', height: 'clamp(0.875rem, 3vw, 1rem)' }}
            />
            I have read and understand AppLift's Terms and Conditions.
          </label>
        </div>
      )}

      {/* Informed User Consent Phase */}
      {step1Phase === 'consent' && (
        <div>
          <h2 style={{ fontSize: 'clamp(0.875rem, 3vw, 1rem)', fontWeight: '600', color: 'var(--app-white)', margin: 0, marginBottom: 'clamp(0.5rem, 1.5vh, 0.75rem)' }}>Informed User Consent</h2>
          <p style={{ fontSize: 'clamp(0.7rem, 2.5vw, 0.75rem)', color: 'rgba(238,235,217,0.7)', marginBottom: 'clamp(0.5rem, 1.5vh, 0.75rem)', marginTop: 0 }}>
            By using AppLift, you consent to the collection and use of your data to provide personalized insights and ensure user safety. AppLift does not replace professional medical or fitness advice.
          </p>
          <div className="relative rounded-lg bg-black/30 overflow-hidden" style={{ height: 'clamp(10rem, 25vh, 14rem)' }}>
            <div 
              ref={consentContentRef}
              className="h-full overflow-y-auto leading-relaxed" 
              style={{ padding: 'clamp(0.75rem, 2vh, 1rem)', fontSize: 'clamp(0.65rem, 2.25vw, 0.7rem)', color: 'rgba(255,255,255,0.7)' }}
              onScroll={handleConsentScroll}
            >
              {termsContent.split('---')[1].trim()}
            </div>
          </div>
          <label className="flex items-center mt-3" style={{ gap: 'clamp(0.5rem, 2vw, 0.75rem)', fontSize: 'clamp(0.7rem, 2.5vw, 0.75rem)', color: 'var(--app-white)' }}>
            <input
              type="checkbox"
              checked={consentAccepted}
              onChange={(e) => {
                const checked = e.target.checked
                setConsentAccepted(checked)
              }}
              disabled={!consentScrolledToBottom}
              className="rounded border-white/30 bg-black/50 text-[#8b5cf6] focus:ring-0 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ width: 'clamp(0.875rem, 3vw, 1rem)', height: 'clamp(0.875rem, 3vw, 1rem)' }}
            />
            I give my informed consent as described above.
          </label>
        </div>
      )}

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
  )

  const StepAccount = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(0.75rem, 2vh, 1rem)' }}>
      <label className="block">
        <span style={{ fontSize: 'clamp(0.7rem, 2.5vw, 0.75rem)', color: 'rgba(238,235,217,0.85)' }}>Username / Nickname</span>
        <input
          value={username}
          onChange={(e) => { setUsername(e.target.value); updateProfile({ username: e.target.value }) }}
          className="w-full rounded-full bg-black/40 text-white placeholder-gray-400 border border-white/5 focus:outline-none focus:ring-2 focus:ring-[#8b5cf6]/50 transition-all"
          style={{
            fontSize: 'clamp(0.875rem, 3vw, 1rem)',
            padding: 'clamp(0.625rem, 2vh, 0.75rem) clamp(0.875rem, 3vw, 1rem)',
            marginTop: 'clamp(0.25rem, 1vh, 0.5rem)',
          }}
          placeholder="What should we call you?"
        />
      </label>

      <label className="block">
        <span style={{ fontSize: 'clamp(0.7rem, 2.5vw, 0.75rem)', color: 'rgba(238,235,217,0.85)' }}>Email</span>
        <input
          ref={emailRef}
          value={email}
          onChange={(e) => { setEmail(e.target.value); setEmailError(false); if (emailRef.current) emailRef.current.setCustomValidity(''); updateProfile({ email: e.target.value, authProvider: 'email' }) }}
          className={`w-full rounded-full bg-black/40 text-white placeholder-gray-400 ${emailError ? 'border-rose-400' : 'border border-white/5'} focus:outline-none focus:ring-2 focus:ring-[#8b5cf6]/50 transition-all`}
          style={{
            fontSize: 'clamp(0.875rem, 3vw, 1rem)',
            padding: 'clamp(0.625rem, 2vh, 0.75rem) clamp(0.875rem, 3vw, 1rem)',
            marginTop: 'clamp(0.25rem, 1vh, 0.5rem)',
          }}
          placeholder="Email"
        />
      </label>

      <label className="block relative">
        <span style={{ fontSize: 'clamp(0.7rem, 2.5vw, 0.75rem)', color: 'rgba(238,235,217,0.85)' }}>Password</span>
        <div className="relative" style={{ marginTop: 'clamp(0.25rem, 1vh, 0.5rem)' }}>
          <input
            ref={passwordRef}
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => { setPassword(e.target.value); setPasswordError(false); if (passwordRef.current) passwordRef.current.setCustomValidity('') }}
            onFocus={() => setShowPwReminder(true)}
            onBlur={() => setShowPwReminder(false)}
            className={`w-full rounded-full bg-black/40 text-white placeholder-gray-400 ${passwordError ? 'border-rose-400' : 'border border-white/5'} focus:outline-none focus:ring-2 focus:ring-[#8b5cf6]/50 transition-all`}
            style={{
              fontSize: 'clamp(0.875rem, 3vw, 1rem)',
              padding: 'clamp(0.625rem, 2vh, 0.75rem) clamp(2.5rem, 8vw, 3rem) clamp(0.625rem, 2vh, 0.75rem) clamp(0.875rem, 3vw, 1rem)',
            }}
            placeholder="Password"
            required
          />
          <button
            type="button"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            onClick={() => setShowPassword(s => !s)}
            className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-500"
          >
            {showPassword ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 640 640" fill="currentColor">
                <path d="M73 39.1C63.6 29.7 48.4 29.7 39.1 39.1C29.8 48.5 29.7 63.7 39 73.1L567 601.1C576.4 610.5 591.6 610.5 600.9 601.1C610.2 591.7 610.3 576.5 600.9 567.2L504.5 470.8C507.2 468.4 509.9 466 512.5 463.6C559.3 420.1 590.6 368.2 605.5 332.5C608.8 324.6 608.8 315.8 605.5 307.9C590.6 272.2 559.3 220.2 512.5 176.8C465.4 133.1 400.7 96.2 319.9 96.2C263.1 96.2 214.3 114.4 173.9 140.4L73 39.1zM208.9 175.1C241 156.2 278.1 144 320 144C385.2 144 438.8 173.6 479.9 211.7C518.4 247.4 545 290 558.5 320C544.9 350 518.3 392.5 479.9 428.3C476.8 431.1 473.7 433.9 470.5 436.7L425.8 392C439.8 371.5 448 346.7 448 320C448 249.3 390.7 192 320 192C293.3 192 268.5 200.2 248 214.2L208.9 175.1zM390.9 357.1L282.9 249.1C294 243.3 306.6 240 320 240C364.2 240 400 275.8 400 320C400 333.4 396.7 346 390.9 357.1zM135.4 237.2L101.4 203.2C68.8 240 46.4 279 34.5 307.7C31.2 315.6 31.2 324.4 34.5 332.3C49.4 368 80.7 420 127.5 463.4C174.6 507.1 239.3 544 320.1 544C357.4 544 391.3 536.1 421.6 523.4L384.2 486C364.2 492.4 342.8 496 320 496C254.8 496 201.2 466.4 160.1 428.3C121.6 392.6 95 350 81.5 320C91.9 296.9 110.1 266.4 135.5 237.2z" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 640 640" fill="currentColor">
                <path d="M320 144C254.8 144 201.2 173.6 160.1 211.7C121.6 247.5 95 290 81.4 320C95 350 121.6 392.5 160.1 428.3C201.2 466.4 254.8 496 320 496C385.2 496 438.8 466.4 479.9 428.3C518.4 392.5 545 350 558.6 320C545 290 518.4 247.5 479.9 211.7C438.8 173.6 385.2 144 320 144zM127.4 176.6C174.5 132.8 239.2 96 320 96C400.8 96 465.5 132.8 512.6 176.6C559.4 220.1 590.7 272 605.6 307.7C608.9 315.6 608.9 324.4 605.6 332.3C590.7 368 559.4 420 512.6 463.4C465.5 507.1 400.8 544 320 544C239.2 544 174.5 507.2 127.4 463.4C80.6 419.9 49.3 368 34.4 332.3C31.1 324.4 31.1 315.6 34.4 307.7C49.3 272 80.6 220 127.4 176.6zM320 400C364.2 400 400 364.2 400 320C400 275.8 364.2 240 320 240C275.8 240 240 275.8 240 320C240 364.2 275.8 400 320 400zM240.4 311.6C242.9 311.9 245.4 312 248 312C283.3 312 312 283.3 312 248C312 245.4 311.8 242.9 311.6 240.4C274.2 244.3 244.4 274.1 240.5 311.5zM286 196.6C296.8 193.6 308.2 192.1 319.9 192.1C328.7 192.1 337.4 193 345.7 194.7C346 194.8 346.2 194.8 346.5 194.9C404.4 207.1 447.9 258.6 447.9 320.1C447.9 390.8 390.6 448.1 319.9 448.1C258.3 448.1 206.9 404.6 194.7 346.7C192.9 338.1 191.9 329.2 191.9 320.1C191.9 309.1 193.3 298.3 195.9 288.1C196.1 287.4 196.2 286.8 196.4 286.2C208.3 242.8 242.5 208.6 285.9 196.7z" />
              </svg>
            )}
          </button>
        </div>
        {showPwReminder ? (
          <div style={{ fontSize: 'clamp(0.7rem, 2.5vw, 0.75rem)', color: '#fb7185', marginTop: 'clamp(0.25rem, 1vh, 0.5rem)' }}>At least 8 characters with an uppercase, number, and symbol.</div>
        ) : null}
      </label>

      <label className="block relative">
        <span style={{ fontSize: 'clamp(0.7rem, 2.5vw, 0.75rem)', color: 'rgba(238,235,217,0.85)' }}>Confirm password</span>
        <div className="relative" style={{ marginTop: 'clamp(0.25rem, 1vh, 0.5rem)' }}>
          <input
            ref={confirmRef}
            type={showConfirm ? 'text' : 'password'}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full rounded-full bg-black/40 text-white placeholder-gray-400 border border-white/5 focus:outline-none focus:ring-2 focus:ring-[#8b5cf6]/50 transition-all"
            style={{
              fontSize: 'clamp(0.875rem, 3vw, 1rem)',
              padding: 'clamp(0.625rem, 2vh, 0.75rem) clamp(2.5rem, 8vw, 3rem) clamp(0.625rem, 2vh, 0.75rem) clamp(0.875rem, 3vw, 1rem)',
            }}
            placeholder="Confirm password"
            required
          />
          <button
            type="button"
            aria-label={showConfirm ? 'Hide password' : 'Show password'}
            onClick={() => setShowConfirm(s => !s)}
            className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-500"
          >
            {showConfirm ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 640 640" fill="currentColor">
                <path d="M73 39.1C63.6 29.7 48.4 29.7 39.1 39.1C29.8 48.5 29.7 63.7 39 73.1L567 601.1C576.4 610.5 591.6 610.5 600.9 601.1C610.2 591.7 610.3 576.5 600.9 567.2L504.5 470.8C507.2 468.4 509.9 466 512.5 463.6C559.3 420.1 590.6 368.2 605.5 332.5C608.8 324.6 608.8 315.8 605.5 307.9C590.6 272.2 559.3 220.2 512.5 176.8C465.4 133.1 400.7 96.2 319.9 96.2C263.1 96.2 214.3 114.4 173.9 140.4L73 39.1zM208.9 175.1C241 156.2 278.1 144 320 144C385.2 144 438.8 173.6 479.9 211.7C518.4 247.4 545 290 558.5 320C544.9 350 518.3 392.5 479.9 428.3C476.8 431.1 473.7 433.9 470.5 436.7L425.8 392C439.8 371.5 448 346.7 448 320C448 249.3 390.7 192 320 192C293.3 192 268.5 200.2 248 214.2L208.9 175.1zM390.9 357.1L282.9 249.1C294 243.3 306.6 240 320 240C364.2 240 400 275.8 400 320C400 333.4 396.7 346 390.9 357.1zM135.4 237.2L101.4 203.2C68.8 240 46.4 279 34.5 307.7C31.2 315.6 31.2 324.4 34.5 332.3C49.4 368 80.7 420 127.5 463.4C174.6 507.1 239.3 544 320.1 544C357.4 544 391.3 536.1 421.6 523.4L384.2 486C364.2 492.4 342.8 496 320 496C254.8 496 201.2 466.4 160.1 428.3C121.6 392.6 95 350 81.5 320C91.9 296.9 110.1 266.4 135.5 237.2z" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 640 640" fill="currentColor">
                <path d="M320 144C254.8 144 201.2 173.6 160.1 211.7C121.6 247.5 95 290 81.4 320C95 350 121.6 392.5 160.1 428.3C201.2 466.4 254.8 496 320 496C385.2 496 438.8 466.4 479.9 428.3C518.4 392.5 545 350 558.6 320C545 290 518.4 247.5 479.9 211.7C438.8 173.6 385.2 144 320 144zM127.4 176.6C174.5 132.8 239.2 96 320 96C400.8 96 465.5 132.8 512.6 176.6C559.4 220.1 590.7 272 605.6 307.7C608.9 315.6 608.9 324.4 605.6 332.3C590.7 368 559.4 420 512.6 463.4C465.5 507.1 400.8 544 320 544C239.2 544 174.5 507.2 127.4 463.4C80.6 419.9 49.3 368 34.4 332.3C31.1 324.4 31.1 315.6 34.4 307.7C49.3 272 80.6 220 127.4 176.6zM320 400C364.2 400 400 364.2 400 320C400 275.8 364.2 240 320 240C275.8 240 240 275.8 240 320C240 364.2 275.8 400 320 400zM240.4 311.6C242.9 311.9 245.4 312 248 312C283.3 312 312 283.3 312 248C312 245.4 311.8 242.9 311.6 240.4C274.2 244.3 244.4 274.1 240.5 311.5zM286 196.6C296.8 193.6 308.2 192.1 319.9 192.1C328.7 192.1 337.4 193 345.7 194.7C346 194.8 346.2 194.8 346.5 194.9C404.4 207.1 447.9 258.6 447.9 320.1C447.9 390.8 390.6 448.1 319.9 448.1C258.3 448.1 206.9 404.6 194.7 346.7C192.9 338.1 191.9 329.2 191.9 320.1C191.9 309.1 193.3 298.3 195.9 288.1C196.1 287.4 196.2 286.8 196.4 286.2C208.3 242.8 242.5 208.6 285.9 196.7z" />
              </svg>
            )}
          </button>
        </div>
        {confirmPassword && !passwordsMatch ? (
          <div style={{ fontSize: 'clamp(0.7rem, 2.5vw, 0.75rem)', color: '#fb7185', marginTop: 'clamp(0.25rem, 1vh, 0.5rem)' }}>Passwords do not match</div>
        ) : null}
      </label>
    </div>
  )

  const StepBirthday = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(0.75rem, 2vh, 1rem)' }}>
      <div>
        <label className="block" style={{ fontSize: 'clamp(0.7rem, 2.5vw, 0.75rem)', marginBottom: 'clamp(0.25rem, 1vh, 0.5rem)', color: 'rgba(238,235,217,0.85)' }}>Gender</label>
        <div className="flex" style={{ gap: 'clamp(0.25rem, 1vw, 0.5rem)' }}>
          {[{ value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }, { value: 'other', label: 'Other' }].map((opt) => {
            const selected = gender === opt.value
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => { setGender(opt.value); updateProfile({ gender: opt.value }) }}
                className={`flex-1 text-center rounded-2xl border transition-all ${selected ? 'border-[#8b5cf6] bg-[#8b5cf6]/10 text-white shadow-lg' : 'border-white/10 text-white/80 bg-black/30 hover:border-white/20'}`}
                style={{
                  fontSize: 'clamp(0.8rem, 2.75vw, 0.875rem)',
                  padding: 'clamp(0.625rem, 2vh, 0.75rem) clamp(0.75rem, 2.5vw, 1rem)',
                  boxShadow: selected ? '0 0 20px rgba(139, 92, 246, 0.4)' : 'none',
                }}
              >
                {opt.label}
              </button>
            )
          })}
        </div>
      </div>

      {gender && (
        <div className="space-y-3 pt-2">
          <div className="text-xs" style={{ color: 'rgba(238,235,217,0.65)' }}>
            We ask for month and year only to tailor age-appropriate guidance and recommendations.
          </div>
          <BirthdayPicker
            months={monthOptions}
            years={yearOptions}
            selectedMonth={birthMonth}
            selectedYear={birthYear}
            onMonthChange={setBirthMonth}
            onYearChange={setBirthYear}
            updateProfile={updateProfile}
          />
        </div>
      )}
    </div>
  )

  const StepPhysical = (
    <div className="space-y-4">
      <div>
        <label className="block text-xs mb-2" style={{ color: 'rgba(238,235,217,0.85)' }}>Weight</label>
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <input
              value={weight}
              inputMode="numeric"
              pattern="[0-9]*"
              onChange={(e) => { setWeight(e.target.value); updateProfile({ weight: parseInt(e.target.value, 10) || null }) }}
              className="w-full rounded-full px-4 bg-black/40 text-white placeholder-gray-400 border border-white/5 focus:outline-none focus:ring-2 focus:ring-[#8b5cf6]/50 transition-all"
              style={{ height: '2.5rem' }}
              placeholder="e.g., 70"
            />
          </div>
          <div className="flex gap-1" style={{ minWidth: 'fit-content' }}>
            {[{ value: 'kg', label: 'kg' }, { value: 'lbs', label: 'lbs' }].map((unit) => {
              const selected = weightUnit === unit.value
              return (
                <button
                  key={unit.value}
                  type="button"
                  onClick={() => {
                    if (unit.value !== weightUnit && weight) {
                      // Convert weight when switching units
                      const currentWeight = parseFloat(weight) || 0
                      if (unit.value === 'lbs') {
                        // Converting from kg to lbs
                        const converted = Math.round(currentWeight * 2.20462)
                        setWeight(converted.toString())
                      } else {
                        // Converting from lbs to kg
                        const converted = Math.round(currentWeight * 0.453592)
                        setWeight(converted.toString())
                      }
                    }
                    setWeightUnit(unit.value)
                  }}
                  className={`rounded-xl text-xs font-medium transition flex items-center justify-center ${selected ? 'bg-[#8b5cf6] text-white' : 'bg-white/10 text-white/70 border border-white/20'}`}
                  style={{ width: '2.75rem', height: '2.5rem' }}
                >
                  {unit.label}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {heightUnit === 'cm' ? (
        <label className="block">
          <div className="text-xs mb-2" style={{ color: 'rgba(238,235,217,0.85)' }}>Height</div>
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <input
                value={heightValue}
                inputMode="numeric"
                pattern="[0-9]*"
                onChange={(e) => { const v = e.target.value; setHeightValue(v); updateProfile({ heightCm: v, heightUnit: 'cm', height: parseInt(v, 10) || null }) }}
                className="w-full rounded-full px-4 bg-black/40 text-white placeholder-gray-400 border border-white/5 focus:outline-none focus:ring-2 focus:ring-[#8b5cf6]/50 transition-all"
                style={{ height: '2.5rem' }}
                placeholder="e.g., 170"
              />
            </div>
            <div className="flex gap-1" style={{ minWidth: 'fit-content' }}>
              {[{ value: 'cm', label: 'cm' }, { value: 'ft', label: 'ft' }].map((unit) => {
                const selected = heightUnit === unit.value
                return (
                  <button
                    key={unit.value}
                    type="button"
                    onClick={() => {
                      if (unit.value !== heightUnit) {
                        if (unit.value === 'cm') {
                          // Converting from ft/in to cm
                          const feet = parseInt(heightFeet, 10) || 0
                          const inches = parseInt(heightInches, 10) || 0
                          const cm = Math.round(feet * 30.48 + inches * 2.54)
                          if (cm > 0) setHeightValue(cm.toString())
                        } else {
                          // Converting from cm to ft/in
                          const cm = parseInt(heightValue, 10) || 0
                          const totalInches = cm / 2.54
                          const feet = Math.floor(totalInches / 12)
                          const inches = Math.round(totalInches % 12)
                          if (feet > 0 || inches > 0) {
                            setHeightFeet(feet.toString())
                            setHeightInches(inches.toString())
                          }
                        }
                      }
                      setHeightUnit(unit.value)
                    }}
                    className={`rounded-xl text-xs font-medium transition flex items-center justify-center ${selected ? 'bg-[#8b5cf6] text-white' : 'bg-white/10 text-white/70 border border-white/20'}`}
                    style={{ width: '2.75rem', height: '2.5rem' }}
                  >
                    {unit.label}
                  </button>
                )
              })}
            </div>
          </div>
        </label>
      ) : (
        <div className="space-y-3">
          <div className="text-xs mb-2" style={{ color: 'rgba(238,235,217,0.85)' }}>Height</div>
          <div className="flex items-end gap-2">
            <div className="flex gap-2 flex-1">
              <label className="flex-1 block">
                <span className="text-xs block mb-1" style={{ color: 'rgba(238,235,217,0.7)' }}>Feet</span>
                <input
                  value={heightFeet}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  onChange={(e) => {
                    const v = e.target.value
                    setHeightFeet(v)
                    const feet = parseInt(v, 10) || 0
                    const inches = parseInt(heightInches, 10) || 0
                    const cm = Math.round(feet * 30.48 + inches * 2.54)
                    updateProfile({ heightFeet: v, heightInches, heightUnit: 'ft', height: cm })
                  }}
                  className="w-full rounded-full px-4 bg-black/40 text-white placeholder-gray-400 border border-white/5 focus:outline-none focus:ring-2 focus:ring-[#8b5cf6]/50 transition-all"
                  style={{ height: '2.5rem' }}
                  placeholder="e.g., 5"
                />
              </label>
              <label className="flex-1 block">
                <span className="text-xs block mb-1" style={{ color: 'rgba(238,235,217,0.7)' }}>Inches</span>
                <input
                  value={heightInches}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  onChange={(e) => {
                    const v = e.target.value
                    setHeightInches(v)
                    const feet = parseInt(heightFeet, 10) || 0
                    const inches = parseInt(v, 10) || 0
                    const cm = Math.round(feet * 30.48 + inches * 2.54)
                    updateProfile({ heightFeet, heightInches: v, heightUnit: 'ft', height: cm })
                  }}
                  className="w-full rounded-full px-4 bg-black/40 text-white placeholder-gray-400 border border-white/5 focus:outline-none focus:ring-2 focus:ring-[#8b5cf6]/50 transition-all"
                  style={{ height: '2.5rem' }}
                  placeholder="e.g., 10"
                />
              </label>
            </div>
            <div className="flex gap-1" style={{ minWidth: 'fit-content' }}>
              {[{ value: 'cm', label: 'cm' }, { value: 'ft', label: 'ft' }].map((unit) => {
                const selected = heightUnit === unit.value
                return (
                  <button
                    key={unit.value}
                    type="button"
                    onClick={() => {
                      if (unit.value !== heightUnit) {
                        if (unit.value === 'cm') {
                          // Converting from ft/in to cm
                          const feet = parseInt(heightFeet, 10) || 0
                          const inches = parseInt(heightInches, 10) || 0
                          const cm = Math.round(feet * 30.48 + inches * 2.54)
                          if (cm > 0) setHeightValue(cm.toString())
                        } else {
                          // Converting from cm to ft/in
                          const cm = parseInt(heightValue, 10) || 0
                          const totalInches = cm / 2.54
                          const feet = Math.floor(totalInches / 12)
                          const inches = Math.round(totalInches % 12)
                          if (feet > 0 || inches > 0) {
                            setHeightFeet(feet.toString())
                            setHeightInches(inches.toString())
                          }
                        }
                      }
                      setHeightUnit(unit.value)
                    }}
                    className={`rounded-xl text-xs font-medium transition flex items-center justify-center ${selected ? 'bg-[#8b5cf6] text-white' : 'bg-white/10 text-white/70 border border-white/20'}`}
                    style={{ width: '2.75rem', height: '2.5rem' }}
                  >
                    {unit.label}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      <p className="text-xs" style={{ color: 'rgba(238,235,217,0.65)' }}>
        We use height and weight to set safer targets and more accurate insights.
      </p>

      {bmi && (
        <div className="rounded-2xl border p-4" style={{
          borderColor: bmiCategory === 'normal' ? 'rgba(34, 197, 94, 0.3)' :
                       bmiCategory === 'underweight' ? 'rgba(251, 191, 36, 0.3)' :
                       bmiCategory === 'overweight' ? 'rgba(251, 146, 60, 0.3)' :
                       'rgba(239, 68, 68, 0.3)',
          backgroundColor: bmiCategory === 'normal' ? 'rgba(34, 197, 94, 0.05)' :
                           bmiCategory === 'underweight' ? 'rgba(251, 191, 36, 0.05)' :
                           bmiCategory === 'overweight' ? 'rgba(251, 146, 60, 0.05)' :
                           'rgba(239, 68, 68, 0.05)',
        }}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold" style={{ color: 'var(--app-white)' }}>Your BMI is {bmiCategory.charAt(0).toUpperCase() + bmiCategory.slice(1)}</span>
            <span className="text-lg font-bold" style={{
              color: bmiCategory === 'normal' ? '#22c55e' :
                     bmiCategory === 'underweight' ? '#fbbf24' :
                     bmiCategory === 'overweight' ? '#fb923c' :
                     '#ef4444'
            }}>{bmi}</span>
          </div>
          <p className="text-xs" style={{ color: 'rgba(238,235,217,0.75)' }}>
            {bmiCategory === 'underweight' && 'You may be lighter than average. Let\'s start your strength and conditioning journey, tailored for you, and consider consulting a health professional for extra guidance and safety.'}
            {bmiCategory === 'normal' && 'You\'re in a healthy range. Let\'s keep building strength and improving your lifts with a safe, tailored program to stay at your best.'}
            {bmiCategory === 'overweight' && 'You may be carrying extra weight. Let\'s focus on safe strength training and conditioning, tailored for you, and consider professional guidance to ensure a safe journey.'}
            {bmiCategory === 'obese' && 'Extra care is important. Start with controlled, tailored strength training, and consider consulting a health professional for support and safety as you progress.'}
          </p>
        </div>
      )}
    </div>
  )

  const StepFitness = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(1rem, 2.5vh, 1.5rem)' }}>
      {step5Phase === 'intro' && (
        <div className="text-center space-y-3">
          <p className="text-sm" style={{ color: 'var(--app-white)' }}>
            To help AppLift fully understand you, please answer the following questions for a personalized strength & conditioning experience.
          </p>
        </div>
      )}

      {step5Phase === 'question' && (
        <div className="space-y-3 step-content" key={step5QuestionIndex}>
          <div className="flex items-center justify-between text-xs" style={{ color: 'rgba(238,235,217,0.6)' }}>
            <span>Question {step5QuestionIndex + 1} of {step5Questions.length}</span>
          </div>
          <div className="text-sm" style={{ color: 'rgba(238,235,217,0.9)', fontWeight: 600 }}>
            {step5Questions[step5QuestionIndex].title}
          </div>
          {step5Questions[step5QuestionIndex].subtitle ? (
            <div className="text-xs" style={{ color: 'rgba(238,235,217,0.65)' }}>
              {step5Questions[step5QuestionIndex].subtitle}
            </div>
          ) : null}

          {/* Activity Level Selector - 4 buttons in a row */}
          {step5Questions[step5QuestionIndex].isActivityLevel ? (
            <div className="space-y-4">
              <div className="flex justify-between gap-2">
                {step5Questions[step5QuestionIndex].options.map((opt) => {
                  const selected = questionAnswers[step5Questions[step5QuestionIndex].key] === opt.value
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => {
                        const key = step5Questions[step5QuestionIndex].key
                        setQuestionAnswers((prev) => ({ ...prev, [key]: opt.value }))
                        updateProfile({ [step5Questions[step5QuestionIndex].profileKey]: opt.value })
                      }}
                      className={`flex-1 flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all duration-300 ${
                        selected 
                          ? 'border-green-500 bg-green-500/20 scale-105' 
                          : 'border-white/10 bg-black/20 hover:border-white/20 hover:bg-white/5'
                      }`}
                    >
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 ${
                        selected ? 'bg-green-500 text-white' : 'bg-white/10 text-white/60'
                      }`}>
                        {opt.value === 1 && (
                          <img 
                            src="/svg/sedentary.svg" 
                            alt="Sedentary" 
                            className="w-5 h-5"
                            style={{ filter: 'brightness(0) invert(1)' }}
                          />
                        )}
                        {opt.value === 2 && (
                          <img 
                            src="/svg/activity-level.svg" 
                            alt="Somewhat Active" 
                            className="w-5 h-5"
                            style={{ filter: 'brightness(0) invert(1)' }}
                          />
                        )}
                        {opt.value === 3 && (
                          <img 
                            src="/svg/active.svg" 
                            alt="Active" 
                            className="w-5 h-5"
                            style={{ filter: 'brightness(0) invert(1)' }}
                          />
                        )}
                        {opt.value === 4 && (
                          <img 
                            src="/svg/very-active.svg" 
                            alt="Very Active" 
                            className="w-5 h-5"
                            style={{ filter: 'brightness(0) invert(1)' }}
                          />
                        )}
                      </div>
                      <span className={`text-sm font-medium ${selected ? 'text-white' : 'text-white/60'}`}>
                        {opt.value}
                      </span>
                    </button>
                  )
                })}
              </div>
              {questionAnswers[step5Questions[step5QuestionIndex].key] && (
                <div className="text-center animate-fadeIn">
                  <p className="text-sm font-semibold text-white">
                    {step5Questions[step5QuestionIndex].options.find(o => o.value === questionAnswers[step5Questions[step5QuestionIndex].key])?.label}
                  </p>
                  <p className="text-xs text-white/60 mt-1">
                    {step5Questions[step5QuestionIndex].options.find(o => o.value === questionAnswers[step5Questions[step5QuestionIndex].key])?.description}
                  </p>
                </div>
              )}
            </div>
          ) : (
          <div className="space-y-2">
            {step5Questions[step5QuestionIndex].options.map((opt) => {
              const selected = questionAnswers[step5Questions[step5QuestionIndex].key] === opt.value
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    const key = step5Questions[step5QuestionIndex].key
                    setQuestionAnswers((prev) => ({ ...prev, [key]: opt.value }))
                    updateProfile({ [step5Questions[step5QuestionIndex].profileKey]: opt.value })
                  }}
                  className={`w-full text-left px-4 py-3 rounded-2xl border transition-all ${
                    selected
                      ? 'border-[#8b5cf6] bg-[#8b5cf6]/10 text-white shadow-lg'
                      : 'border-white/10 text-white/80 bg-black/30 hover:border-white/20'
                  }`}
                  style={{
                    boxShadow: selected ? '0 0 20px rgba(139, 92, 246, 0.4)' : 'none',
                  }}
                >
                  <div className="font-medium" style={{ fontSize: 'clamp(0.85rem, 3vw, 0.95rem)' }}>{opt.label}</div>
                  {opt.description ? (
                    <div className="text-xs mt-1" style={{ color: 'rgba(238,235,217,0.75)' }}>{opt.description}</div>
                  ) : null}
                </button>
              )
            })}
          </div>
          )}
        </div>
      )}

      {step5Phase === 'summary' && (
        <div className="space-y-3 step-content">
          <div className="text-center space-y-1">
            <div className="text-sm font-semibold" style={{ color: 'var(--app-white)' }}>Here&apos;s your AppLift profile</div>
            <div className="text-xs" style={{ color: 'rgba(238,235,217,0.7)' }}>
              We’ll use this to tailor weights, sets, reps, and focus on form or progression.
            </div>
          </div>
          <div className="space-y-2 rounded-2xl bg-black/20 p-4">
            <div className="flex justify-between text-sm" style={{ color: 'var(--app-white)' }}>
              <span className="flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" fill="currentColor" style={{ width: '16px', height: '16px' }}>
                  <path d="M240 192C240 147.8 275.8 112 320 112C364.2 112 400 147.8 400 192C400 236.2 364.2 272 320 272C275.8 272 240 236.2 240 192zM448 192C448 121.3 390.7 64 320 64C249.3 64 192 121.3 192 192C192 262.7 249.3 320 320 320C390.7 320 448 262.7 448 192zM144 544C144 473.3 201.3 416 272 416L368 416C438.7 416 496 473.3 496 544L496 552C496 565.3 506.7 576 520 576C533.3 576 544 565.3 544 552L544 544C544 446.8 465.2 368 368 368L272 368C174.8 368 96 446.8 96 544L96 552C96 565.3 106.7 576 120 576C133.3 576 144 565.3 144 552L144 544z"/>
                </svg>
                Name
              </span>
              <span>{username || '—'}</span>
            </div>
            <div className="flex justify-between text-sm" style={{ color: 'var(--app-white)' }}>
              <span className="flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" fill="currentColor" style={{ width: '16px', height: '16px' }}>
                  <path d="M182.4 53.5L157.8 95.6C154 102.1 152 109.6 152 117.2L152 120C152 142.1 169.9 160 192 160C214.1 160 232 142.1 232 120L232 117.2C232 109.6 230 102.2 226.2 95.6L201.6 53.5C199.6 50.1 195.9 48 192 48C188.1 48 184.4 50.1 182.4 53.5zM310.4 53.5L285.8 95.6C282 102.1 280 109.6 280 117.2L280 120C280 142.1 297.9 160 320 160C342.1 160 360 142.1 360 120L360 117.2C360 109.6 358 102.2 354.2 95.6L329.6 53.5C327.6 50.1 323.9 48 320 48C316.1 48 312.4 50.1 310.4 53.5zM413.8 95.6C410 102.1 408 109.6 408 117.2L408 120C408 142.1 425.9 160 448 160C470.1 160 488 142.1 488 120L488 117.2C488 109.6 486 102.2 482.2 95.6L457.6 53.5C455.6 50.1 451.9 48 448 48C444.1 48 440.4 50.1 438.4 53.5L413.8 95.6zM224 224C224 206.3 209.7 192 192 192C174.3 192 160 206.3 160 224L160 277.5C122.7 290.6 96 326.2 96 368L96 388.8C116.9 390.1 137.6 396.1 156.3 406.8L163.4 410.9C189.7 425.9 222.3 424.3 247 406.7C290.7 375.5 349.3 375.5 393 406.7C417.6 424.3 450.3 426 476.6 410.9L483.7 406.8C502.4 396.1 523 390.1 544 388.8L544 368C544 326.2 517.3 290.6 480 277.5L480 224C480 206.3 465.7 192 448 192C430.3 192 416 206.3 416 224L416 272L352 272L352 224C352 206.3 337.7 192 320 192C293.3 192 268.5 200.2 248 214.2L208.9 175.1zM390.9 357.1L282.9 249.1C294 243.3 306.6 240 320 240C364.2 240 400 275.8 400 320C400 333.4 396.7 346 390.9 357.1zM135.4 237.2L101.4 203.2C68.8 240 46.4 279 34.5 307.7C31.2 315.6 31.2 324.4 34.5 332.3C49.4 368 80.7 420 127.5 463.4C174.6 507.1 239.3 544 320.1 544C357.4 544 391.3 536.1 421.6 523.4L384.2 486C364.2 492.4 342.8 496 320 496C254.8 496 201.2 466.4 160.1 428.3C121.6 392.6 95 350 81.5 320C91.9 296.9 110.1 266.4 135.5 237.2z" />
                </svg>
                Age
              </span>
              <span>{age || '—'}</span>
            </div>
            <div className="flex justify-between text-sm" style={{ color: 'var(--app-white)' }}>
              <span className="flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" fill="currentColor" style={{ width: '16px', height: '16px' }}>
                  <path d="M212.6 256C209.6 245.9 208 235.1 208 224C208 162.1 258.1 112 320 112C381.9 112 432 162.1 432 224C432 235.1 430.4 245.9 427.4 256L356.4 256L381 211.7C387.4 200.1 383.3 185.5 371.7 179.1C360.1 172.7 345.5 176.8 339.1 188.4L301.5 256.1L212.7 256.1zM224 96L160 96C124.7 96 96 124.7 96 160L96 480C96 515.3 124.7 544 160 544L480 544C515.3 544 544 515.3 544 480L544 160C544 124.7 515.3 96 480 96L416 96C389.3 75.9 356 64 320 64C284 64 250.7 75.9 224 96z"/>
                </svg>
                Weight
              </span>
              <span>{weight ? `${weight} ${weightUnit}` : '—'}</span>
            </div>
            <div className="flex justify-between text-sm" style={{ color: 'var(--app-white)' }}>
              <span className="flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" fill="currentColor" style={{ width: '16px', height: '16px' }}>
                  <path d="M224 32C254.9 32 280 57.1 280 88C280 118.9 254.9 144 224 144C193.1 144 168 118.9 168 88C168 57.1 193.1 32 224 32zM350.3 363.1L304 300.7L304 544L576 544C593.7 544 608 558.3 608 576C608 593.7 593.7 608 576 608L64 608C46.3 608 32 593.7 32 576C32 558.3 46.3 544 64 544L144 544L144 300.7L97.7 363.1C87.2 377.3 67.1 380.3 52.9 369.7C38.7 359.1 35.7 339.1 46.3 324.9L116.8 229.9C142 196 181.7 176 224 176C266.3 176 306 196 331.2 229.9L401.7 324.9C412.2 339.1 409.3 359.1 395.1 369.7C380.9 380.3 360.9 377.3 350.3 363.1zM240 544L240 416C240 407.2 232.8 400 224 400C215.2 400 208 407.2 208 416L208 544L240 544zM598.6 166.6C586.1 179.1 565.8 179.1 553.3 166.6L528 141.3L528 288C528 305.7 513.7 320 496 320C478.3 320 464 305.7 464 288L464 141.3L438.6 166.7C426.1 179.2 405.8 179.2 393.3 166.7C380.8 154.2 380.8 133.9 393.3 121.4L473.3 41.4C485.8 28.9 506.1 28.9 518.6 41.4L598.6 121.4C611.1 133.9 611.1 154.2 598.6 166.7z"/>
                </svg>
                Height
              </span>
              <span>{heightUnit === 'ft' ? ((heightFeet || '—') + ' ft ' + (heightInches || '—') + ' in') : heightValue ? `${heightValue} cm` : '—'}</span>
            </div>
            <div className="flex justify-between text-sm" style={{ color: 'var(--app-white)' }}>
              <span className="flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" fill="currentColor" style={{ width: '16px', height: '16px' }}>
                  <path d="M414.1 218L404.7 225.6C382.2 206.3 353.2 192 321.4 192C249.8 192 192 252.8 192 324.3C192 330.9 192.4 337.4 193.4 343.7C191.4 287.7 235.2 246.3 286 246.3C310.2 246.3 332.2 255.7 348.6 271L323.4 291.4C315.1 290.5 306.6 293.2 300.3 299.5C289.2 310.5 289.2 328.4 300.3 339.5C311.4 350.5 329.2 350.5 340.3 339.5C346.6 333.2 349.3 324.6 348.4 316.4L423.6 227.6C429.9 221.1 420.3 211.7 414.1 218zM309.7 310.5C314.9 304.8 323.8 304.5 329.5 309.7C335.2 314.9 335.5 323.8 330.3 329.5C325.1 335.2 316.2 335.5 310.5 330.3C304.8 325.1 304.5 316.2 309.7 310.5zM320 96C196.3 96 96 196.3 96 320C96 443.7 196.3 544 320 544C443.7 544 544 443.7 544 320C544 196.3 443.7 96 320 96zM320 160C408.4 160 480 231.6 480 320C480 408.4 408.4 480 320 480C231.6 480 160 408.4 160 320C160 231.6 231.6 160 320 160z"/>
                </svg>
                BMI
              </span>
              <span>{bmi ? `${bmi}` : '—'}</span>
            </div>
            <div className="flex justify-between text-sm" style={{ color: 'var(--app-white)' }}>
              <span className="flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" fill="currentColor" style={{ width: '16px', height: '16px' }}>
                  <path d="M376 88C376 57.1 350.9 32 320 32C289.1 32 264 57.1 264 88C264 118.9 289.1 144 320 144C350.9 144 376 118.9 376 88zM400 300.7L446.3 363.1C456.8 377.3 476.9 380.3 491.1 369.7C505.3 359.1 508.3 339.1 497.7 324.9L427.2 229.9C402 196 362.3 176 320 176C277.7 176 238 196 212.8 229.9L142.3 324.9C131.8 339.1 134.7 359.1 148.9 369.7C163.1 380.3 183.1 377.3 193.7 363.1L240 300.7L240 576C240 593.7 254.3 608 272 608C289.7 608 304 593.7 304 576L304 416C304 407.2 311.2 400 320 400C328.8 400 336 407.2 336 416L336 576C336 593.7 350.3 608 368 608C385.7 608 400 593.7 400 576L400 300.7z"/>
                </svg>
                Body Type
              </span>
              <span>{getStep5Label('bodyType', questionAnswers.bodyType)}</span>
            </div>
            <div className="flex justify-between text-sm" style={{ color: 'var(--app-white)' }}>
              <span className="flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" fill="currentColor" style={{ width: '16px', height: '16px' }}>
                  <path d="M352.5 32C383.4 32 408.5 57.1 408.5 88C408.5 118.9 383.4 144 352.5 144C321.6 144 296.5 118.9 296.5 88C296.5 57.1 321.6 32 352.5 32zM219.6 240C216.3 240 213.4 242 212.2 245L190.2 299.9C183.6 316.3 165 324.3 148.6 317.7C132.2 311.1 124.2 292.5 130.8 276.1L152.7 221.2C163.7 193.9 190.1 176 219.6 176L316.9 176C345.4 176 371.7 191.1 386 215.7L418.8 272L480.4 272C498.1 272 512.4 286.3 512.4 304C512.4 321.7 498.1 336 480.4 336L418.8 336C396 336 375 323.9 363.5 304.2L353.5 287.1L332.8 357.5L408.2 380.1C435.9 388.4 450 419.1 438.3 445.6L381.7 573C374.5 589.2 355.6 596.4 339.5 589.2C323.4 582 316.1 563.1 323.3 547L372.5 436.2L276.6 407.4C243.9 397.6 224.6 363.7 232.9 330.6L255.6 240L219.7 240zM211.6 421C224.9 435.9 242.3 447.3 262.8 453.4L267.5 454.8L260.6 474.1C254.8 490.4 244.6 504.9 231.3 515.9L148.9 583.8C135.3 595 115.1 593.1 103.9 579.5C92.7 565.9 94.6 545.7 108.2 534.5L190.6 466.6C195.1 462.9 198.4 458.1 200.4 452.7L211.6 421z"/>
                </svg>
                Fitness Level
              </span>
              <span>{getStep5Label('strengthExperience', questionAnswers.strengthExperience)}</span>
            </div>
            <div className="flex justify-between text-sm" style={{ color: 'var(--app-white)' }}>
              <span className="flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" fill="currentColor" style={{ width: '16px', height: '16px' }}>
                  <path d="M512 320C512 214 426 128 320 128C214 128 128 214 128 320C128 426 214 512 320 512C426 512 512 426 512 320zM64 320C64 178.6 178.6 64 320 64C461.4 64 576 178.6 576 320C576 461.4 461.4 576 320 576C178.6 576 64 461.4 64 320zM320 400C364.2 400 400 364.2 400 320C400 275.8 364.2 240 320 240C275.8 240 240 275.8 240 320C240 364.2 275.8 400 320 400zM320 176C399.5 176 464 240.5 464 320C464 399.5 399.5 464 320 464C240.5 464 176 399.5 176 320C176 240.5 240.5 176 320 176zM288 320C288 302.3 302.3 288 320 288C337.7 288 352 302.3 352 320C352 337.7 337.7 352 320 352C302.3 352 288 337.7 288 320z"/>
                </svg>
                Goal
              </span>
              <span>{getStep5Label('mainGoal', questionAnswers.mainGoal)}</span>
            </div>
            <div className="flex justify-between text-sm" style={{ color: 'var(--app-white)' }}>
              <span className="flex items-center gap-2">
                {questionAnswers.workoutFrequency === 1 && (
                  <img 
                    src="/svg/sedentary.svg" 
                    alt="Activity Level" 
                    style={{ width: '16px', height: '16px', filter: 'brightness(0) invert(1)' }}
                  />
                )}
                {questionAnswers.workoutFrequency === 2 && (
                  <img 
                    src="/svg/activity-level.svg" 
                    alt="Activity Level" 
                    style={{ width: '16px', height: '16px', filter: 'brightness(0) invert(1)' }}
                  />
                )}
                {questionAnswers.workoutFrequency === 3 && (
                  <img 
                    src="/svg/active.svg" 
                    alt="Activity Level" 
                    style={{ width: '16px', height: '16px', filter: 'brightness(0) invert(1)' }}
                  />
                )}
                {questionAnswers.workoutFrequency === 4 && (
                  <img 
                    src="/svg/very-active.svg" 
                    alt="Activity Level" 
                    style={{ width: '16px', height: '16px', filter: 'brightness(0) invert(1)' }}
                  />
                )}
                {!questionAnswers.workoutFrequency && (
                  <img 
                    src="/svg/activity-level.svg" 
                    alt="Activity Level" 
                    style={{ width: '16px', height: '16px', filter: 'brightness(0) invert(1)' }}
                  />
                )}
                Activity Level
              </span>
              <span>{questionAnswers.workoutFrequency ? `Level ${questionAnswers.workoutFrequency}` : '—'}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )

  const Review = (
    <div className="space-y-4">
      <div className="text-sm" style={{ color: 'rgba(238,235,217,0.85)' }}>
        Review your details. You can jump back to adjust any section.
      </div>
      <div className="space-y-3">
        {[
          { label: 'Username', value: username, jump: 2 },
          { label: 'Email', value: email, jump: 2 },
          { label: 'Gender', value: gender, jump: 3 },
          { label: 'Birth month', value: birthMonth, jump: 3 },
          { label: 'Birth year', value: birthYear, jump: 3 },
          { label: 'Weight', value: weight ? `${weight} ${weightUnit}` : '', jump: 4 },
          { label: 'Height', value: heightUnit === 'ft' ? (heightFeet || heightInches ? `${heightFeet}ft ${heightInches}in` : '') : (heightValue ? `${heightValue}cm` : ''), jump: 4 },
          { label: 'Body Type', value: getStep5Label('bodyType', questionAnswers.bodyType), jump: 5 },
          { label: 'Weight Response', value: getStep5Label('weightResponse', questionAnswers.weightResponse), jump: 5 },
          { label: 'Fitness Level', value: getStep5Label('strengthExperience', questionAnswers.strengthExperience), jump: 5 },
          { label: 'Activity Level', value: questionAnswers.workoutFrequency ? `Level ${questionAnswers.workoutFrequency} (${getStep5Label('workoutFrequency', questionAnswers.workoutFrequency)})` : '', jump: 5 },
          { label: 'Goal', value: getStep5Label('mainGoal', questionAnswers.mainGoal), jump: 5 },
          { label: 'Training Priority', value: getStep5Label('trainingPriority', questionAnswers.trainingPriority), jump: 5 },
        ]
          .map((item) => (
            <div key={item.label} className="flex items-center justify-between rounded-2xl bg-black/30 px-4 py-3">
              <div>
                <div className="text-xs" style={{ color: 'rgba(238,235,217,0.65)' }}>{item.label}</div>
                <div className="text-sm" style={{ color: 'var(--app-white)' }}>{item.value || 'Not set'}</div>
              </div>
              <button type="button" className="text-xs underline" style={{ color: 'rgba(238,235,217,0.8)' }} onClick={() => setStep(item.jump)}>
                Edit
              </button>
            </div>
          ))}
      </div>
      <div className="text-xs" style={{ color: 'rgba(238,235,217,0.65)' }}>
        We use this info to personalize recommendations and keep training safer.
      </div>
    </div>
  )

  return (
    <>
      <style jsx>{`
        .auth-container {
          height: 100dvh;
          width: 100vw;
          overflow: hidden;
          padding-top: max(0.5rem, env(safe-area-inset-top));
          padding-bottom: env(safe-area-inset-bottom);
          padding-left: max(1rem, env(safe-area-inset-left));
          padding-right: max(1rem, env(safe-area-inset-right));
        }
        
        @media (min-width: 768px) {
          .auth-container {
            min-height: 100vh;
            height: auto;
            overflow: auto;
            padding: 1.5rem;
          }
          .auth-container::-webkit-scrollbar {
            display: none;
          }
          .auth-container {
            -ms-overflow-style: none;
            scrollbar-width: none;
          }
        }
        
        .auth-wrapper {
          max-width: 420px;
          max-height: 100%;
          overflow: auto;
        }
        
        .auth-wrapper::-webkit-scrollbar {
          display: none;
        }
        .auth-wrapper {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        
        @media (min-width: 768px) {
          .auth-wrapper {
            max-width: 28rem;
            max-height: none;
            overflow: visible;
          }
        }
        
        .step-content {
          animation: fadeIn 0.3s ease-in-out;
        }
        
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        
        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
        
        .animate-spin {
          animation: spin 1s linear infinite;
        }
      `}</style>
      
      {/* Show loading screen when submitting */}
      {isSubmitting && (
        <LoadingScreen 
          message={step === reviewStep ? 'Creating your account...' : 'Please wait...'} 
        />
      )}
      
      <div className="auth-container bg-black flex items-center justify-center">
      <Head>
        <title>Sign up — AppLift</title>
        <meta name="description" content="Create an account" />
      </Head>

      <div className="auth-wrapper relative w-full mx-auto">

          <div className="bg-white/5 backdrop-blur-md rounded-[36px] shadow-2xl relative" style={{
            padding: 'clamp(1rem, 3vh, 2rem)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'clamp(0.75rem, 2vh, 1.25rem)',
          }}>
            {/* Back button - inside container, upper left */}
            <button
              onClick={handleBackToSplash}
              type="button"
              className="absolute p-2 hover:opacity-70 transition-opacity touch-manipulation"
              style={{ 
                top: 'clamp(0.75rem, 2vh, 1rem)',
                left: 'clamp(0.75rem, 2vw, 1rem)',
                marginTop: '8px',
                zIndex: 10,
                cursor: 'pointer',
                WebkitTapHighlightColor: 'transparent'
              }}
              aria-label="Go back to splash"
            >
              <img src="/svg/back-arrow.svg" alt="" width="20" height="20" style={{ pointerEvents: 'none' }} />
            </button>
            
            <h1 className="font-bold text-center" style={{ 
              color: 'var(--app-white)',
              fontSize: 'clamp(1.25rem, 5vw, 2rem)',
              marginBottom: 'clamp(0.1rem, 0.5vh, 0.25rem)',
            }}>Let's get started!</h1>
            <p className="text-center" style={{ 
              color: 'rgba(238,235,217,0.8)',
              fontSize: 'clamp(0.75rem, 2.75vw, 0.875rem)',
              marginBottom: 'clamp(0.5rem, 2vh, 1.5rem)',
            }}>Create an account to unleash your strength</p>
            <form onSubmit={handleSubmit} className="space-y-6">
              {StepHeader}

              <div className="step-content">
                {step === 1 && StepTerms}
                {step === 2 && StepAccount}
                {step === 3 && StepBirthday}
                {step === 4 && StepPhysical}
                {step === 5 && StepFitness}
                {step === reviewStep && Review}
              </div>

              {errors.length ? (
                <div className="bg-rose-50 border border-rose-100 text-rose-700 rounded-md" style={{ 
                  padding: 'clamp(0.625rem, 2vh, 0.75rem)', 
                  fontSize: 'clamp(0.75rem, 2.75vw, 0.875rem)',
                  marginTop: 'clamp(0.25rem, 1vh, 0.5rem)',
                }}>
                  <strong className="block font-medium">Please fix the following:</strong>
                  <ul className="list-disc list-inside" style={{ marginTop: 'clamp(0.25rem, 1vh, 0.5rem)', display: 'flex', flexDirection: 'column', gap: 'clamp(0.125rem, 0.5vh, 0.25rem)' }}>
                    {errors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {localError && (
                <div className="rounded-lg bg-rose-500/10 border border-rose-500/30 p-3" style={{
                  fontSize: 'clamp(0.75rem, 2.75vw, 0.875rem)',
                  marginTop: 'clamp(0.25rem, 1vh, 0.5rem)',
                }}>
                  <p style={{ color: 'rgb(251, 113, 133)', margin: 0 }}>{localError}</p>
                </div>
              )}

              <div className="flex items-center" style={{ gap: 'clamp(0.5rem, 2vw, 0.75rem)', paddingTop: 'clamp(0.25rem, 1vh, 0.5rem)' }}>
                {(step > 1 || step === reviewStep || (step === 1 && step1Phase === 'consent') || (step === 5 && (step5Phase === 'summary' || (step5Phase === 'question' && step5QuestionIndex > 0)))) ? (
                  <button
                    type="button"
                    onClick={handleBack}
                    className="flex-1 rounded-full font-semibold border border-white/15 text-white bg-black/40"
                    style={{
                      fontSize: 'clamp(0.75rem, 2.5vw, 0.875rem)',
                      padding: 'clamp(0.5rem, 1.5vh, 0.625rem) clamp(0.625rem, 2.5vw, 0.875rem)',
                    }}
                  >
                    Back
                  </button>
                ) : null}

                {step === reviewStep ? (
                  <button
                    type="submit"
                    className="flex-1 rounded-full font-semibold bg-[#F5F5F5] text-black flex items-center justify-center"
                    style={{
                      fontSize: 'clamp(0.75rem, 2.5vw, 0.875rem)',
                      padding: 'clamp(0.5rem, 1.5vh, 0.625rem) clamp(0.625rem, 2.5vw, 0.875rem)',
                    }}
                  >
                    Create account
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleNext}
                    disabled={step === 1 ? (step1Phase === 'terms' ? !termsAccepted : !consentAccepted) : (step === 5 && step5Phase === 'question' && !questionAnswers[step5Questions[step5QuestionIndex]?.key]) ? true : false}
                    className={`flex-1 rounded-full font-semibold flex items-center justify-center ${
                      step === 1 ? 
                        (step1Phase === 'terms' ? !termsAccepted : !consentAccepted) ? 
                          'bg-white/10 text-white/50 cursor-not-allowed' : 'bg-[#F5F5F5] text-black'
                        : step === 5 && step5Phase === 'question' && !questionAnswers[step5Questions[step5QuestionIndex]?.key]
                          ? 'bg-white/10 text-white/50 cursor-not-allowed'
                          : 'bg-[#F5F5F5] text-black'
                    }`}
                    style={{
                      fontSize: 'clamp(0.75rem, 2.5vw, 0.875rem)',
                      padding: 'clamp(0.5rem, 1.5vh, 0.625rem) clamp(0.625rem, 2.5vw, 0.875rem)',
                    }}
                  >
                    {step === 1 && step1Phase === 'terms'
                      ? 'Continue'
                      : step === 5 && step5Phase === 'intro'
                        ? 'Continue'
                        : step === 5 && step5Phase === 'summary'
                          ?  'Confirm'
                          : 'Next'}
                  </button>
                )}
              </div>
            </form>

            {/* Google Sign Up Option - Show on step 2 only */}
            {step === 2 && (
              <>
                <div className="relative" style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem', marginTop: '1rem' }}>
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-white/10"></div>
                  </div>
                  <div className="relative flex justify-center text-xs">
                    <span style={{ paddingX: '0.75rem', backgroundColor: 'rgb(15, 15, 19)', color: 'rgba(238,235,217,0.6)' }}>Or continue with</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleGoogleSignUp}
                  className="w-full rounded-full bg-white text-black font-semibold py-2 mb-4 flex items-center justify-center gap-2"
                  style={{ fontSize: 'clamp(0.875rem, 3vw, 1rem)' }}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 48 48"><path fill="#4285F4" d="M24 9.5c3.54 0 6.7 1.22 9.19 3.22l6.85-6.85C35.64 2.34 30.13 0 24 0 14.61 0 6.27 5.7 2.44 14.01l7.98 6.21C12.13 13.09 17.62 9.5 24 9.5z"/><path fill="#34A853" d="M46.1 24.59c0-1.54-.14-3.02-.39-4.45H24v8.44h12.44c-.54 2.9-2.18 5.36-4.64 7.02l7.19 5.59C43.73 37.13 46.1 31.36 46.1 24.59z"/><path fill="#FBBC05" d="M10.42 28.22c-1.13-3.36-1.13-6.97 0-10.33l-7.98-6.21C.64 16.61 0 20.21 0 24c0 3.79.64 7.39 2.44 10.32l7.98-6.1z"/><path fill="#EA4335" d="M24 48c6.13 0 11.64-2.02 15.84-5.5l-7.19-5.59c-2.01 1.35-4.59 2.15-8.65 2.15-6.38 0-11.87-3.59-14.58-8.72l-7.98 6.1C6.27 42.3 14.61 48 24 48z"/><path fill="none" d="M0 0h48v48H0z"/></svg>
                  Sign up with Google
                </button>
              </>
            )}

            {/* Sign in link - Show on step 1 and 2 */}
            {(step === 1 || step === 2) && (
              <div className="text-center" style={{ fontSize: 'clamp(0.8rem, 2.75vw, 0.875rem)', color: 'rgba(238,235,217,0.7)' }}>
                Already have an account? <Link href="/login"><a style={{ color: 'var(--app-white)', textDecoration: 'underline' }}>Sign in</a></Link>
              </div>
            )}
          </div>
      </div>
      </div>
    </>
  )
}

