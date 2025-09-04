import { atom } from 'jotai';
import type { GesturePoint, Gesture, AnimationGesture } from '~/tools/stroke_data/types';
import type { script_list_type } from '~/state/lang_list';
import { type FontFamily, DEFAULT_FONT_SIZE } from '~/state/font_list';

// core text related states
export const text_atom = atom('');
export const text_edit_mode_atom = atom(false);
export const script_atom = atom<script_list_type>('Devanagari');
export const font_family_atom = atom<FontFamily>('Nirmala_UI');
export const font_loaded_atom = atom<ReadonlyMap<FontFamily, boolean>>(
  new Map<FontFamily, boolean>()
);
export const main_text_path_visible_atom = atom(true);
export const font_size_atom = atom(DEFAULT_FONT_SIZE as number);

// Recording and playback state
export const is_recording_atom = atom(false);
export const is_playing_atom = atom(false);
export const is_drawing_atom = atom(false);

// Gesture data and selection
export const gesture_data_atom = atom<Gesture[]>([]);
export const selected_gesture_index_atom = atom<number | null>(null);
/** Set of gestures that are not to be cleared */
export const not_to_clear_gestures_index_atom = atom<ReadonlySet<number>>(new Set<number>());

/** Stores point when the user is currently drawing (mouse down state), does not needs to store gesture attributes */
export const current_gesture_recording_points_atom = atom<Gesture['points']>([]);
/**
 * Used for displaying the animated/ing gestures or the ones that are marked to stay on screen, use for `Play` buttons
 * Stores the attributes of all the different gestures to be used
 */
export const canvas_gestures_flat_atom = atom<AnimationGesture[]>([]);

/** offset from the base(Centre) text coordinates, this will be used to restore the position of the text */
export const canvas_text_center_offset_atoms = atom<[number, number]>([0, 0]);

// Export constants for use in components
export const DEFAULTS = {
  GESTURE_BRUSH_WIDTH: 8,
  GESTURE_BRUSH_COLOR: '#ff0000',
  GESTURE_ANIMATION_DURATION: 600,
  FONT_SIZE: DEFAULT_FONT_SIZE
} as const;

export const RANGES = {
  brush_width: {
    min: 5,
    max: 15,
    step: 1
  },
  animation_duration: {
    min: 100,
    max: 1500,
    step: 50
  }
} as const;
