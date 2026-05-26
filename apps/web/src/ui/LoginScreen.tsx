import React, { useState } from 'react';
import { ApiError } from '../api/client';

interface LoginScreenProps {
  onLogin: (username: string) => Promise<void>;
  onRegister: (username: string, displayName?: string) => Promise<void>;
  error: string | null;
}

export default function LoginScreen({ onLogin, onRegister, error }: LoginScreenProps) {
  const [username, setUsername] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const name = username.trim();
    if (!name) return;

    setLocalError(null);
    setSubmitting(true);

    try {
      // Try login first; if 404 (user not found), register instead.
      try {
        await onLogin(name);
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
          // Username doesn't exist yet → register
          await onRegister(name);
        } else {
          throw err;
        }
      }
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  }

  const displayError = localError ?? error;

  return (
    <div className="min-h-screen bg-cozy-warm flex flex-col items-center justify-center px-4">
      {/* Beachfront title art (text-only) */}
      <div className="mb-8 text-center select-none">
        <div className="text-6xl mb-2" aria-hidden="true">🏖️</div>
        <h1 className="text-4xl font-bold text-cozy-dim tracking-tight">
          Kitchen Rush
        </h1>
        <p className="mt-3 text-beach-ocean text-base max-w-xs leading-relaxed">
          Running your beachfront shop on your own time.
          <br />
          Cozy, calm, no rush.
        </p>
      </div>

      {/* Login card */}
      <div className="bg-white/70 backdrop-blur rounded-2xl shadow-sm border border-beach-sand/60 p-8 w-full max-w-sm">
        <p className="text-sm text-cozy-dim/60 mb-5 text-center">
          Enter a username to continue. <br />
          New here? We'll set you up automatically.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label htmlFor="username" className="block text-sm font-medium text-cozy-dim mb-1">
              Username
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. beachcook42"
              autoComplete="username"
              autoFocus
              maxLength={30}
              className="
                w-full px-4 py-2.5 rounded-xl border border-beach-sand
                bg-cozy-warm text-cozy-dim placeholder-cozy-dim/30
                focus:border-beach-ocean focus:ring-1 focus:ring-beach-ocean
                outline-none transition-colors text-sm
              "
              disabled={submitting}
            />
          </div>

          {displayError && (
            <p role="alert" className="text-red-600 text-sm text-center">
              {displayError}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting || !username.trim()}
            className="
              w-full py-2.5 rounded-xl font-semibold text-sm
              bg-beach-ocean text-white
              hover:bg-beach-ocean/90 active:bg-beach-ocean/80
              disabled:opacity-40 disabled:cursor-not-allowed
              transition-colors
            "
          >
            {submitting ? 'Just a moment…' : 'Continue'}
          </button>
        </form>
      </div>

      <p className="mt-6 text-xs text-cozy-dim/30 text-center max-w-xs">
        {/* SECURITY: username-only auth — see DECISIONS.md §7 */}
        No password needed. Your username is your key.
      </p>
    </div>
  );
}
