import { queryOptions } from "@tanstack/react-query";

import { getRoles } from "./functions";

export const rolesQuery = queryOptions({ queryKey: ["roles"], queryFn: () => getRoles() });
