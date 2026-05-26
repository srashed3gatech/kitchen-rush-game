import { useEffect, useState, useRef } from 'react';
import { getSettings, putSetting } from '../api/endpoints';

/**
 * OnboardingToasts — first-day tutorial flow (design §2.1).
 *
 * Reads settings.tutorial_seen from server on mount.
 * If false, fires the timed toast sequence.
 * PUT settings/tutorial_seen=true on dismiss or sequence completion.
 *
 * Toasts auto-dismiss after 6 seconds.
 * A small "skip" link dismisses the whole sequence immediately.
 * Tutorial NEVER blocks gameplay.
 */

interface Toast {
  id: string;
  message: string;
  delayMs: number;
}

const TUTORIAL_TOASTS: Toast[] = [
  {
    id: 'welcome',
    message: 'Welcome. Alex will arrive at 8 AM.',
    delayMs: 0,
  },
  {
    id: 'look-around',
    message: 'This is your shop. Take a moment to look around.',
    delayMs: 2_000,
  },
  {
    id: 'coach-alex',
    message: 'Click Alex any time to coach them.',
    delayMs: 5_000,
  },
  {
    id: 'customers',
    message: "Customers walk in on their own. No rush — they'll wait.",
    delayMs: 12_000,
  },
];

interface ActiveToast {
  id: string;
  message: string;
  expiresAt: number;
}

export default function OnboardingToasts() {
  const [tutorialSeen, setTutorialSeen] = useState<boolean | null>(null);
  const [activeToasts, setActiveToasts] = useState<ActiveToast[]>([]);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const dismissed = useRef(false);

  // Load tutorial_seen on mount
  useEffect(() => {
    getSettings()
      .then((res) => {
        if (res) {
          setTutorialSeen(res.kv['tutorial_seen'] === 'true');
        }
      })
      .catch(() => {
        // If we can't load settings, don't show tutorial (fail safe)
        setTutorialSeen(true);
      });
  }, []);

  // Start toast sequence when tutorial_seen = false
  useEffect(() => {
    if (tutorialSeen !== false) return;

    const DISPLAY_DURATION = 6_000;

    TUTORIAL_TOASTS.forEach((toast) => {
      const showTimer = setTimeout(() => {
        if (dismissed.current) return;
        setActiveToasts((prev) => [
          ...prev,
          { id: toast.id, message: toast.message, expiresAt: Date.now() + DISPLAY_DURATION },
        ]);

        const removeTimer = setTimeout(() => {
          setActiveToasts((prev) => prev.filter((t) => t.id !== toast.id));
        }, DISPLAY_DURATION);
        timersRef.current.push(removeTimer);
      }, toast.delayMs);

      timersRef.current.push(showTimer);
    });

    // After last toast + display time, mark tutorial as seen
    const lastToastDelay = TUTORIAL_TOASTS[TUTORIAL_TOASTS.length - 1]?.delayMs ?? 12_000;
    const completionTimer = setTimeout(
      () => {
        if (!dismissed.current) {
          markTutorialSeen();
        }
      },
      lastToastDelay + 6_000 + 500,
    );
    timersRef.current.push(completionTimer);

    return () => {
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
    };
  }, [tutorialSeen]);

  function markTutorialSeen() {
    dismissed.current = true;
    setTutorialSeen(true);
    setActiveToasts([]);
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    putSetting('tutorial_seen', 'true').catch(() => {});
  }

  function dismissSingle(id: string) {
    setActiveToasts((prev) => prev.filter((t) => t.id !== id));
  }

  // Nothing to render if tutorial already seen or not loaded yet
  if (tutorialSeen !== false || activeToasts.length === 0) return null;

  return (
    <div className="fixed top-14 left-1/2 -translate-x-1/2 z-40 flex flex-col items-center gap-2 pointer-events-none">
      {activeToasts.map((toast) => (
        <div
          key={toast.id}
          className="
            flex items-center gap-3
            bg-cozy-dim/85 text-white text-sm rounded-xl
            px-4 py-2.5 shadow-lg
            pointer-events-auto
            animate-[fadeInDown_0.3s_ease]
          "
        >
          <span>{toast.message}</span>
          <button
            onClick={() => dismissSingle(toast.id)}
            className="text-white/60 hover:text-white text-xs underline flex-shrink-0"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      ))}

      {/* Skip all */}
      <button
        onClick={markTutorialSeen}
        className="
          pointer-events-auto
          text-xs text-cozy-dim/40 hover:text-cozy-dim/70
          underline mt-0.5
        "
      >
        skip tutorial
      </button>
    </div>
  );
}
