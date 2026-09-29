/**
 * Node.js compatibility is on by default from 2026-08-04, so no flag is set.
 * Alchemy's local runtime pins workerd, which caps the date `pnpm dev` accepts.
 */
export const workerCompatibility = { date: "2026-09-01" };

export const workerObservability = {
  enabled: true,
  logs: { enabled: true, invocationLogs: true, headSamplingRate: 1 },
  traces: { enabled: true, headSamplingRate: 0.01 },
} as const;

export const bucketLifecycleRules = [
  {
    id: "abort-incomplete-uploads",
    enabled: true,
    prefix: "",
    abortMultipartUploadsTransition: {
      condition: { type: "Age", maxAge: 7 * 24 * 60 * 60 },
    },
  },
] as const;
