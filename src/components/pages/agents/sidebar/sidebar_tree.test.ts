import { describe, expect, it } from 'vitest';
import {
  buildSidebarTree,
  matchesStatus,
  statusCounts,
  type SidebarCategory,
  type SidebarGesture
} from './sidebar_tree';

const g = (over: Partial<SidebarGesture> & { id: number }): SidebarGesture => ({
  text: `g${over.id}`,
  text_key: `k${over.id}`,
  script_id: 1,
  review_status: 'unreviewed',
  revision: 1,
  updated_at: '2026-10-01T00:00:00Z',
  strokes: 3,
  category_id: null,
  lesson_order: null,
  chats: 1,
  latest_activity: '2026-10-01T00:00:00Z',
  streaming: false,
  batches: [],
  ...over
});

const categories: SidebarCategory[] = [
  { id: 10, name: 'Svara', order: 1 },
  { id: 20, name: 'Vyanjana', order: 2 }
];
const name = (id: number) => `S${id}`;
const ids = (entries: { gesture: { id: number } }[]) => entries.map((e) => e.gesture.id);

const batch = (batch_id: number, status: SidebarGesture['batches'][number]['status']) => ({
  batch_id,
  status,
  chat_id: null,
  batch_title: '',
  batch_created_at: '2026-10-01T00:00:00Z'
});

describe('buildSidebarTree', () => {
  const gestures = [
    g({ id: 1, category_id: 20, lesson_order: 2 }),
    g({ id: 2, category_id: 10, lesson_order: 5 }),
    g({ id: 3, category_id: 10, lesson_order: 1 }),
    g({ id: 4 }),
    g({ id: 5, script_id: 2, category_id: 10, lesson_order: 1 })
  ];

  it('groups one script by category in lesson order, uncategorized last', () => {
    const tree = buildSidebarTree(
      gestures,
      categories,
      { mode: 'category', script: 1, statuses: [] },
      name
    );
    expect(tree.map((t) => t.label)).toEqual(['Svara', 'Vyanjana', 'Uncategorized']);
    expect(ids(tree[0]!.entries)).toEqual([3, 2]);
  });

  it('nests script → category when every script is shown', () => {
    const tree = buildSidebarTree(
      gestures,
      categories,
      { mode: 'category', script: 'all', statuses: [] },
      name
    );
    expect(tree.map((t) => t.label)).toEqual(['S1', 'S2']);
    expect(tree[1]!.children!.map((c) => c.label)).toEqual(['Svara']);
    expect(tree[0]!.entries).toHaveLength(4);
  });

  it('groups by batch, newest first, with the item status and a loose group', () => {
    const tree = buildSidebarTree(
      [
        g({ id: 1, batches: [batch(2, 'proposed'), batch(1, 'applied')] }),
        g({ id: 2, batches: [batch(1, 'failed')] }),
        g({ id: 3 })
      ],
      categories,
      { mode: 'batch', script: 'all', statuses: [] },
      name
    );
    expect(tree.map((t) => t.key)).toEqual(['batch:2', 'batch:1', 'batch:none']);
    expect(tree[0]!.toReview).toBe(1);
    expect(tree[1]!.entries.map((e) => e.batchStatus)).toEqual(['applied', 'failed']);
    // gesture 1 waits for review in batch 2 only
    expect(tree[1]!.toReview).toBe(0);
  });

  it('lists a gesture under "To review" only in the batch whose proposal waits', () => {
    const gestures = [
      g({ id: 1, batches: [batch(2, 'proposed'), batch(1, 'applied')] }),
      g({ id: 2, review_status: 'approved', batches: [batch(1, 'superseded')] })
    ];
    const toReview = buildSidebarTree(
      gestures,
      categories,
      { mode: 'batch', script: 'all', statuses: ['to_review'] },
      name
    );
    expect(toReview.map((t) => [t.key, ids(t.entries)])).toEqual([['batch:2', [1]]]);
    const either = buildSidebarTree(
      gestures,
      categories,
      { mode: 'batch', script: 'all', statuses: ['to_review', 'approved'] },
      name
    );
    expect(either.map((t) => [t.key, ids(t.entries)])).toEqual([
      ['batch:2', [1]],
      ['batch:1', [2]]
    ]);
  });

  it('orders recent by activity and filters by status and search', () => {
    const tree = buildSidebarTree(
      [
        g({ id: 1, latest_activity: '2026-10-02T00:00:00Z' }),
        g({ id: 2, latest_activity: '2026-10-03T00:00:00Z' }),
        g({ id: 3, review_status: 'approved' })
      ],
      categories,
      { mode: 'recent', script: 'all', statuses: ['unreviewed'] },
      name
    );
    expect(ids(tree[0]!.entries)).toEqual([2, 1]);
    const searched = buildSidebarTree(
      [g({ id: 1, text: 'अ' }), g({ id: 2, text: 'क' })],
      categories,
      { mode: 'recent', script: 'all', statuses: [], needle: 'क' },
      name
    );
    expect(ids(searched[0]!.entries)).toEqual([2]);
  });
});

describe('status chips', () => {
  it('count review states only for gestures with strokes', () => {
    expect(matchesStatus(g({ id: 1, strokes: 0 }), 'unreviewed')).toBe(false);
    expect(matchesStatus(g({ id: 1, strokes: 0 }), 'empty')).toBe(true);
    expect(matchesStatus(g({ id: 1, batches: [batch(1, 'proposed')] }), 'to_review')).toBe(true);
    expect(
      statusCounts([g({ id: 1 }), g({ id: 2, script_id: 2, review_status: 'approved' })], 1)
    ).toEqual({ to_review: 0, unreviewed: 1, needs_work: 0, approved: 0, empty: 0 });
  });
});
