import { atom } from 'jotai';
import type { AnimationGesture, GesturePath } from '~/tools/stroke_data/types';

// Practice workflow state
export const canvas_current_mode = atom<'none' | 'playing' | 'practicing'>('none');
export const is_drawing_atom = atom(false);
export const completed_gestures_count_atom = atom(0);

export const show_try_again_atom = atom(false);
export const last_accuracy_atom = atom(0);

export const current_gesture_index_atom = atom(0);
export const is_animating_current_gesture_atom = atom(false);

// Responsive scaling
export const scaling_factor_atom = atom(1);

// Gesture data atoms
export const animated_gesture_lines_atom = atom<
  (AnimationGesture & {
    gesture_type: 'current_animated_gesture' | null;
  })[]
>([]);

// Drawing state
/** Current user drawn gesture on the canvas */
export const current_gesture_points_atom = atom<GesturePath[]>([]);
export const is_recording_stroke_atom = atom(false);

// others constants
export const USER_GESTURE_COLOR = '#000000'; // black
export const TRY_AGAIN_WAIT_DURATION = 5000;
