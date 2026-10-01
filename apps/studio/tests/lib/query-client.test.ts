import { AppRequestError } from "@repo/contracts/app";
import { expect, test } from "vitest";

import { createQueryClient } from "@/lib/query-client";

test.each([
  "invalid_request",
  "unauthenticated",
  "not_found",
  "forbidden",
  "conflict",
  "internal",
] as const)("%s stops instead of retrying into a later result", async (code) => {
  const client = createQueryClient();
  let failed = false;
  try {
    await expect(
      client.query({
        queryKey: [code],
        retryDelay: 0,
        queryFn: async () => {
          if (!failed) {
            failed = true;
            throw new AppRequestError(code, "Failed.");
          }
          return "unexpected retry";
        },
      }),
    ).rejects.toMatchObject({ code });
  } finally {
    client.clear();
  }
});

test("temporary unavailability can recover through a retry", async () => {
  const client = createQueryClient();
  let unavailable = true;
  try {
    const data = await client.query({
      queryKey: ["recover"],
      retryDelay: 0,
      queryFn: async () => {
        if (unavailable) {
          unavailable = false;
          throw new AppRequestError("unavailable", "Try again.");
        }
        return "recovered";
      },
    });
    expect(data).toBe("recovered");
  } finally {
    client.clear();
  }
});

test("lasting unavailability fails rather than retrying forever", async () => {
  const client = createQueryClient();
  try {
    await expect(
      client.query({
        queryKey: ["down"],
        retryDelay: 0,
        queryFn: async () => {
          throw new AppRequestError("unavailable", "Try again.");
        },
      }),
    ).rejects.toMatchObject({ code: "unavailable" });
  } finally {
    client.clear();
  }
});
