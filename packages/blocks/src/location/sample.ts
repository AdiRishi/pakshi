import type { BlockSample } from "../presentation.ts";
import type location from "./v2/index.tsx";

export default {
  variant: "split",
  surface: "default",
  props: {
    kicker: "Visit",
    heading: "Getting to the harbour.",
    headingRest: "Ten minutes' walk from the station.",
    address: "Harbour Summer School\nThe Boatshed, North Quay\nPortlow PL12 3AB",
    hours: [
      { id: "it_week", days: "Monday to Friday", times: "8:30am to 5pm" },
      { id: "it_sat", days: "Saturday", times: "10am to 1pm" },
      { id: "it_sun", days: "Sunday", times: "Closed" },
    ],
    directions:
      "From Portlow station, follow the signs to the quay. There's no parking on the quay, so please use the town car park on Station Road.",
    map: {
      $ref: "media",
      id: "med_sampleMap",
      alt: "A map of North Quay, with the boatshed marked",
    },
    actions: [
      {
        id: "it_directions",
        button: { label: "Get directions", link: "https://example.org/directions" },
      },
    ],
    mediaSide: "end",
  },
} satisfies BlockSample<typeof location>;
