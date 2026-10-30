import { Effect } from 'effect';
import type { FocusContext } from '~/agents/focus';
import { get_script_from_id } from '~/state/lang_list';
import { getGestureForAgent } from './gestures';
import { listSiblingGestures } from './gesture_review';

/** A focused chat's gesture, its notes and its sibling scripts, as the agent reads them. */
export const loadFocusContext = Effect.fn('agents.load_focus_context')(function* (
  gestureId: number
) {
  const gesture = yield* getGestureForAgent(gestureId);
  const siblings = yield* listSiblingGestures(gesture);
  const context: FocusContext = {
    gesture,
    script: get_script_from_id(gesture.script_id) ?? String(gesture.script_id),
    siblings: siblings.map((s) => ({
      ...s,
      script: get_script_from_id(s.script_id) ?? String(s.script_id)
    }))
  };
  return context;
});
