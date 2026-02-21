import Head from 'next/head'
import { useRouter } from 'next/router'
import BottomNav from '../../../components/BottomNav'
import {
  equipmentConfig,
  useEquipmentData,
  EquipmentHero,
  EquipmentStatsRow,
  RecentExerciseCards,
  ExerciseImageCards,
} from '../../../components/equipment'

const svgIcons = {
  dumbbell: '/svg/dumbbell.svg',
  barbell: '/svg/barbell.svg',
  'weight-stack': '/svg/weight-stack.svg',
}

export default function EquipmentPage() {
  const router = useRouter()
  const { type } = router.query
  const slug = typeof type === 'string' ? type : ''

  const { config, exerciseLogs, stats, loading } = useEquipmentData(slug)

  // Guard: unknown equipment
  if (!config) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <p className="text-white/50">Equipment not found</p>
      </div>
    )
  }

  return (
    <>
      <Head>
        <title>{config.label} Statistics | AppLift</title>
      </Head>

      <div className="min-h-screen bg-black text-white pb-28" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        {/* Hero */}
        <EquipmentHero label={config.label} heroImage={config.heroImage} />

        {/* Content - overlaps hero */}
        <div className="px-4 space-y-6 relative z-10" style={{ marginTop: '-130px' }}>
          {/* Stats */}
          <div className="content-fade-up-1">
            <EquipmentStatsRow stats={stats} primaryColor={config.primary} />
          </div>

          {/* Recent Exercises */}
          <section className="content-fade-up-2">
            <div className="flex items-center gap-2 mb-3">
              <h2 className="text-lg font-bold text-white">Recent Exercises</h2>
              <svg className="w-4 h-4 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            {loading ? (
              <div className="flex justify-center py-8">
                <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
              </div>
            ) : (
              <RecentExerciseCards
                exercises={config.exercises}
                exerciseLogs={exerciseLogs}
                primaryColor={config.primary}
                primaryDark={config.primaryDark}
              />
            )}
          </section>

          {/* Exercise Image Cards */}
          <section className="content-fade-up-3">
            <ExerciseImageCards
              exercises={config.exercises}
              equipmentSlug={config.slug}
              equipmentIcon={svgIcons[slug]}
            />
          </section>
        </div>

        <BottomNav />
      </div>
    </>
  )
}
