import { SiteName } from "@repo/contracts/settings";
import { SiteAddress, type Viewer } from "@repo/contracts/studio";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent } from "@repo/ui/components/card";
import { Field, FieldDescription, FieldError, FieldLabel } from "@repo/ui/components/field";
import { Input } from "@repo/ui/components/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@repo/ui/components/input-group";
import { NativeSelect, NativeSelectOption } from "@repo/ui/components/native-select";
import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Option, Schema } from "effect";
import { useId, useState } from "react";

import { AppShell } from "@/components/app-shell";

import { createSite } from "./functions";
import { newSiteOptionsQuery } from "./queries";

const decodeName = Schema.decodeOption(SiteName);
const decodeAddress = Schema.decodeOption(SiteAddress);

/** An address name from a site's name, such as `northbank-libraries` from "Northbank Libraries". */
const addressFor = (name: string) =>
  name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63)
    .replace(/-+$/, "");

/**
 * Makes a site in one of the person's brands. It gets its platform subdomain
 * at once, and opens in its first draft, where people build it.
 */
export function NewSitePage(props: { readonly viewer: Viewer }) {
  const { data } = useSuspenseQuery(newSiteOptionsQuery);
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [brand, setBrand] = useState(data.brands[0]?.id);
  const [address, setAddress] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const ids = { name: useId(), brand: useId(), address: useId() };
  const shownAddress = address ?? addressFor(name);
  const decoded = { name: decodeName(name), address: decodeAddress(shownAddress) };
  const mutation = useMutation({
    mutationFn: createSite,
    onSuccess: ({ site, draft }) =>
      navigate({
        to: "/sites/$siteId/drafts/$draftId",
        params: { siteId: site.id, draftId: draft },
      }),
  });
  return (
    <AppShell viewer={props.viewer}>
      <header className="flex flex-col gap-2 bg-accent px-10 pt-6 pb-8">
        <h1 className="text-3xl font-semibold tracking-tight">New site</h1>
        <p className="text-secondary-foreground">
          The site uses its brand's theme, voice guide and approval steps. Nothing goes live until
          its first draft is published.
        </p>
      </header>
      <div className="px-10 py-8">
        <Card className="max-w-2xl">
          <CardContent>
            <form
              noValidate
              className="flex flex-col gap-6"
              onSubmit={(event) => {
                event.preventDefault();
                setTouched(true);
                if (
                  brand !== undefined &&
                  Option.isSome(decoded.name) &&
                  Option.isSome(decoded.address)
                )
                  mutation.mutate({
                    data: { brand, name: decoded.name.value, address: decoded.address.value },
                  });
              }}
            >
              <Field data-invalid={(touched && Option.isNone(decoded.name)) || undefined}>
                <FieldLabel htmlFor={ids.name}>Site name</FieldLabel>
                <Input
                  id={ids.name}
                  value={name}
                  maxLength={80}
                  required
                  aria-invalid={(touched && Option.isNone(decoded.name)) || undefined}
                  onChange={(event) => setName(event.target.value)}
                />
                <FieldDescription>Such as Riverton Book Festival 2027.</FieldDescription>
                <FieldError
                  errors={
                    touched && Option.isNone(decoded.name) ? [{ message: "Name the site." }] : []
                  }
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={ids.brand}>Brand</FieldLabel>
                <NativeSelect
                  id={ids.brand}
                  className="w-full"
                  value={brand ?? ""}
                  onChange={(event) =>
                    setBrand(
                      data.brands.find((candidate) => candidate.id === event.target.value)?.id,
                    )
                  }
                >
                  {data.brands.map((candidate) => (
                    <NativeSelectOption key={candidate.id} value={candidate.id}>
                      {candidate.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
              <Field data-invalid={(touched && Option.isNone(decoded.address)) || undefined}>
                <FieldLabel htmlFor={ids.address}>Pakshi address</FieldLabel>
                <InputGroup>
                  <InputGroupInput
                    id={ids.address}
                    value={shownAddress}
                    maxLength={63}
                    spellCheck={false}
                    aria-invalid={(touched && Option.isNone(decoded.address)) || undefined}
                    onChange={(event) => setAddress(event.target.value.toLowerCase())}
                  />
                  <InputGroupAddon align="inline-end">
                    <InputGroupText>.{data.sitesHost}</InputGroupText>
                  </InputGroupAddon>
                </InputGroup>
                <FieldDescription>
                  The site always answers here, even once it has its own domain. It can't be changed
                  later.
                </FieldDescription>
                <FieldError
                  errors={
                    touched && Option.isNone(decoded.address)
                      ? [
                          {
                            message:
                              "Use lowercase letters, digits and hyphens, starting and ending with a letter or digit.",
                          },
                        ]
                      : []
                  }
                />
              </Field>
              {mutation.error !== null && <FieldError>{mutation.error.message}</FieldError>}
              <div>
                <Button
                  type="submit"
                  size="lg"
                  disabled={mutation.isPending || brand === undefined}
                >
                  Create site
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
