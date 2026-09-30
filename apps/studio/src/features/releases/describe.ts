import type { Release } from "@repo/contracts/release";

import { formatDay } from "@/lib/dates";

/** What a release changed, in a few words. */
export const releaseTitle = (release: Release) => {
  switch (release._tag) {
    case "Published":
      return release.draft.name;
    case "RolledBack":
      return "Rolled back the latest publish";
    case "Imported":
      return "The site as Pakshi found it";
  }
};

/** A release by name and day, such as `"Opening hours update" from 25 Sep 2026`. */
export const releaseNamed = (release: Release) =>
  `"${releaseTitle(release)}" from ${formatDay(release.at)}`;
