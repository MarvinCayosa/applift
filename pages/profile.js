import Head from 'next/head';
import Link from 'next/link';

export default function Profile() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 pt-10 sm:pt-12">
      <Head>
        <title>Profile — AppLift</title>
      </Head>

      <div className="text-center">
        <h1 className="text-2xl font-semibold text-white">Profile</h1>
        <p className="text-sm text-white/70 mt-2">This is a placeholder Profile page.</p>
        <div className="mt-4">
          <Link href="/dashboard"><a className="text-sm text-white/80 underline">Back to Dashboard</a></Link>
        </div>
      </div>
    </div>
  );
}
