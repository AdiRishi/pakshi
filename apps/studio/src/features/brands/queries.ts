import type { BrandId } from "@repo/contracts/ids";
import { queryOptions } from "@tanstack/react-query";

import { getBrand, getBrands } from "./functions";

export const brandsQuery = queryOptions({
  queryKey: ["brands"],
  queryFn: () => getBrands(),
});

export const brandQuery = (brand: BrandId) =>
  queryOptions({
    queryKey: ["brands", brand],
    queryFn: () => getBrand({ data: { brand } }),
  });
