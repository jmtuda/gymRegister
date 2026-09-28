export type RestTimerState = { remaining: number; running: boolean };
export type RestTimerAction =
  | { type: 'start'; seconds: number }
  | { type: 'tick' }
  | { type: 'pause' }
  | { type: 'cancel' };

export const INITIAL_REST_TIMER: RestTimerState = { remaining: 0, running: false };

export function restTimerReducer(state: RestTimerState, action: RestTimerAction): RestTimerState {
  if (action.type === 'start') return { remaining: action.seconds, running: true };
  if (action.type === 'pause') return { ...state, running: false };
  if (action.type === 'cancel') return INITIAL_REST_TIMER;
  if (!state.running || state.remaining <= 1) return INITIAL_REST_TIMER;
  return { remaining: state.remaining - 1, running: true };
}
