/**
 * Tiny Zustand-inspired store for UI-only state.
 * No external dependencies. ~80 lines.
 *
 * Stores:
 *   - Which modal is open
 *   - Current coaching target (worker id)
 *   - Last-seen review id (for "new review" badge)
 *   - Current one-on-one target (worker id)
 */

type ModalName =
  | 'coaching'
  | 'settings'
  | 'reviews'
  | 'menu'
  | 'leaderboard'
  | 'day-summary'
  | 'one-on-one'
  | 'hire'
  | 'welcome'
  | 'stats'
  | 'inspect-customer'
  | null;

interface UIState {
  openModal: ModalName;
  coachingTargetId: number | null;
  oneOnOneTargetId: number | null;
  /** order_id of the customer currently being inspected (tap-popup) */
  inspectCustomerOrderId: number | null;
  lastSeenReviewId: number | null;
  daySummaryData: unknown | null;
}

type Listener = () => void;

function createStore() {
  let state: UIState = {
    openModal: null,
    coachingTargetId: null,
    oneOnOneTargetId: null,
    inspectCustomerOrderId: null,
    lastSeenReviewId: null,
    daySummaryData: null,
  };

  const listeners = new Set<Listener>();

  function getState(): UIState {
    return state;
  }

  function setState(partial: Partial<UIState> | ((prev: UIState) => Partial<UIState>)): void {
    const patch = typeof partial === 'function' ? partial(state) : partial;
    state = { ...state, ...patch };
    listeners.forEach((l) => l());
  }

  function subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  // ── Convenience actions ────────────────────────────────────────────────

  function openModal(modal: ModalName): void {
    setState({ openModal: modal });
  }

  function closeModal(): void {
    setState({ openModal: null, coachingTargetId: null, oneOnOneTargetId: null });
  }

  function openCoaching(workerId: number): void {
    setState({ openModal: 'coaching', coachingTargetId: workerId });
  }

  function openOneOnOne(workerId: number): void {
    setState({ openModal: 'one-on-one', oneOnOneTargetId: workerId });
  }

  function markReviewSeen(reviewId: number): void {
    setState({ lastSeenReviewId: reviewId });
  }

  function setDaySummary(data: unknown): void {
    setState({ daySummaryData: data, openModal: 'day-summary' });
  }

  return {
    getState,
    setState,
    subscribe,
    openModal,
    closeModal,
    openCoaching,
    openOneOnOne,
    markReviewSeen,
    setDaySummary,
  };
}

export const store = createStore();

// ── React binding helper ────────────────────────────────────────────────────
// Import and call this in components to subscribe to store changes.

import { useSyncExternalStore } from 'react';

export function useStore(): UIState {
  return useSyncExternalStore(store.subscribe, store.getState);
}
