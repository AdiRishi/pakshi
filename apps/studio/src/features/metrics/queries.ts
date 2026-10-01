import { Timestamp } from "@repo/contracts/release";
import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { Schema } from "effect";

import { studio } from "@/server/studio";

/** Pakshi's success metrics since a moment. */
export const getSuccessMetrics = createServerFn({ method: "GET" })
  .validator(Schema.toStandardSchemaV1(Schema.Struct({ since: Timestamp })))
  .handler(({ data }) => studio((client) => client.successMetrics(data)));

export const successMetricsQuery = (since: Timestamp) =>
  queryOptions({
    queryKey: ["success-metrics", since],
    queryFn: () => getSuccessMetrics({ data: { since } }),
  });
