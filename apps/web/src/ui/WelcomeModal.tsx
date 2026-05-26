import { useEffect, useState } from 'react';
import { useStore, store } from '../state/store';
import { getSettings, putSetting } from '../api/endpoints';

/**
 * WelcomeModal — the "what is this game?" card.
 *
 * Opens automatically the FIRST time a player logs in (settings.welcome_seen
 * not set). Player can also reopen anytime via the "?" Help icon in TopBar.
 *
 * Plain-English orientation in 3 bullets — no game-jargon, no design-doc
 * vocabulary. Direct response to user feedback "I don't understand what it is."
 */

export default function WelcomeModal() {
  const uiState = useStore();
  const [autoChecked, setAutoChecked] = useState(false);

  const open = uiState.openModal === 'welcome';

  // On mount, check if the user has seen the welcome card. If not, open it.
  useEffect(() => {
    if (autoChecked) return;
    setAutoChecked(true);
    getSettings()
      .then((res) => {
        if (res && res.kv['welcome_seen'] !== 'true') {
          store.openModal('welcome');
        }
      })
      .catch(() => {
        // Network failed? Don't push the modal — they can find it via ?.
      });
  }, [autoChecked]);

  function handleDismiss() {
    store.closeModal();
    putSetting('welcome_seen', 'true').catch(() => {});
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-cozy-dim/40 backdrop-blur-sm p-4"
      onClick={handleDismiss}
    >
      <div
        className="
          bg-cozy-warm rounded-2xl shadow-xl border border-beach-sand/60
          w-full max-w-md p-7
        "
        onClick={(e) => e.stopPropagation()}
      >
        {/* Heading */}
        <div className="text-center mb-5">
          <div className="text-5xl mb-3" aria-hidden="true">🏖️</div>
          <h2 className="text-xl font-bold text-cozy-dim">Welcome to Kitchen Rush</h2>
          <p className="text-sm text-cozy-dim/60 mt-1 italic">
            A cozy beachfront shop. No timers, no fails — just a relaxed daily rhythm.
          </p>
        </div>

        {/* What you do */}
        <div className="space-y-3 mb-5">
          <div className="flex gap-3">
            <span className="text-2xl leading-none flex-shrink-0">🧑‍🍳</span>
            <div>
              <p className="text-sm font-medium text-cozy-dim">Customers arrive on their own</p>
              <p className="text-xs text-cozy-dim/60">
                Your cooks make the food. Click a cook on the canvas (or in the Team panel) to coach them.
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <span className="text-2xl leading-none flex-shrink-0">📋</span>
            <div>
              <p className="text-sm font-medium text-cozy-dim">You run the shop</p>
              <p className="text-xs text-cozy-dim/60">
                Hire cooks, unlock recipes, set prices, keep the floor clean. The top bar has all of it.
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <span className="text-2xl leading-none flex-shrink-0">⭐</span>
            <div>
              <p className="text-sm font-medium text-cozy-dim">Reviews score you each night</p>
              <p className="text-xs text-cozy-dim/60">
                Customers rate taste, cleanliness, service, vibe & more. A good day → better reputation → more customers tomorrow.
              </p>
            </div>
          </div>
        </div>

        {/* One-day-equals tip */}
        <div className="bg-beach-sand/50 rounded-xl px-3 py-2 mb-5">
          <p className="text-xs text-cozy-dim/70 text-center">
            <span className="font-semibold">1 in-game day = 5 real minutes.</span>{' '}
            Reopen this card any time with the <span className="font-mono">?</span> in the top bar.
          </p>
        </div>

        <button
          onClick={handleDismiss}
          className="
            w-full py-2.5 rounded-xl text-sm font-medium
            bg-beach-ocean text-white
            hover:bg-beach-ocean/90 transition-colors
          "
        >
          Open the shop
        </button>
      </div>
    </div>
  );
}
