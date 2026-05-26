import { createContext, useContext, useEffect } from 'react';
import { useAuth } from './hooks/useAuth';
import { primeOnFirstGesture } from './audio/sfx';
import { usePollingState } from './hooks/usePollingState';
import type { RestaurantState } from '@kitchen-rush/shared/domain';
import type { PublicUser } from '@kitchen-rush/shared/api';

import LoginScreen from './ui/LoginScreen';
import TopBar from './ui/TopBar';
import WorkerPanel from './ui/WorkerPanel';
import CoachingModal from './ui/CoachingModal';
import SettingsModal from './ui/SettingsModal';
import ReviewsPanel from './ui/ReviewsPanel';
import MenuPanel from './ui/MenuPanel';
import LeaderboardPanel from './ui/LeaderboardPanel';
import DaySummaryModal from './ui/DaySummaryModal';
import OneOnOneModal from './ui/OneOnOneModal';
import OnboardingToasts from './ui/OnboardingToasts';
import HirePanel from './ui/HirePanel';
import WelcomeModal from './ui/WelcomeModal';
import ReviewFlash from './ui/ReviewFlash';
import StatsPanel from './ui/StatsPanel';
import InspectCustomerModal from './ui/InspectCustomerModal';

// Canvas SWE owns this file — it exists; import directly.
import { Scene } from './canvas/Scene';

// ── Contexts ─────────────────────────────────────────────────────────────

interface AuthContextValue {
  user: PublicUser | null;
  restaurantId: number | null;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue>({
  user: null,
  restaurantId: null,
  logout: async () => {},
});

export const RestaurantStateContext = createContext<{
  state: RestaurantState | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}>({
  state: null,
  loading: false,
  error: null,
  refresh: () => {},
});

export function useRestaurantState() {
  return useContext(RestaurantStateContext);
}

// ── Game layout (authenticated) ───────────────────────────────────────────

function Game() {
  const { state, loading, error, refresh } = useRestaurantState();

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-cozy-warm">
      {/* Top bar — full width, sticky */}
      <TopBar />

      {/* Main area: canvas + side panel (column on mobile, row on tablet+) */}
      <div className="flex flex-col sm:flex-row flex-1 min-h-0 relative">
        {/* Canvas scene — full-width, centered. Scales down on small screens. */}
        <div className="flex-1 relative overflow-hidden flex items-start sm:items-center justify-center p-2 sm:p-3">
          <Scene state={state} />
          {/* Loading overlay (first load only) */}
          {loading && !state && (
            <div className="absolute inset-0 flex items-center justify-center bg-cozy-warm/60">
              <span className="text-cozy-dim/60 text-sm animate-pulse">Loading…</span>
            </div>
          )}
          {/* Error banner */}
          {error && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-red-100 text-red-700 px-4 py-2 rounded-lg text-sm shadow">
              {error}{' '}
              <button
                onClick={refresh}
                className="underline ml-1 font-medium"
              >
                Retry
              </button>
            </div>
          )}
        </div>

        {/* Right side panel — collapsible worker list */}
        <WorkerPanel />
      </div>

      {/* Modal overlay layer */}
      <CoachingModal />
      <SettingsModal />
      <ReviewsPanel />
      <MenuPanel />
      <LeaderboardPanel />
      <DaySummaryModal />
      <OneOnOneModal />
      <HirePanel />
      <WelcomeModal />
      <ReviewFlash />
      <StatsPanel />
      <InspectCustomerModal />

      {/* Onboarding toasts — only shown once, tutorial_seen guard */}
      <OnboardingToasts />
    </div>
  );
}

// ── Root app — state machine: unauthed → authed ───────────────────────────

export default function App() {
  const auth = useAuth();
  const polling = usePollingState(auth.isAuthed);

  // Unlock WebAudio on the first user gesture (iPad Safari requirement)
  useEffect(() => {
    primeOnFirstGesture();
  }, []);

  if (auth.loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-cozy-warm">
        <span className="text-cozy-dim/50 text-sm animate-pulse">Kitchen Rush…</span>
      </div>
    );
  }

  if (!auth.isAuthed) {
    return (
      <AuthContext.Provider
        value={{ user: auth.user, restaurantId: auth.restaurantId, logout: auth.logout }}
      >
        <LoginScreen
          onLogin={auth.login}
          onRegister={auth.register}
          error={auth.error}
        />
      </AuthContext.Provider>
    );
  }

  return (
    <AuthContext.Provider
      value={{ user: auth.user, restaurantId: auth.restaurantId, logout: auth.logout }}
    >
      <RestaurantStateContext.Provider value={polling}>
        <Game />
      </RestaurantStateContext.Provider>
    </AuthContext.Provider>
  );
}
