// Workers routes: list, candidates, hire, assign, coach (preset), one-on-one.

import { Router } from 'express';
import crypto from 'node:crypto';
import { db } from '../db/connection.js';
import { requireAuth } from '../auth/middleware.js';
import { HttpError } from '../app.js';
import { coachReply } from '../ai/coachReply.js';
import type {
  Worker,
  HireCandidate,
  Station,
  CoachingSession,
  PresetKey,
  WorkersResponse,
  HireCandidatesResponse,
  HireBody,
  HireResponse,
  AssignBody,
  AssignResponse,
  CoachPresetBody,
  CoachPresetResponse,
  OneOnOneBody,
  OneOnOneResponse,
} from '@kitchen-rush/shared';
import { xpToLevel } from '@kitchen-rush/shared';

const router = Router();

// ─── In-memory candidate cache (keyed by candidate_id) ─────────────────────
const candidateCache = new Map<string, HireCandidate>();

// ─── In-memory coaching cooldown tracker ────────────────────────────────────
// Map key: `${workerId}:${presetKey}` → timestamp when available again
const coachCooldowns = new Map<string, number>();

// Per-preset cooldown in milliseconds (design §4.3)
const COOLDOWNS_MS: Record<PresetKey, number> = {
  praise: 8_000,
  take_time: 8_000,
  try_again: 12_000,
  watch_heat: 12_000,
  check_ticket: 12_000,
  cleanup_when_can: 15_000,
};

// XP and mood deltas per preset (design §4.3)
const PRESET_DELTAS: Record<PresetKey, { xp: number; mood: number }> = {
  praise: { xp: 0, mood: 8 },
  take_time: { xp: 0, mood: 5 },
  try_again: { xp: 2, mood: -2 },
  watch_heat: { xp: 3, mood: -1 },
  check_ticket: { xp: 2, mood: 0 },
  cleanup_when_can: { xp: 1, mood: -1 },
};

// ─── Name pool for candidates ────────────────────────────────────────────────
const CANDIDATE_NAMES = [
  'Sam', 'Jordan', 'Riley', 'Taylor', 'Morgan', 'Casey', 'Avery', 'Quinn',
  'Harper', 'Blake', 'Cameron', 'Reese', 'Skyler', 'Drew', 'Sage', 'Logan',
  'Kendall', 'Finley', 'Rowan', 'Hayden', 'Parker', 'Emery', 'Remy', 'Shea',
  'Oakley', 'Wynne', 'Ellis', 'Pax', 'Marlowe', 'Soren',
];

const CANDIDATE_PORTRAITS = [
  'worker_chef_blond_idle',
  'worker_chef_brown_idle',
  'worker_chef_redhead_idle',
  'worker_chef_short_idle',
];

// ─── Prepared statements ──────────────────────────────────────────────────────

const selectWorkers = db.prepare<[number], Worker>(`
  SELECT id, restaurant_id, name, portrait_id, xp, mood, station,
         wage_per_day, hired_on_day, hire_date, coaching_count, is_active
  FROM workers WHERE restaurant_id = ? AND is_active = 1
`);

const selectWorkerById = db.prepare<[number, number], Worker>(`
  SELECT id, restaurant_id, name, portrait_id, xp, mood, station,
         wage_per_day, hired_on_day, hire_date, coaching_count, is_active
  FROM workers WHERE id = ? AND restaurant_id = ?
`);

const insertWorker = db.prepare(`
  INSERT INTO workers (restaurant_id, name, portrait_id, mood, station, hired_on_day)
  VALUES (?, ?, ?, ?, ?, ?)
`);

const updateWorkerStation = db.prepare(`
  UPDATE workers SET station = ? WHERE id = ? AND restaurant_id = ?
`);

const selectRestaurant = db.prepare<[number], { cash: number; day_number: number }>(`
  SELECT cash, day_number FROM restaurants WHERE id = ?
`);

const updateCash = db.prepare(`
  UPDATE restaurants SET cash = MAX(0, cash - ?), updated_at = datetime('now') WHERE id = ?
`);

const updateWorkerStats = db.prepare(`
  UPDATE workers
  SET xp = MAX(0, xp + ?),
      mood = MAX(0, MIN(100, mood + ?)),
      coaching_count = coaching_count + 1
  WHERE id = ?
`);

const insertCoachingSession = db.prepare(`
  INSERT INTO coaching_sessions
    (restaurant_id, worker_id, day_number, kind, preset_key, owner_message, worker_response, xp_delta, mood_delta, claude_used)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

// ─── GET /api/workers ─────────────────────────────────────────────────────────

router.get('/', requireAuth, (req, res) => {
  const restId = req.restaurantId;
  if (!restId) throw new HttpError(404, 'no_restaurant', 'No restaurant found.');
  const workers = selectWorkers.all(restId);
  const response: WorkersResponse = { workers };
  res.json(response);
});

// ─── GET /api/workers/candidates ─────────────────────────────────────────────

router.get('/candidates', requireAuth, (req, res) => {
  const restId = req.restaurantId;
  if (!restId) throw new HttpError(404, 'no_restaurant', 'No restaurant found.');

  const workers = selectWorkers.all(restId);
  const workerCount = workers.length;

  // Determine least-staffed station for suggested_station
  const stationCounts: Record<string, number> = {};
  for (const w of workers) {
    stationCounts[w.station] = (stationCounts[w.station] ?? 0) + 1;
  }
  const allStations: Station[] = ['grill', 'fryer', 'drink', 'dessert', 'assembly'];
  let leastStaffed: Station = 'grill';
  let minCount = Infinity;
  for (const s of allStations) {
    const cnt = stationCounts[s] ?? 0;
    if (cnt < minCount) { minCount = cnt; leastStaffed = s; }
  }

  // Cost from design §4.5: hire #2=$100, #3=$150, #4=$250
  const hireCosts = [0, 100, 150, 250];
  const cost = hireCosts[Math.min(workerCount, 3)] ?? 250;

  // Clear stale candidates for this restaurant (simple: clear all and regenerate)
  for (const [key] of candidateCache) {
    if (key.startsWith(`rest${restId}-`)) candidateCache.delete(key);
  }

  const candidates: HireCandidate[] = [];
  for (let i = 0; i < 3; i++) {
    const candidateId = `rest${restId}-${crypto.randomBytes(8).toString('hex')}`;
    const name = CANDIDATE_NAMES[Math.floor(Math.random() * CANDIDATE_NAMES.length)] ?? 'Alex';
    const portrait = CANDIDATE_PORTRAITS[Math.floor(Math.random() * CANDIDATE_PORTRAITS.length)] ?? 'worker_chef_blond_idle';
    const mood_baseline = Math.floor(Math.random() * 16) + 60; // 60–75
    const candidate: HireCandidate = {
      candidate_id: candidateId,
      name,
      portrait_id: portrait,
      mood_baseline,
      suggested_station: leastStaffed,
      cost,
    };
    candidates.push(candidate);
    candidateCache.set(candidateId, candidate);
  }

  const response: HireCandidatesResponse = { candidates };
  res.json(response);
});

// ─── POST /api/workers/hire ────────────────────────────────────────────────────

router.post('/hire', requireAuth, (req, res) => {
  const restId = req.restaurantId;
  if (!restId) throw new HttpError(404, 'no_restaurant', 'No restaurant found.');

  const { candidate_id, station } = req.body as HireBody;
  if (!candidate_id) throw new HttpError(400, 'invalid_input', 'candidate_id is required.');
  if (!station) throw new HttpError(400, 'invalid_input', 'station is required.');

  const candidate = candidateCache.get(candidate_id);
  if (!candidate) {
    throw new HttpError(404, 'candidate_not_found', 'Candidate not found or already hired.');
  }

  const rest = selectRestaurant.get(restId);
  if (!rest) throw new HttpError(404, 'no_restaurant', 'No restaurant found.');

  const workers = selectWorkers.all(restId);
  if (workers.length >= 4) {
    throw new HttpError(400, 'hire_cap_reached', 'Maximum of 4 workers per restaurant in MVP.');
  }

  if (rest.cash < candidate.cost) {
    throw new HttpError(400, 'cannot_afford', `Earn $${candidate.cost - rest.cash} more to hire.`);
  }

  const hireWorker = db.transaction(() => {
    updateCash.run(candidate.cost, restId);
    const result = insertWorker.run(
      restId,
      candidate.name,
      candidate.portrait_id,
      candidate.mood_baseline,
      station,
      rest.day_number
    );
    candidateCache.delete(candidate_id);
    return result.lastInsertRowid as number;
  });

  const workerId = hireWorker();
  const updated = selectRestaurant.get(restId)!;
  const worker = selectWorkerById.get(workerId, restId)!;

  const response: HireResponse = { worker, cash: updated.cash };
  res.status(201).json(response);
});

// ─── POST /api/workers/:id/assign ─────────────────────────────────────────────

router.post('/:id/assign', requireAuth, (req, res) => {
  const restId = req.restaurantId;
  if (!restId) throw new HttpError(404, 'no_restaurant', 'No restaurant found.');

  const workerId = parseInt(req.params['id'] ?? '', 10);
  if (isNaN(workerId)) throw new HttpError(400, 'invalid_input', 'Invalid worker id.');

  const { station } = req.body as AssignBody;
  if (!station) throw new HttpError(400, 'invalid_input', 'station is required.');

  const worker = selectWorkerById.get(workerId, restId);
  if (!worker) throw new HttpError(404, 'worker_not_found', 'Worker not found.');

  updateWorkerStation.run(station, workerId, restId);
  const updated = selectWorkerById.get(workerId, restId)!;

  const response: AssignResponse = { worker: updated };
  res.json(response);
});

// ─── POST /api/workers/:id/coach (preset — ZERO Claude calls) ─────────────────

router.post('/:id/coach', requireAuth, (req, res) => {
  const restId = req.restaurantId;
  if (!restId) throw new HttpError(404, 'no_restaurant', 'No restaurant found.');

  const workerId = parseInt(req.params['id'] ?? '', 10);
  if (isNaN(workerId)) throw new HttpError(400, 'invalid_input', 'Invalid worker id.');

  const { presetKey } = req.body as CoachPresetBody;
  const validKeys: PresetKey[] = ['praise', 'take_time', 'try_again', 'watch_heat', 'check_ticket', 'cleanup_when_can'];
  if (!presetKey || !validKeys.includes(presetKey)) {
    throw new HttpError(400, 'invalid_input', `presetKey must be one of: ${validKeys.join(', ')}`);
  }

  const worker = selectWorkerById.get(workerId, restId);
  if (!worker) throw new HttpError(404, 'worker_not_found', 'Worker not found.');

  // Enforce cooldown
  const cooldownKey = `${workerId}:${presetKey}`;
  const cooldownUntil = coachCooldowns.get(cooldownKey) ?? 0;
  if (Date.now() < cooldownUntil) {
    throw new HttpError(429, 'on_cooldown', `That phrase is on cooldown. Let it land first.`);
  }

  const rest = selectRestaurant.get(restId)!;
  const { xp, mood } = PRESET_DELTAS[presetKey];

  const sessionId = db.transaction(() => {
    updateWorkerStats.run(xp, mood, workerId);
    const r = insertCoachingSession.run(
      restId, workerId, rest.day_number,
      'preset', presetKey, null, null,
      xp, mood, 0
    );
    return r.lastInsertRowid as number;
  })();
  coachCooldowns.set(cooldownKey, Date.now() + COOLDOWNS_MS[presetKey]);

  const updatedWorker = selectWorkerById.get(workerId, restId)!;

  const session: CoachingSession = {
    id: sessionId as number,
    restaurant_id: restId,
    worker_id: workerId,
    day_number: rest.day_number,
    kind: 'preset',
    preset_key: presetKey,
    owner_message: null,
    worker_response: null,
    xp_delta: xp,
    mood_delta: mood,
    claude_used: 0,
    created_at: new Date().toISOString(),
  };

  const response: CoachPresetResponse = { session, worker: updatedWorker };
  res.json(response);
});

// ─── POST /api/workers/:id/one-on-one ─────────────────────────────────────────

router.post('/:id/one-on-one', requireAuth, (req, res) => {
  const restId = req.restaurantId;
  if (!restId) throw new HttpError(404, 'no_restaurant', 'No restaurant found.');

  const workerId = parseInt(req.params['id'] ?? '', 10);
  if (isNaN(workerId)) throw new HttpError(400, 'invalid_input', 'Invalid worker id.');

  const { choice } = req.body as OneOnOneBody;
  if (choice !== 1 && choice !== 2 && choice !== 3) {
    throw new HttpError(400, 'invalid_input', 'choice must be 1, 2, or 3.');
  }

  const worker = selectWorkerById.get(workerId, restId);
  if (!worker) throw new HttpError(404, 'worker_not_found', 'Worker not found.');

  const rest = selectRestaurant.get(restId)!;
  const userId = req.user!.id;

  // Deltas per design §4.4
  const oneOnOneDeltas = {
    1: { mood: 20, xp: 10 },
    2: { mood: 10, xp: 20 },
    3: { mood: 25, xp: 0 },
  };
  const { mood, xp } = oneOnOneDeltas[choice];

  const ownerMessages = {
    1: 'Tell me what happened today.',
    2: "Let's go through it together.",
    3: "You're doing better than you think.",
  };

  const level = xpToLevel(worker.xp);

  // Call AI stub — will use real Claude in Wave 2.
  coachReply(userId, { worker: { ...worker, level }, choice }).then(reply => {
    const sessionId = db.transaction(() => {
      updateWorkerStats.run(xp, mood, workerId);
      const r = insertCoachingSession.run(
        restId, workerId, rest.day_number,
        'one_on_one', null,
        ownerMessages[choice],
        reply.workerResponse,
        xp, mood,
        reply.claudeUsed ? 1 : 0
      );
      return r.lastInsertRowid as number;
    })();

    const updatedWorker = selectWorkerById.get(workerId, restId)!;

    const session: CoachingSession = {
      id: sessionId,
      restaurant_id: restId,
      worker_id: workerId,
      day_number: rest.day_number,
      kind: 'one_on_one',
      preset_key: null,
      owner_message: ownerMessages[choice],
      worker_response: reply.workerResponse,
      xp_delta: xp,
      mood_delta: mood,
      claude_used: reply.claudeUsed ? 1 : 0,
      created_at: new Date().toISOString(),
    };

    const response: OneOnOneResponse = { session, worker: updatedWorker };
    res.json(response);
  }).catch((err: unknown) => {
    res.status(500).json({ error: { code: 'coach_error', message: String(err) } });
  });
});

export default router;
