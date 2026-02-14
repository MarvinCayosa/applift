import Head from 'next/head';
import Link from 'next/link';

export default function Profile() {
  return (
    <div className="min-h-screen bg-black text-white pb-32">
      <Head>
        <title>Profile — AppLift</title>
      </Head>

      <main className="w-full px-4 sm:px-6 md:px-8 pt-2.5 sm:pt-3.5 pt-pwa-dynamic pb-4 md:pb-6">
        <div className="w-full max-w-4xl mx-auto flex items-center justify-center min-h-[50vh]">
          <div className="text-center">
            <h1 className="text-2xl font-semibold text-white">Profile</h1>
            <p className="text-sm text-white/70 mt-2.5">This is a placeholder Profile page.</p>
            <div className="mt-4.5">
              <Link href="/dashboard"><a className="text-sm text-white/80 underline">Back to Dashboard</a></Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
