import { atom } from 'jotai';
import type { GesturePoint, Gesture } from '~/tools/stroke_data/types';

// Default constants
const DEFAULT_GESTURE_BRUSH_WIDTH = 8;
const DEFAULT_GESTURE_BRUSH_COLOR = '#ff0000'; // red
const DEFAULT_GESTURE_ANIMATION_DURATION = 600;
const DEFAULT_SCALE_DOWN_FACTOR = 4.5;

// Core text and UI state
export const text_atom = atom('');
export const text_edit_mode_atom = atom(false);
export const scale_down_factor_atom = atom(DEFAULT_SCALE_DOWN_FACTOR);

// Gesture data and selection
export const gesture_data_atom = atom<Gesture[]>([]);
export const selected_gesture_order_atom = atom<string | null>(null);
export const current_drawing_points_atom = atom<number[]>([]);
export const not_to_clear_gestures_order_atom = atom<ReadonlySet<number>>(new Set<number>());

// Recording and playback state
export const is_recording_atom = atom(false);
export const is_playing_atom = atom(false);
export const temp_points_atom = atom<GesturePoint[]>([]);
export const is_drawing_atom = atom(false);

// Character rendering state
export const character_svg_path_atom = atom<string>('');
export const main_text_path_visible_atom = atom(true);

// Animation state for Konva
export const animated_gesture_lines_atom = atom<
  Array<{
    order: number;
    points: number[];
    color: string;
    width: number;
  }>
>([]);

// Export constants for use in components
export const DEFAULTS = {
  GESTURE_BRUSH_WIDTH: DEFAULT_GESTURE_BRUSH_WIDTH,
  GESTURE_BRUSH_COLOR: DEFAULT_GESTURE_BRUSH_COLOR,
  GESTURE_ANIMATION_DURATION: DEFAULT_GESTURE_ANIMATION_DURATION,
  SCALE_DOWN_FACTOR: DEFAULT_SCALE_DOWN_FACTOR
} as const;
