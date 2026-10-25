import { describe, expect, it } from 'vitest';
import { LANG_LIST, LANG_LIST_IDS, SCRIPT_LIST, SCRIPT_LIST_IDS } from '~/state/lang_list';
import { buildLanguagesContext } from './languages';

describe('buildLanguagesContext', () => {
  it('lists every language and script id', () => {
    const text = buildLanguagesContext();
    const langRows = LANG_LIST.map((name, index) => `| ${LANG_LIST_IDS[index]} | ${name} |`);
    const scriptRows = SCRIPT_LIST.map((name, index) => `| ${SCRIPT_LIST_IDS[index]} | ${name} |`);
    expect([...langRows, ...scriptRows].filter((row) => !text.includes(row))).toEqual([]);
    expect(text).toContain('| 3 | Hindi | Devanagari (1) |');
  });
});
