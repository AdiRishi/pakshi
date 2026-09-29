import { createFileRoute, redirect } from "@tanstack/react-router";
import { Schema } from "effect";

import { getOrganizationName, getViewer } from "@/features/session/functions";
import { SignInPage } from "@/features/session/sign-in-page";

const SignInSearch = Schema.Struct({ error: Schema.optionalKey(Schema.String) });

export const Route = createFileRoute("/sign-in")({
  validateSearch: Schema.toStandardSchemaV1(SignInSearch),
  loader: async () => {
    if ((await getViewer()) !== null) throw redirect({ to: "/" });
    return { organizationName: await getOrganizationName() };
  },
  head: () => ({ meta: [{ title: "Sign in · Pakshi" }] }),
  component: function SignIn() {
    const { organizationName } = Route.useLoaderData();
    const { error } = Route.useSearch();
    return <SignInPage organizationName={organizationName} failed={error !== undefined} />;
  },
});
