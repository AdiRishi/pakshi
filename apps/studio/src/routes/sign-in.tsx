import { createFileRoute, redirect } from "@tanstack/react-router";
import { Schema } from "effect";

import { getOrganizationName, getViewer } from "@/features/session/functions";
import { returnTo } from "@/features/session/return-to";
import { SignInPage } from "@/features/session/sign-in-page";

const SignInSearch = Schema.Struct({
  error: Schema.optionalKey(Schema.String),
  redirect: Schema.optionalKey(Schema.String),
});

export const Route = createFileRoute("/sign-in")({
  validateSearch: Schema.toStandardSchemaV1(SignInSearch),
  loaderDeps: ({ search }) => ({ back: returnTo(search.redirect) }),
  loader: async ({ deps }) => {
    if ((await getViewer()) !== null) throw redirect({ href: deps.back });
    return { organizationName: await getOrganizationName(), back: deps.back };
  },
  head: () => ({ meta: [{ title: "Sign in · Pakshi" }] }),
  component: function SignIn() {
    const { organizationName, back } = Route.useLoaderData();
    const { error } = Route.useSearch();
    return (
      <SignInPage organizationName={organizationName} failed={error !== undefined} back={back} />
    );
  },
});
