import { describe, expect, it } from 'vitest';
import { badgeText, badgeTitle, msToNextMinute } from '../extension/lib/badge.js';

describe('badge', () => {
  const at = new Date('2026-10-27T12:05:30Z');
  it('fits the time in four or five characters', () => {
    expect(badgeText(at, 'Asia/Tokyo', false)).toBe('21:05');
    expect(badgeText(at, 'Asia/Tokyo', true)).toBe('9:05');
    expect(badgeText(new Date('2026-10-27T00:00:00Z'), 'UTC', true)).toBe('12:00');
  });
  it('puts the label and day in the tooltip', () => {
    const t = badgeTitle(at, { zone: 'Asia/Tokyo', label: 'Office' }, false);
    expect(t.startsWith('Clockpane: Office 21:05')).toBe(true);
    expect(badgeTitle(at, { zone: 'Asia/Tokyo', label: '' }, false)).toContain('Tokyo');
  });
  it('waits until the next whole minute', () => {
    expect(msToNextMinute(at)).toBe(30000);
  });
});
