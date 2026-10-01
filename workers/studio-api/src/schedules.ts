/** When studio-api's scheduled jobs run, as cron expressions in UTC. infra deploys these. */
export const schedules = {
  /** Reconciling KV, offering brand revisions again, collecting block versions and checking domains. */
  frequent: "*/5 * * * *",
  /** Deleting library images unused for three months, and sites deleted 30 days ago. */
  daily: "23 3 * * *",
} as const;
