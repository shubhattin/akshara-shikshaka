import { atom } from 'jotai';

/**
 * What the learn page is showing, for the admin links in the app bar menu (Edit lesson, its
 * gesture, its category). Lives in the default jotai store: the learn page keeps its own state
 * in a scoped store the app bar cannot read. `null` when the learn page is not open.
 */
export type LearnAdminContext = {
  lesson: { id: number; text: string } | null;
  gesture_id: number | null;
  category: { id: number; name: string } | null;
};

export const learn_admin_context_atom = atom<LearnAdminContext | null>(null);
