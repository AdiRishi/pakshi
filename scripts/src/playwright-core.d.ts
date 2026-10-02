// Playwright publishes no types for the comparator toHaveScreenshot uses.
declare module "playwright-core/lib/coreBundle" {
  const coreBundle: {
    readonly utils: {
      readonly getComparator: (
        mimeType: "image/png",
      ) => (
        actual: Buffer,
        expected: Buffer,
        options: { readonly threshold: number; readonly maxDiffPixelRatio: number },
      ) => { readonly errorMessage: string } | null;
    };
  };
  export default coreBundle;
}
