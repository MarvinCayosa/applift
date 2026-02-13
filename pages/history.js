import Head from 'next/head';
import BottomNav from '../components/BottomNav';

export default function History() {
  return (
    <div className="min-h-screen bg-black text-white pb-32">
      <Head>
        <title>History — AppLift</title>
      </Head>

      <BottomNav />
      
      <main className="w-full px-4 sm:px-6 md:px-8 pt-2 sm:pt-3 pt-pwa-dynamic pb-4 md:pb-6">
        <div className="w-full max-w-4xl mx-auto flex items-center justify-center min-h-[50vh]">
          <h1 className="text-lg">History</h1>
        </div>
      </main>
    </div>
  );
}
