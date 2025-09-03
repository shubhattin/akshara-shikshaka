import { atom } from 'jotai';
import type { GesturePoint, AnimationGesture } from '~/tools/stroke_data/types';

// Practice workflow state
export const practice_mode_atom = atom<'none' | 'playing' | 'practicing'>('none');
export const current_gesture_index_atom = atom(0);
export const is_drawing_atom = atom(false);
export const completed_gestures_count_atom = atom(0);
export const show_all_gestures_done_atom = atom(false);
export const is_animating_current_gesture_atom = atom(false);
export const show_try_again_atom = atom(false);
export const last_accuracy_atom = atom(0);

// Responsive scaling
export const scaling_factor_atom = atom(1);

// Canvas state
export const mounted_atom = atom(false);

// Gesture data atoms
export const current_user_points_atom = atom<GesturePoint[]>([]);
export const animated_gesture_lines_atom = atom<
  (AnimationGesture & {
    isUserGesture?: boolean;
    isCurrentAnimatedGesture?: boolean;
  })[]
>([]);

// Drawing state
export const drawing_points_atom = atom<number[]>([]);
export const is_recording_stroke_atom = atom(false);
