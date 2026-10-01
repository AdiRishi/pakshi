/** When studio-api's scheduled jobs run, as cron expressions in UTC. infra deploys these. */
export const schedules = {
  /** Reconciling KV, offering brand revisions again, collecting block versions and checking domains. */
  frequent: "*/5 * * * *",
  /** Keeping library images while they're used, and deleting the rest after three months. */
  daily: "23 3 * * *",
} as const;
