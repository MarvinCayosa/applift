import Head from 'next/head'
import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/router'
import { useUserProfile } from '../utils/userProfileStore'
import { useAuth } from '../context/AuthContext'
import { shouldUseAppMode } from '../utils/pwaInstalled'

const steps = [
  { id: 1, label: 'Terms' },
  { id: 2, label: 'Birthday' },
  { id: 3, label: 'Physical' },
  { id: 4, label: 'Fitness' },
]

// Birthday Picker - iOS-style wheel with center-based selection
function BirthdayPicker({ months, years, selectedMonth, selectedYear, onMonthChange, onYearChange, updateProfile }) {
  const monthRef = useRef(null)
  const yearRef = useRef(null)
  const scrollTimeoutRef = useRef(null)
  const itemHeight = 44

  // Initialize scroll position on mount
  useEffect(() => {
    if (monthRef.current && selectedMonth !== undefined) {
      const idx = months.indexOf(selectedMonth)
      if (idx !== -1) monthRef.current.scrollTop = idx * itemHeight
    }
    if (yearRef.current && selectedYear !== undefined) {
      const idx = years.indexOf(selectedYear)
      if (idx !== -1) yearRef.current.scrollTop = idx * itemHeight
    }
  }, [])

  const handleScroll = (ref, items, setter, isMonth) => {
    if (!ref.current) return
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

export default function SignupNew() {
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
  
  const { step: queryStep, provider } = router.query
  const isGoogleUser = provider === 'google' || userProfile?.provider === 'google'
  
  // New user without Google should start at step 1 (Terms)
  // Google new user should skip to step 1 (Terms) then step 2 (Birthday)
  const [step, setStep] = useState(1)
  const totalSteps = steps.length
  const [isAppMode, setIsAppMode] = useState(false)
  const [localError, setLocalError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    setIsAppMode(shouldUseAppMode())
  }, [])

  // Redirect if onboarding is already complete
  useEffect(() => {
    if (loading) return
    if (isAuthenticated && isOnboardingComplete) {
      router.replace('/dashboard')
    }
  }, [isAuthenticated, isOnboardingComplete, loading, router])

  // Step 1: Terms (session-based only, never persisted from profile)
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [consentAccepted, setConsentAccepted] = useState(false)
  const [termsScrolledToBottom, setTermsScrolledToBottom] = useState(false)
  const [consentScrolledToBottom, setConsentScrolledToBottom] = useState(false)
  const [step1Phase, setStep1Phase] = useState('terms') // 'terms' or 'consent'
  const termsContentRef = useRef(null)
  const consentContentRef = useRef(null)

  // Google flow: Step 1 for Google is Account (username)
  const [username, setUsername] = useState(profile.username || '')
  const [email, setEmail] = useState(profile.email || '')

  // Step 2 (Birthday): Gender & Birthday
  const [gender, setGender] = useState(profile.gender || '')
  const [birthMonth, setBirthMonth] = useState(profile.birthMonth || '')
  const [birthYear, setBirthYear] = useState(profile.birthYear || '')
  const [age, setAge] = useState(profile.age?.toString() || '')

  // Step 3 (Physical)
  const [weight, setWeight] = useState(profile.weight?.toString() || '')
  const [weightUnit, setWeightUnit] = useState(profile.weightUnit || 'kg')
  const [heightFeet, setHeightFeet] = useState(profile.heightFeet || '')
  const [heightInches, setHeightInches] = useState(profile.heightInches || '')
  const [heightValue, setHeightValue] = useState(profile.heightCm?.toString() || '')
  const [heightUnit, setHeightUnit] = useState(profile.heightUnit || 'ft')
  const [bmi, setBmi] = useState(profile.bmi || null)
  const [bmiCategory, setBmiCategory] = useState('')

  // Step 4 (Fitness questionnaire)
  const [questionAnswers, setQuestionAnswers] = useState({
    bodyType: '',
    weightResponse: '',
    strengthExperience: '',
    workoutFrequency: '',
    mainGoal: '',
    trainingPriority: '',
  })
  const [step4Phase, setStep4Phase] = useState('intro') // 'intro', 'question', 'summary'
  const [step4QuestionIndex, setStep4QuestionIndex] = useState(0)

  const [errors, setErrors] = useState([])

  function genUserId() {
    if (profile.userId) return profile.userId
    const id = `user_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`
    updateProfile({ userId: id })
    return id
  }

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

  // Height options
  const heightFeetOptions = Array.from({ length: 4 }, (_, i) => (4 + i).toString())
  const heightInchOptions = Array.from({ length: 12 }, (_, i) => i.toString())
  const heightCmOptions = Array.from({ length: 101 }, (_, i) => (120 + i).toString())

  // Compute age from month/year selections
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

  const step4Questions = [
    {
      key: 'bodyType',
      title: 'How would you describe your natural body build?',
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
      profileKey: 'strengthExperience',
      options: [
        { value: 'beginner', label: 'Beginner', description: 'Little to no experience with dumbbells, barbells, or machines.' },
        { value: 'intermediate', label: 'Intermediate', description: 'I can perform exercises correctly and consistently.' },
        { value: 'advanced', label: 'Advanced', description: 'I have extensive experience and lift heavier weights safely.' },
      ],
    },
    {
      key: 'workoutFrequency',
      title: 'How often do you currently work out per week?',
      profileKey: 'workoutFrequency',
      options: [
        { value: '0_1', label: '0–1 times', description: 'I\'m mostly inactive or just starting out.' },
        { value: '2_3', label: '2–3 times', description: 'I train occasionally but inconsistently.' },
        { value: '4_plus', label: '4+ times', description: 'I train regularly and consistently.' },
      ],
    },
    {
      key: 'mainGoal',
      title: 'What is your main goal for using AppLift?',
      profileKey: 'fitnessGoal',
      options: [
        { value: 'build_strength', label: 'Build Strength', description: 'I want to lift heavier and improve power.' },
        { value: 'hypertrophy', label: 'Increase Muscle', description: 'I want to grow and shape my muscles.' },
        { value: 'conditioning', label: 'Improve Conditioning', description: 'I want better stamina and consistent performance.' },
      ],
    },
    {
      key: 'trainingPriority',
      title: 'What\'s most important to you in your training?',
      profileKey: 'trainingPriority',
      options: [
        { value: 'safety_form', label: 'Safety and Correct Form', description: 'Avoid injury and train correctly.' },
        { value: 'progressive_load', label: 'Progressive Load and Gains', description: 'See measurable improvement over time.' },
        { value: 'consistency', label: 'Consistency and Habit Building', description: 'Make workouts part of my routine.' },
      ],
    },
  ]

  const getStep4Label = (key, value) => {
    const question = step4Questions.find((q) => q.key === key)
    const option = question?.options.find((o) => o.value === value)
    return option?.label || value || '—'
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

    if (step === 3) {
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

    if (step === 4) {
      if (step4Phase === 'intro') {
        setErrors([])
        return true
      }
      if (step4Phase === 'question') {
        const currentQuestion = step4Questions[step4QuestionIndex]
        const answer = questionAnswers[currentQuestion.key]
        if (!answer) {
          setErrors(['Please choose an option to continue.'])
          return false
        }
        setErrors([])
        return true
      }
      if (step4Phase === 'summary') {
        setErrors([])
        return true
      }
    }

    return true
  }

  async function handleNext() {
    if (!validateStep()) return
    
    if (step === 1) {
      if (step1Phase === 'terms') {
        // Move to consent phase, same step
        setStep1Phase('consent')
        setConsentScrolledToBottom(false)
      } else {
        // User completed both terms and consent
        updateProfile({ 
          termsAccepted: true,
          termsAcceptedAt: new Date().toISOString(),
          consentAccepted: true,
          consentAcceptedAt: new Date().toISOString()
        })
        // Move to next step
        setStep(step + 1)
      }
    } else if (step === 4) {
      // Handle Step 4 question flow
      if (step4Phase === 'intro') {
        setStep4Phase('question')
        setStep4QuestionIndex(0)
      } else if (step4Phase === 'question') {
        if (step4QuestionIndex < step4Questions.length - 1) {
          setStep4QuestionIndex(step4QuestionIndex + 1)
        } else {
          // Last question answered, show summary
          setStep4Phase('summary')
        }
      } else if (step4Phase === 'summary') {
        // Summary complete, submit form
        await handleSubmit(new Event('submit'))
      }
    } else if (step < totalSteps) {
      setStep(step + 1)
    }
  }

  function handleBack() {
    // Go back to splash page (login/signup choice)
    router.replace('/splash')
  }

  function handleBackButton() {
    if (step === 1 && step1Phase === 'consent') {
      // Go back to terms phase
      setStep1Phase('terms')
      setTermsScrolledToBottom(false)
      return
    }
    if (step === 4) {
      if (step4Phase === 'summary') {
        setStep4Phase('question')
        setStep4QuestionIndex(step4Questions.length - 1)
        return
      }
      if (step4Phase === 'question') {
        if (step4QuestionIndex > 0) {
          setStep4QuestionIndex(step4QuestionIndex - 1)
          return
        }
        // If first question, return to intro
        setStep4Phase('intro')
        setStep4QuestionIndex(0)
        return
      }
    }
    if (step === 1) {
      // Go back to splash
      handleBack()
      return
    }
    if (step > 1) {
      setStep(step - 1)
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setLocalError('')
    clearError()
    
    setIsSubmitting(true)
    
    // Gather all profile data
    const profileData = {
      username: username || (isGoogleUser ? userProfile?.displayName : 'User'),
      gender,
      birthMonth,
      birthYear,
      age: parseInt(age, 10) || null,
      weight: parseInt(weight, 10) || null,
      weightUnit,
      heightFeet,
      heightInches,
      heightValue,
      heightUnit,
      height: heightUnit === 'ft' 
        ? Math.round((parseInt(heightFeet, 10) || 0) * 30.48 + (parseInt(heightInches, 10) || 0) * 2.54)
        : parseInt(heightValue, 10) || null,
      bmi,
      bmiCategory,
      ...questionAnswers,
      termsAccepted: true,
      termsAcceptedAt: new Date().toISOString(),
      consentAccepted: true,
      consentAcceptedAt: new Date().toISOString(),
      onboardingCompleted: true,
    }
    
    try {
      await completeOnboarding(profileData)
      
      // Clear sensitive data
      setUsername('')
      
      // Update local profile store
      updateProfile({
        ...profileData,
        email,
        onboardingCompleted: true,
      })
      
      // Redirect to dashboard
      router.replace('/dashboard')
    } catch (err) {
      setLocalError(err.message)
      setErrors([err.message])
      setIsSubmitting(false)
    }
  }

  // Handle Google Sign-in during signup (shown only on Step 1 for new users)
  async function handleGoogleSignUp() {
    setLocalError('')
    clearError()
    
    try {
      const result = await signInWithGoogle()
      
      if (result.isNewUser && !result.onboardingCompleted) {
        // New Google user - set provider and pre-fill email, start from step 1
        updateProfile({
          email: result.profile.email,
          displayName: result.profile.displayName,
          username: result.profile.displayName || result.profile.email?.split('@')[0] || 'User',
        })
        // Stay on step 1 (Terms) - they need to accept terms and consent
        setStep(1)
      } else if (result.onboardingCompleted) {
        // Existing user - redirect to dashboard
        router.replace('/dashboard')
      }
    } catch (err) {
      setLocalError(err.message)
    }
  }

  const StepHeader = (
    <div style={{ marginBottom: 'clamp(0.75rem, 2vh, 1.5rem)' }}>
      <div className="flex items-center justify-between" style={{ marginBottom: 'clamp(0.5rem, 1.5vh, 0.75rem)' }}>
        <div className="font-medium" style={{ color: 'var(--app-white)', fontSize: 'clamp(0.8rem, 2.75vw, 0.875rem)' }}>Create your account</div>
        <div style={{ color: 'rgba(238,235,217,0.65)', fontSize: 'clamp(0.7rem, 2.5vw, 0.75rem)' }}>
          Step {step} of {totalSteps}
        </div>
      </div>
      <div className="flex items-center" style={{ gap: 'clamp(0.25rem, 1vw, 0.5rem)' }} aria-hidden>
        {steps.map((s, idx) => {
          const filled = idx < step
          return (
            <span
              key={s.id}
              className={`flex-1 rounded-full transition-all duration-200 ${filled ? 'bg-[#8b5cf6]' : 'bg-white/15'}`}
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

  // RENDER LOGIC
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="text-white text-xl">Loading...</div>
      </div>
    )
  }

  if (isAuthenticated && isOnboardingComplete) {
    return null
  }

  return (
    <>
      <style jsx>{`
        .auth-container {
          height: 100dvh;
          width: 100vw;
          overflow: hidden;
          padding-top: env(safe-area-inset-top);
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
        }

        .auth-wrapper {
          max-width: 420px;
          max-height: 100%;
          overflow: auto;
        }

        @media (min-width: 768px) {
          .auth-wrapper {
            max-width: 28rem;
            max-height: none;
            overflow: visible;
          }
        }
      `}</style>

      <div className="auth-container bg-black flex items-center justify-center">
        <Head>
          <title>Sign up — AppLift</title>
          <meta name="description" content="Create your AppLift account" />
        </Head>

        <div className="auth-wrapper relative w-full">
          {/* Back Button - at top */}
          <button
            onClick={handleBackButton}
            className="mb-4 inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-white/10 border border-white/20 hover:bg-white/15 transition-colors"
            style={{ fontSize: 'clamp(0.75rem, 2.5vw, 0.875rem)', color: 'var(--app-white)' }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 18l-6-6 6-6" />
            </svg>
            Back
          </button>

          <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-[36px] shadow-2xl" style={{
            padding: 'clamp(1rem, 3vh, 2rem)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'clamp(0.75rem, 2vh, 1.25rem)',
          }}>
            {StepHeader}

            {/* Error message */}
            {localError && (
              <div className="rounded-lg bg-rose-500/10 border border-rose-500/30 p-3">
                <p style={{ color: 'rgb(251, 113, 133)', margin: 0, fontSize: 'clamp(0.75rem, 2.5vw, 0.875rem)' }}>{localError}</p>
              </div>
            )}

            {errors.length > 0 && (
              <div className="rounded-lg bg-rose-500/10 border border-rose-500/30 p-3">
                {errors.map((error, idx) => (
                  <p key={idx} style={{ color: 'rgb(251, 113, 133)', margin: 0, fontSize: 'clamp(0.75rem, 2.5vw, 0.875rem)' }}>
                    {error}
                  </p>
                ))}
              </div>
            )}

            <div style={{ minHeight: '300px' }}>
              {/* STEP 1: TERMS & CONSENT */}
              {step === 1 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(0.75rem, 2vh, 1rem)' }}>
                  {step1Phase === 'terms' && (
                    <div>
                      <h2 style={{ fontSize: 'clamp(0.875rem, 3vw, 1rem)', fontWeight: '600', color: 'var(--app-white)', margin: 0, marginBottom: 'clamp(0.5rem, 1.5vh, 0.75rem)' }}>Terms and Conditions</h2>
                      <p style={{ fontSize: 'clamp(0.7rem, 2.5vw, 0.75rem)', color: 'rgba(238,235,217,0.7)', marginBottom: 'clamp(0.5rem, 1.5vh, 0.75rem)', marginTop: 0 }}>
                        By proceeding, you confirm that you have read and agreed to the Terms and Conditions.
                      </p>
                      <div className="relative rounded-lg border border-white/10 bg-black/30 overflow-hidden" style={{ height: 'clamp(10rem, 25vh, 14rem)' }}>
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
                          onChange={(e) => setTermsAccepted(e.target.checked)}
                          disabled={!termsScrolledToBottom}
                          className="rounded border-white/30 bg-black/50 text-[#8b5cf6] focus:ring-0 disabled:opacity-50 disabled:cursor-not-allowed"
                          style={{ width: 'clamp(0.875rem, 3vw, 1rem)', height: 'clamp(0.875rem, 3vw, 1rem)' }}
                        />
                        I agree to the Terms and Conditions
                      </label>
                    </div>
                  )}

                  {step1Phase === 'consent' && (
                    <div>
                      <h2 style={{ fontSize: 'clamp(0.875rem, 3vw, 1rem)', fontWeight: '600', color: 'var(--app-white)', margin: 0, marginBottom: 'clamp(0.5rem, 1.5vh, 0.75rem)' }}>Informed User Consent</h2>
                      <p style={{ fontSize: 'clamp(0.7rem, 2.5vw, 0.75rem)', color: 'rgba(238,235,217,0.7)', marginBottom: 'clamp(0.5rem, 1.5vh, 0.75rem)', marginTop: 0 }}>
                        By using AppLift, you consent to the collection and use of your data to provide personalized insights.
                      </p>
                      <div className="relative rounded-lg border border-white/10 bg-black/30 overflow-hidden" style={{ height: 'clamp(10rem, 25vh, 14rem)' }}>
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
                          onChange={(e) => setConsentAccepted(e.target.checked)}
                          disabled={!consentScrolledToBottom}
                          className="rounded border-white/30 bg-black/50 text-[#8b5cf6] focus:ring-0 disabled:opacity-50 disabled:cursor-not-allowed"
                          style={{ width: 'clamp(0.875rem, 3vw, 1rem)', height: 'clamp(0.875rem, 3vw, 1rem)' }}
                        />
                        I give my informed consent
                      </label>
                    </div>
                  )}
                </div>
              )}

              {/* STEP 2: BIRTHDAY */}
              {step === 2 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(0.75rem, 2vh, 1rem)' }}>
                  <h2 style={{ fontSize: 'clamp(0.875rem, 3vw, 1rem)', fontWeight: '600', color: 'var(--app-white)', margin: 0, marginBottom: 'clamp(0.5rem, 1.5vh, 0.75rem)' }}>When were you born?</h2>
                  
                  <label style={{ fontSize: 'clamp(0.7rem, 2.5vw, 0.75rem)', color: 'rgba(238,235,217,0.85)' }}>
                    Gender
                  </label>
                  <select
                    value={gender}
                    onChange={(e) => { setGender(e.target.value); updateProfile({ gender: e.target.value }) }}
                    className="w-full rounded-full bg-black/40 text-white border border-white/5"
                    style={{
                      fontSize: 'clamp(0.875rem, 3vw, 1rem)',
                      padding: 'clamp(0.625rem, 2vh, 0.75rem) clamp(0.875rem, 3vw, 1rem)',
                    }}
                  >
                    <option value="">Select Gender</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>

                  <label style={{ fontSize: 'clamp(0.7rem, 2.5vw, 0.75rem)', color: 'rgba(238,235,217,0.85)' }}>
                    Birth Month & Year
                  </label>
                  <BirthdayPicker
                    months={monthOptions}
                    years={yearOptions}
                    selectedMonth={birthMonth}
                    selectedYear={birthYear}
                    onMonthChange={setBirthMonth}
                    onYearChange={setBirthYear}
                    updateProfile={updateProfile}
                  />

                  {/* Google Sign-In Button - Only on Step 2 */}
                  {!isGoogleUser && (
                    <>
                      <div style={{ textAlign: 'center', color: 'rgba(238,235,217,0.5)', fontSize: 'clamp(0.7rem, 2.5vw, 0.75rem)', margin: 'clamp(0.5rem, 1.5vh, 1rem) 0' }}>
                        or
                      </div>
                      <button
                        type="button"
                        onClick={handleGoogleSignUp}
                        className="w-full rounded-full bg-white text-black font-semibold py-2 flex items-center justify-center gap-2"
                        style={{ fontSize: 'clamp(0.875rem, 3vw, 1rem)' }}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 48 48"><path fill="#4285F4" d="M24 9.5c3.54 0 6.7 1.22 9.19 3.22l6.85-6.85C35.64 2.34 30.13 0 24 0 14.61 0 6.27 5.7 2.44 14.01l7.98 6.21C12.13 13.09 17.62 9.5 24 9.5z"/><path fill="#34A853" d="M46.1 24.59c0-1.54-.14-3.02-.39-4.45H24v8.44h12.44c-.54 2.9-2.18 5.36-4.64 7.02l7.19 5.59C43.73 37.13 46.1 31.36 46.1 24.59z"/><path fill="#FBBC05" d="M10.42 28.22c-1.13-3.36-1.13-6.97 0-10.33l-7.98-6.21C.64 16.61 0 20.21 0 24c0 3.79.64 7.39 2.44 10.32l7.98-6.1z"/><path fill="#EA4335" d="M24 48c6.13 0 11.64-2.02 15.84-5.5l-7.19-5.59c-2.01 1.35-4.59 2.15-8.65 2.15-6.38 0-11.87-3.59-14.58-8.72l-7.98 6.1C6.27 42.3 14.61 48 24 48z"/><path fill="none" d="M0 0h48v48H0z"/></svg>
                        Continue with Google
                      </button>
                    </>
                  )}
                </div>
              )}

              {/* STEP 3: PHYSICAL */}
              {step === 3 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(0.75rem, 2vh, 1rem)' }}>
                  <h2 style={{ fontSize: 'clamp(0.875rem, 3vw, 1rem)', fontWeight: '600', color: 'var(--app-white)', margin: 0, marginBottom: 'clamp(0.5rem, 1.5vh, 0.75rem)' }}>Your measurements</h2>
                  
                  <label className="block" style={{ fontSize: 'clamp(0.7rem, 2.5vw, 0.75rem)', color: 'rgba(238,235,217,0.85)' }}>
                    Weight
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      value={weight}
                      onChange={(e) => { setWeight(e.target.value); updateProfile({ weight: parseInt(e.target.value, 10) || null }) }}
                      className="flex-1 rounded-full bg-black/40 text-white border border-white/5"
                      style={{
                        fontSize: 'clamp(0.875rem, 3vw, 1rem)',
                        padding: 'clamp(0.625rem, 2vh, 0.75rem) clamp(0.875rem, 3vw, 1rem)',
                      }}
                      placeholder="Weight"
                    />
                    <select
                      value={weightUnit}
                      onChange={(e) => { setWeightUnit(e.target.value); updateProfile({ weightUnit: e.target.value }) }}
                      className="rounded-full bg-black/40 text-white border border-white/5"
                      style={{
                        fontSize: 'clamp(0.875rem, 3vw, 1rem)',
                        padding: 'clamp(0.625rem, 2vh, 0.75rem) clamp(0.875rem, 3vw, 1rem)',
                      }}
                    >
                      <option value="kg">kg</option>
                      <option value="lbs">lbs</option>
                    </select>
                  </div>

                  <label style={{ fontSize: 'clamp(0.7rem, 2.5vw, 0.75rem)', color: 'rgba(238,235,217,0.85)' }}>
                    Height
                  </label>
                  {heightUnit === 'ft' ? (
                    <div className="flex gap-2">
                      <select
                        value={heightFeet}
                        onChange={(e) => { setHeightFeet(e.target.value); updateProfile({ heightFeet: e.target.value }) }}
                        className="flex-1 rounded-full bg-black/40 text-white border border-white/5"
                        style={{
                          fontSize: 'clamp(0.875rem, 3vw, 1rem)',
                          padding: 'clamp(0.625rem, 2vh, 0.75rem) clamp(0.875rem, 3vw, 1rem)',
                        }}
                      >
                        <option value="">Feet</option>
                        {heightFeetOptions.map(ft => <option key={ft} value={ft}>{ft}'</option>)}
                      </select>
                      <select
                        value={heightInches}
                        onChange={(e) => { setHeightInches(e.target.value); updateProfile({ heightInches: e.target.value }) }}
                        className="flex-1 rounded-full bg-black/40 text-white border border-white/5"
                        style={{
                          fontSize: 'clamp(0.875rem, 3vw, 1rem)',
                          padding: 'clamp(0.625rem, 2vh, 0.75rem) clamp(0.875rem, 3vw, 1rem)',
                        }}
                      >
                        <option value="">Inches</option>
                        {heightInchOptions.map(inches => <option key={inches} value={inches}>{inches}"</option>)}
                      </select>
                    </div>
                  ) : (
                    <select
                      value={heightValue}
                      onChange={(e) => { setHeightValue(e.target.value); updateProfile({ heightCm: parseInt(e.target.value, 10) || null }) }}
                      className="w-full rounded-full bg-black/40 text-white border border-white/5"
                      style={{
                        fontSize: 'clamp(0.875rem, 3vw, 1rem)',
                        padding: 'clamp(0.625rem, 2vh, 0.75rem) clamp(0.875rem, 3vw, 1rem)',
                      }}
                    >
                      <option value="">Height (cm)</option>
                      {heightCmOptions.map(cm => <option key={cm} value={cm}>{cm} cm</option>)}
                    </select>
                  )}
                  <button
                    type="button"
                    onClick={() => setHeightUnit(heightUnit === 'ft' ? 'cm' : 'ft')}
                    className="text-xs text-[#8b5cf6] hover:text-[#a78bfa] transition-colors"
                    style={{ textAlign: 'left' }}
                  >
                    Use {heightUnit === 'ft' ? 'cm' : 'feet/inches'}
                  </button>

                  {bmi && (
                    <div className="p-3 rounded-lg bg-purple-500/10 border border-purple-500/30" style={{ fontSize: 'clamp(0.75rem, 2.5vw, 0.875rem)', color: 'rgba(255, 255, 255, 0.9)' }}>
                      BMI: <strong>{bmi}</strong> ({bmiCategory})
                    </div>
                  )}
                </div>
              )}

              {/* STEP 4: FITNESS QUESTIONNAIRE */}
              {step === 4 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(0.75rem, 2vh, 1rem)' }}>
                  {step4Phase === 'intro' && (
                    <>
                      <h2 style={{ fontSize: 'clamp(0.875rem, 3vw, 1rem)', fontWeight: '600', color: 'var(--app-white)', margin: 0, marginBottom: 'clamp(0.5rem, 1.5vh, 0.75rem)' }}>Let's personalize your experience</h2>
                      <p style={{ fontSize: 'clamp(0.75rem, 2.5vw, 0.875rem)', color: 'rgba(238,235,217,0.8)', marginTop: 0 }}>
                        We'll ask you 6 quick questions to understand your fitness profile and goals.
                      </p>
                    </>
                  )}

                  {step4Phase === 'question' && (
                    <>
                      <h3 style={{ fontSize: 'clamp(0.875rem, 3vw, 1rem)', fontWeight: '600', color: 'var(--app-white)', margin: 0, marginBottom: 'clamp(0.5rem, 1.5vh, 0.75rem)' }}>
                        {step4Questions[step4QuestionIndex].title}
                      </h3>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(0.5rem, 1.5vh, 0.75rem)' }}>
                        {step4Questions[step4QuestionIndex].options.map(option => (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => setQuestionAnswers({ ...questionAnswers, [step4Questions[step4QuestionIndex].key]: option.value })}
                            className={`p-3 rounded-lg border transition-all text-left ${
                              questionAnswers[step4Questions[step4QuestionIndex].key] === option.value
                                ? 'bg-[#8b5cf6] border-[#8b5cf6]'
                                : 'bg-black/30 border-white/10 hover:border-white/30'
                            }`}
                            style={{
                              color: questionAnswers[step4Questions[step4QuestionIndex].key] === option.value ? '#fff' : 'rgba(255,255,255,0.9)',
                            }}
                          >
                            <div style={{ fontWeight: '500', fontSize: 'clamp(0.8rem, 2.75vw, 0.9rem)' }}>{option.label}</div>
                            <div style={{ fontSize: 'clamp(0.7rem, 2.5vw, 0.8rem)', opacity: 0.8, marginTop: '0.25rem' }}>{option.description}</div>
                          </button>
                        ))}
                      </div>
                      <div style={{ fontSize: 'clamp(0.65rem, 2.25vw, 0.75rem)', color: 'rgba(238,235,217,0.5)', marginTop: 'clamp(0.5rem, 1.5vh, 1rem)' }}>
                        Question {step4QuestionIndex + 1} of {step4Questions.length}
                      </div>
                    </>
                  )}

                  {step4Phase === 'summary' && (
                    <>
                      <h3 style={{ fontSize: 'clamp(0.875rem, 3vw, 1rem)', fontWeight: '600', color: 'var(--app-white)', margin: 0, marginBottom: 'clamp(0.5rem, 1.5vh, 0.75rem)' }}>Review your answers</h3>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(0.5rem, 1.5vh, 0.75rem)' }}>
                        {step4Questions.map(question => (
                          <div key={question.key} className="p-3 rounded-lg bg-black/30 border border-white/10">
                            <div style={{ fontSize: 'clamp(0.7rem, 2.5vw, 0.75rem)', color: 'rgba(238,235,217,0.7)' }}>
                              {question.title}
                            </div>
                            <div style={{ fontSize: 'clamp(0.8rem, 2.75vw, 0.9rem)', color: 'var(--app-white)', fontWeight: '500', marginTop: '0.25rem' }}>
                              {getStep4Label(question.key, questionAnswers[question.key])}
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2" style={{ marginTop: 'clamp(1rem, 3vh, 1.5rem)' }}>
              <button
                type="button"
                onClick={handleBackButton}
                className="flex-1 rounded-full bg-white/10 border border-white/20 text-white font-semibold py-2"
                style={{ fontSize: 'clamp(0.875rem, 3vw, 1rem)' }}
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleNext}
                disabled={isSubmitting}
                className="flex-1 rounded-full bg-[#EEEDB9] text-black font-semibold py-2 disabled:opacity-50"
                style={{ fontSize: 'clamp(0.875rem, 3vw, 1rem)' }}
              >
                {isSubmitting ? 'Processing...' : step === totalSteps && (step4Phase === 'summary' || step !== 4) ? 'Complete' : 'Continue'}
              </button>
            </div>

            <div className="text-center" style={{ fontSize: 'clamp(0.8rem, 2.75vw, 0.875rem)', marginTop: 'clamp(0.5rem, 1.5vh, 1rem)' }}>
              Already have an account? <a href="/login" style={{ color: 'var(--app-white)', textDecoration: 'none' }}>Sign in</a>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
