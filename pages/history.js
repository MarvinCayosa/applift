import Head from 'next/head';
import BottomNav from '../components/BottomNav';

export default function History() {
  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center pt-10 sm:pt-10">
      <Head>
        <title>History — AppLift</title>
      </Head>

      <h1 className="text-lg">History</h1>
      <BottomNav />
    </div>
  );
}
