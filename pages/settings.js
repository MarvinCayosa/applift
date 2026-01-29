import Head from 'next/head';
import BottomNav from '../components/BottomNav';

export default function Settings() {
  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center pt-10 sm:pt-10">
      <Head>
        <title>Settings — AppLift</title>
      </Head>

      <h1 className="text-lg">Settings</h1>
      <BottomNav />
    </div>
  );
}
