import { queryOptions } from "@tanstack/react-query";

import { getPeople } from "./functions";

export const peopleQuery = queryOptions({
  queryKey: ["organization-people"],
  queryFn: () => getPeople(),
});
