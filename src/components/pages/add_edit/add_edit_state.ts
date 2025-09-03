import { atom } from 'jotai';
import type { GesturePoint, Gesture, AnimationGesture } from '~/tools/stroke_data/types';
import type { script_list_type } from '~/state/lang_list';
import { type FontFamily, DEFAULT_FONT_SIZE } from '~/state/font_list';

// Default constants
const DEFAULT_GESTURE_BRUSH_WIDTH = 8;
const DEFAULT_GESTURE_BRUSH_COLOR = '#ff0000'; // red
const DEFAULT_GESTURE_ANIMATION_DURATION = 600;

// Core text and UI state
export const text_atom = atom('');
export const text_edit_mode_atom = atom(false);
export const script_atom = atom<script_list_type>('Devanagari');
export const font_family_atom = atom<FontFamily>('Nirmala_UI');
export const font_loaded_atom = atom<Map<FontFamily, boolean>>(new Map<FontFamily, boolean>());

// Gesture data and selection
export const gesture_data_atom = atom<Gesture[]>([]);
export const selected_gesture_index_atom = atom<string | null>(null);
export const current_drawing_points_atom = atom<number[]>([]);
export const not_to_clear_gestures_index_atom = atom<ReadonlySet<number>>(new Set<number>());

// Recording and playback state
export const is_recording_atom = atom(false);
export const is_playing_atom = atom(false);
export const temp_points_atom = atom<GesturePoint[]>([]);
export const is_drawing_atom = atom(false);

// Character rendering state
export const main_text_path_visible_atom = atom(true);
export const font_size_atom = atom(DEFAULT_FONT_SIZE as number);

// Animation state for Konva
export const animated_gesture_lines_atom = atom<AnimationGesture[]>([]);

// Export constants for use in components
export const DEFAULTS = {
  GESTURE_BRUSH_WIDTH: DEFAULT_GESTURE_BRUSH_WIDTH,
  GESTURE_BRUSH_COLOR: DEFAULT_GESTURE_BRUSH_COLOR,
  GESTURE_ANIMATION_DURATION: DEFAULT_GESTURE_ANIMATION_DURATION,
  FONT_SIZE: DEFAULT_FONT_SIZE
} as const;
