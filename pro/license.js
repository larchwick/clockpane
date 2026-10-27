/**
 * Boundary between the free core and Pro. Adapted from Extension Pro src/pro/license.ts
 * (ea8127dca553cb73ca981b7f05909e148034051f).
 *
 * Rules:
 * 1. Free features never ask for the tier. They work the same with or without Pro.
 * 2. Only Pro-only features (more than 5 clocks, meeting planner, clock sets, export, badge)
 *    may check isPro().
 * 3. The tier comes from a license stored in this browser. The only network call is the
 *    Gumroad check the user starts after the consent screen, and PRIVACY.md states what it sends.
 */

/** Pro is switched off until a Gumroad product id exists and the module is wired in. */
export const PRO_ENABLED = false;

/** @typedef {'free' | 'pro'} Tier */

export const FreeLicense = Object.freeze({
  /** @returns {{ tier: Tier, label: string }} */
  current: () => ({ tier: 'free', label: 'Free edition' }),
  isPro: () => false,
});
