export type RestTimerState = { remaining: number; running: boolean; endsAt: number | null };
export type RestTimerAction =
  | { type: 'start'; seconds: number; now?: number }
  | { type: 'sync'; now?: number }
  | { type: 'adjust'; seconds: number; now?: number }
  | { type: 'cancel' };

export const INITIAL_REST_TIMER: RestTimerState = { remaining: 0, running: false, endsAt: null };

export function isRestTimerActive(state: RestTimerState): boolean {
  return state.running && state.remaining > 0;
}

export function restTimerReducer(state: RestTimerState, action: RestTimerAction): RestTimerState {
  if (action.type === 'cancel') return INITIAL_REST_TIMER;
  const now = action.now ?? Date.now();
  if (action.type === 'start') {
    const seconds = Math.max(0, action.seconds);
    return seconds === 0 ? INITIAL_REST_TIMER : {
      remaining: seconds, running: true, endsAt: now + seconds * 1000,
    };
  }
  if (!state.running || state.endsAt === null) return INITIAL_REST_TIMER;
  if (action.type === 'adjust') {
    const current = Math.max(0, Math.ceil((state.endsAt - now) / 1000));
    const seconds = Math.max(0, current + action.seconds);
    return seconds === 0 ? INITIAL_REST_TIMER : {
      remaining: seconds, running: true, endsAt: now + seconds * 1000,
    };
  }
  const remaining = Math.max(0, Math.ceil((state.endsAt - now) / 1000));
  return remaining === 0 ? INITIAL_REST_TIMER : { ...state, remaining };
}
