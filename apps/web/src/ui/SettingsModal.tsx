import { useState, useEffect } from 'react';
import { useStore, store } from '../state/store';
import { getApiKey, putApiKey, deleteApiKey } from '../api/endpoints';
import { useContext } from 'react';
import { AuthContext } from '../App';
import { isMuted, setMuted, playSfx } from '../audio/sfx';

/**
 * SettingsModal — Claude API key management.
 *
 * Rules (DECISIONS §8, architecture §5):
 *   - Owner pastes their own Anthropic key.
 *   - Server stores it encrypted at rest.
 *   - We show last-4 if a key is already stored — NEVER show full plaintext.
 *   - Show fallback reason from server response ("Last attempt: rate-limited").
 *   - Disclaimer: game works without a key (offline scorer).
 */

export default function SettingsModal() {
  const uiState = useStore();
  const { user, logout } = useContext(AuthContext);
  const open = uiState.openModal === 'settings';

  const [hasKey, setHasKey] = useState(false);
  const [lastFour, setLastFour] = useState<string | undefined>();
  // lastFallback from GetApiKeyResponse (architecture §3 #20)
  const [fallbackReason, setFallbackReason] = useState<string | null | undefined>();
  const [inputKey, setInputKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [muted, setMutedState] = useState<boolean>(isMuted());

  function handleMuteToggle() {
    const next = !muted;
    setMuted(next);
    setMutedState(next);
    if (!next) playSfx('pop');
  }

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setMessage(null);
    getApiKey()
      .then((res) => {
        if (res) {
          setHasKey(res.hasKey);
          setLastFour(res.lastFour);
          // GetApiKeyResponse.lastFallback (shared api.ts §20)
          setFallbackReason(res.lastFallback ?? undefined);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open]);

  async function handleSave() {
    const key = inputKey.trim();
    if (!key) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await putApiKey(key);
      if (res) {
        setHasKey(true);
        setLastFour(res.lastFour);
        setInputKey('');
        setMessage({ kind: 'ok', text: 'API key saved.' });
      }
    } catch (err) {
      setMessage({ kind: 'err', text: err instanceof Error ? err.message : 'Save failed.' });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    setMessage(null);
    try {
      await deleteApiKey();
      setHasKey(false);
      setLastFour(undefined);
      setFallbackReason(undefined);
      setMessage({ kind: 'ok', text: 'API key removed.' });
    } catch (err) {
      setMessage({ kind: 'err', text: err instanceof Error ? err.message : 'Delete failed.' });
    } finally {
      setDeleting(false);
    }
  }

  function fallbackReasonLabel(reason: string): string {
    const labels: Record<string, string> = {
      no_key: 'No key set',
      rate_limit: 'Rate-limited',
      invalid_key: 'Invalid key',
      timeout: 'Request timed out',
      parse_error: 'Response could not be parsed',
      network: 'Network error',
    };
    return labels[reason] ?? reason;
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-cozy-dim/30 backdrop-blur-sm"
      onClick={() => store.closeModal()}
    >
      <div
        className="
          bg-cozy-warm rounded-2xl shadow-xl border border-beach-sand/60
          p-6 w-96 max-w-[92vw]
        "
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-semibold text-cozy-dim text-base">Settings</h2>
          <button
            onClick={() => store.closeModal()}
            className="text-cozy-dim/40 hover:text-cozy-dim/70 p-1 rounded-lg"
            aria-label="Close"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Account info */}
        {user && (
          <div className="mb-5 p-3 rounded-xl bg-beach-sand/30 flex items-center justify-between">
            <span className="text-sm text-cozy-dim">{user.display_name}</span>
            <button
              onClick={() => { store.closeModal(); logout(); }}
              className="text-xs text-cozy-dim/50 hover:text-cozy-dim underline"
            >
              Log out
            </button>
          </div>
        )}

        {/* Sound toggle */}
        <div className="mb-5 p-3 rounded-xl bg-beach-sand/30 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl leading-none" aria-hidden="true">{muted ? '🔇' : '🔊'}</span>
            <div>
              <p className="text-sm font-medium text-cozy-dim">Sound</p>
              <p className="text-xs text-cozy-dim/50">
                {muted ? 'Muted — tap to turn on.' : 'On. Tap to mute.'}
              </p>
            </div>
          </div>
          <button
            onClick={handleMuteToggle}
            className={`
              min-w-[64px] min-h-[36px] rounded-xl text-sm font-medium
              transition-colors
              ${muted
                ? 'bg-cozy-dim/15 text-cozy-dim/60 hover:bg-cozy-dim/25'
                : 'bg-beach-ocean text-white hover:bg-beach-ocean/90'}
            `}
            aria-pressed={!muted}
          >
            {muted ? 'Muted' : 'On'}
          </button>
        </div>

        {/* Claude API key section */}
        <div className="space-y-3">
          <div>
            <h3 className="text-sm font-medium text-cozy-dim mb-1">Claude API Key</h3>
            <p className="text-xs text-cozy-dim/50 leading-relaxed">
              Optional. Without a key, you'll use the offline scorer — the game still works.
            </p>
          </div>

          {loading ? (
            <p className="text-xs text-cozy-dim/40 animate-pulse">Loading…</p>
          ) : (
            <>
              {/* Current key status */}
              {hasKey && lastFour && (
                <div className="flex items-center justify-between p-3 rounded-xl bg-green-50 border border-green-200">
                  <div>
                    <p className="text-xs font-medium text-green-800">Key saved</p>
                    <p className="text-xs text-green-600">···· {lastFour}</p>
                  </div>
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50 underline"
                  >
                    {deleting ? 'Removing…' : 'Remove'}
                  </button>
                </div>
              )}

              {/* Last fallback reason */}
              {fallbackReason && fallbackReason !== 'no_key' && (
                <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
                  Last attempt: {fallbackReasonLabel(fallbackReason)} — retrying next review.
                </p>
              )}

              {/* Key paste input */}
              <div>
                <label htmlFor="api-key" className="block text-xs text-cozy-dim/60 mb-1">
                  {hasKey ? 'Replace key:' : 'Paste your Anthropic API key:'}
                </label>
                <input
                  id="api-key"
                  type="password"
                  value={inputKey}
                  onChange={(e) => setInputKey(e.target.value)}
                  placeholder="sk-ant-…"
                  className="
                    w-full px-3 py-2 rounded-xl border border-beach-sand
                    bg-white/60 text-cozy-dim text-sm placeholder-cozy-dim/30
                    focus:border-beach-ocean focus:ring-1 focus:ring-beach-ocean
                    outline-none transition-colors
                  "
                  autoComplete="off"
                />
              </div>

              <button
                onClick={handleSave}
                disabled={saving || !inputKey.trim()}
                className="
                  w-full py-2 rounded-xl text-sm font-medium
                  bg-beach-ocean text-white
                  hover:bg-beach-ocean/90 disabled:opacity-40 disabled:cursor-not-allowed
                  transition-colors
                "
              >
                {saving ? 'Saving…' : 'Save Key'}
              </button>
            </>
          )}

          {message && (
            <p
              className={`text-xs text-center ${message.kind === 'ok' ? 'text-green-600' : 'text-red-600'}`}
            >
              {message.text}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
