import Link from 'next/link';
import { useRouter } from 'next/router';
import { useRef, useEffect, useState } from 'react';

export default function BottomNav() {
  const router = useRouter();
  const current = router.pathname;
  const previousPathRef = useRef(current);
  const [shouldAnimate, setShouldAnimate] = useState(false);

  // Only trigger animation when route actually changes
  useEffect(() => {
    if (previousPathRef.current !== current) {
      setShouldAnimate(true);
      previousPathRef.current = current;
      
      // Reset animation state after animation completes
      const timer = setTimeout(() => {
        setShouldAnimate(false);
      }, 300); // Match animation duration
      
      return () => clearTimeout(timer);
    }
  }, [current]);

  const Item = ({ href, label, children }) => {
    const active = current === href;
    return (
      <Link href={href}>
        <a aria-current={active ? 'page' : undefined} aria-label={label || href} className="p-1 -m-1 nav-item-link">
          {active ? (
            <span className={`inline-flex items-center gap-3 bg-white/90 text-black rounded-full px-4 py-2 border border-white/70 shadow-lg backdrop-blur-md ${shouldAnimate ? 'nav-item-active' : 'nav-item-static'}`}>
              <span className={`inline-flex items-center justify-center w-5 h-5 ${shouldAnimate ? 'nav-icon-active' : ''}`}>{children}</span>
              {label && <span className="font-medium text-sm leading-none">{label}</span>}
            </span>
          ) : (
            <span className="inline-flex items-center justify-center w-10 h-10 text-white/80 rounded-full hover:bg-white/10 transition nav-item-inactive">
              <span className="nav-icon-inactive">{children}</span>
            </span>
          )}
        </a>
      </Link>
    );
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 flex justify-center pointer-events-none pb-[calc(1.5rem+env(safe-area-inset-bottom))]" role="navigation" aria-label="Primary">
      <div className="pointer-events-auto w-full max-w-lg px-4">
        <div className="mx-auto bg-white/7 backdrop-blur-xl border border-white/15 rounded-full px-4 py-2 flex items-center justify-between gap-6 shadow-[0_10px_30px_rgba(0,0,0,0.4)]">
          <Item href="/dashboard" label="Home">
            <img 
              src={current === '/dashboard' ? "/images/applift-logo/AppLift_Logo_Black.png" : "/images/applift-logo/AppLift_Logo_White.png"} 
              alt="Home" 
              className="w-5 h-5" 
            />
          </Item>

          <Item href="/workouts" label="Workouts">
            <svg className="w-5 h-5" viewBox="0 0 48 48" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
              <path fillRule="evenodd" d="M10.893 13.776c-.015.03-.064.14-.07.394a410 410 0 0 0-.096 10.357c.004 4.486.054 7.52.096 9.303c.006.253.055.364.07.394c.012.024.023.04.06.066c.117.08.448.21 1.115.21c.666 0 .997-.13 1.113-.21a.15.15 0 0 0 .06-.066c.016-.03.065-.14.07-.394c.045-1.852.097-5.053.097-9.83s-.052-7.978-.096-9.83c-.006-.253-.055-.364-.07-.394a.15.15 0 0 0-.06-.066c-.117-.08-.448-.21-1.114-.21s-.998.13-1.114.21a.15.15 0 0 0-.061.066M6.816 33.554l.008.372c.038 1.56.682 2.849 1.866 3.661c1.066.732 2.333.913 3.378.913s2.311-.181 3.377-.913c1.184-.812 1.828-2.1 1.865-3.662c.028-1.162.059-2.835.079-5.073a1263 1263 0 0 0 13.223-.01c.02 2.243.05 3.92.078 5.084c.037 1.56.682 2.849 1.865 3.661c1.066.732 2.333.913 3.378.913s2.311-.181 3.377-.913c1.184-.812 1.828-2.1 1.866-3.662l.008-.371q.472.082.953.082c1.215 0 2.418-.388 3.343-1.24c.939-.866 1.436-2.069 1.467-3.387c.029-1.185.054-2.836.054-5.01c0-2.172-.025-3.824-.054-5.009c-.032-1.318-.528-2.52-1.467-3.387c-.925-.852-2.128-1.24-3.343-1.24q-.482 0-.953.082l-.008-.37c-.038-1.561-.682-2.85-1.866-3.662c-1.066-.732-2.333-.913-3.377-.913c-1.045 0-2.312.181-3.378.913c-1.183.812-1.828 2.1-1.865 3.661a337 337 0 0 0-.078 5.085a1194 1194 0 0 0-13.224-.01a328 328 0 0 0-.078-5.075c-.037-1.56-.681-2.849-1.865-3.661c-1.066-.732-2.333-.913-3.378-.913s-2.311.181-3.377.913c-1.184.812-1.828 2.1-1.866 3.661l-.008.371a5.5 5.5 0 0 0-.952-.082c-1.216 0-2.418.388-3.343 1.24c-.94.866-1.436 2.07-1.468 3.387A209 209 0 0 0 1 24c0 2.173.025 3.824.053 5.009c.032 1.318.529 2.521 1.468 3.387c.925.852 2.127 1.24 3.343 1.24q.481 0 .952-.082m-.09-10.08v1.051a199 199 0 0 1-.05 4.387c-.01.355-.123.49-.18.543c-.074.067-.256.181-.632.181c-.377 0-.56-.114-.632-.181c-.058-.054-.171-.188-.18-.543C5.024 27.762 5 26.142 5 24s.024-3.762.052-4.913c.009-.354.122-.489.18-.543c.073-.067.255-.18.632-.18c.376 0 .558.113.631.18c.058.054.172.189.18.543c.026 1.055.048 2.503.052 4.388M41.275 24v.26c.001 2.014.025 3.548.052 4.652c.008.355.121.49.18.543c.072.067.255.181.631.181s.559-.114.632-.181c.058-.054.171-.188.18-.543c.027-1.15.052-2.77.052-4.912s-.025-3.762-.052-4.913c-.009-.354-.122-.489-.18-.543c-.073-.067-.256-.18-.632-.18s-.559.113-.631.18c-.059.054-.172.189-.18.543c-.027 1.104-.05 2.638-.052 4.653zm-4.097-9.83c.043 1.818.095 4.936.097 9.569v.522a415 415 0 0 1-.097 9.569c-.006.253-.054.364-.07.394a.16.16 0 0 1-.06.066c-.117.08-.447.21-1.114.21s-.998-.13-1.114-.21a.16.16 0 0 1-.06-.066c-.016-.03-.064-.14-.07-.394a419 419 0 0 1-.097-9.83c0-4.777.052-7.978.097-9.83c.006-.253.054-.364.07-.394a.16.16 0 0 1 .06-.066c.116-.08.447-.21 1.114-.21s.997.13 1.113.21a.16.16 0 0 1 .061.066c.016.03.064.14.07.394" clipRule="evenodd"/>
            </svg>
          </Item>

          <Item href="/history" label="History">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
              <path d="M6 13H2c-.6 0-1 .4-1 1v8c0 .6.4 1 1 1h4c.6 0 1-.4 1-1v-8c0-.6-.4-1-1-1zm16-4h-4c-.6 0-1 .4-1 1v12c0 .6.4 1 1 1h4c.6 0 1-.4 1-1V10c0-.6-.4-1-1-1zm-8-8h-4c-.6 0-1 .4-1 1v20c0 .6.4 1 1 1h4c.6 0 1-.4 1-1V2c0-.6-.4-1-1-1z"/>
            </svg>
          </Item>

          <Item href="/settings" label="Settings">
            <svg className="w-5 h-5" viewBox="0 0 416 432" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
              <path d="m366 237l45 35q7 6 3 14l-43 74q-4 8-13 4l-53-21q-18 13-36 21l-8 56q-1 9-11 9h-85q-9 0-11-9l-8-56q-19-8-36-21l-53 21q-9 3-13-4L1 286q-4-8 3-14l45-35q-1-12-1-21t1-21L4 160q-7-6-3-14l43-74q5-8 13-4l53 21q18-13 36-21l8-56q2-9 11-9h85q10 0 11 9l8 56q19 8 36 21l53-21q9-3 13 4l43 74q4 8-3 14l-45 35q2 12 2 21t-2 21zm-158.5 54q30.5 0 52.5-22t22-53t-22-53t-52.5-22t-52.5 22t-22 53t22 53t52.5 22z"/>
            </svg>
          </Item>
        </div>
      </div>
    </nav>
  );
}
