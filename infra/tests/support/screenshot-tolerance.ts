/**
 * How far a screenshot may stray from its baseline and still match. A pixel
 * counts as different when its colour moves further than `threshold`, on
 * Playwright's scale from 0 to 1, and a screenshot matches while at most
 * `maxDiffPixelRatio` of its pixels differ. The released blocks check holds
 * re-shot baselines to the same tolerance.
 */
export const screenshotTolerance = { threshold: 0.2, maxDiffPixelRatio: 0.01 } as const;
