/**
 * Protected Route Component
 * Redirects unauthenticated users to login
 * Redirects users with incomplete onboarding to signup flow
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../context/AuthContext';
import LoadingScreen from './LoadingScreen';

// Pages that don't require authentication
const PUBLIC_ROUTES = ['/login', '/signup', '/splash', '/'];

// Pages that require authentication but not completed onboarding
const ONBOARDING_ROUTES = ['/signup'];

export function ProtectedRoute({ children }) {
  const router = useRouter();
  const { user, userProfile, loading, isAuthenticated, isOnboardingComplete } = useAuth();
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (loading) return;

    const currentPath = router.pathname;
    const isPublicRoute = PUBLIC_ROUTES.includes(currentPath);
    const isOnboardingRoute = ONBOARDING_ROUTES.includes(currentPath);

    // Not authenticated
    if (!isAuthenticated) {
      if (!isPublicRoute) {
        // Redirect to login if trying to access protected route
        router.replace('/login');
        return;
      }
      setIsReady(true);
      return;
    }

    // Authenticated but onboarding not complete
    if (isAuthenticated && !isOnboardingComplete) {
      if (!isOnboardingRoute && currentPath !== '/login' && currentPath !== '/splash' && currentPath !== '/') {
        // Redirect to signup to complete onboarding
        router.replace('/signup?step=3'); // Skip to details input for Google users
        return;
      }
      setIsReady(true);
      return;
    }

    // Authenticated and onboarding complete
    if (isAuthenticated && isOnboardingComplete) {
      // Redirect away from auth pages if already logged in and onboarded
      if (currentPath === '/login' || currentPath === '/signup') {
        router.replace('/dashboard');
        return;
      }
      setIsReady(true);
      return;
    }

    setIsReady(true);
  }, [loading, isAuthenticated, isOnboardingComplete, router]);

  // Show nothing while checking auth/redirecting
  if (loading || !isReady) {
    return <LoadingScreen message="Checking authentication..." showLogo={false} />;
  }

  return children;
}

/**
 * Higher-order component for protected pages
 */
export function withAuth(Component) {
  return function AuthenticatedComponent(props) {
    return (
      <ProtectedRoute>
        <Component {...props} />
      </ProtectedRoute>
    );
  };
}

export default ProtectedRoute;
