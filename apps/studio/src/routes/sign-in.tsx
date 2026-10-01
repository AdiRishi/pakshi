import { authBasePath } from "@repo/contracts/accounts";
import { Button } from "@repo/ui/components/button";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { Option, Schema } from "effect";

import { AccountLayout, type Notice } from "@/features/accounts/account-layout";
import { FormField } from "@/features/accounts/form-field";
import { getOrganization, getViewer } from "@/features/session/functions";
import { returnTo } from "@/features/session/return-to";
import { postToStudioApi, readForm, redirectTo } from "@/server/forward";

const SignInSearch = Schema.Struct({
  error: Schema.optionalKey(Schema.Literals(["credentials", "unavailable"])),
  /** The person just reset their password. */
  reset: Schema.optionalKey(Schema.Literal("done")),
  redirect: Schema.optionalKey(Schema.String),
});

const SignInForm = Schema.Struct({
  email: Schema.String,
  password: Schema.String,
  redirect: Schema.String,
});

const notices = {
  credentials: {
    kind: "problem",
    title: "That didn't work",
    text: "Check your email address and password, and try again.",
  },
  unavailable: {
    kind: "problem",
    title: "Sign-in didn't finish",
    text: "Pakshi couldn't sign you in just now. Try again in a moment.",
  },
  reset: {
    kind: "done",
    title: "Password changed",
    text: "Sign in with your new password.",
  },
} as const satisfies Record<string, Notice>;

export const Route = createFileRoute("/sign-in")({
  validateSearch: Schema.toStandardSchemaV1(SignInSearch),
  loaderDeps: ({ search }) => ({ back: returnTo(search.redirect) }),
  loader: async ({ deps }) => {
    const organization = await getOrganization();
    if (organization === null) throw redirect({ to: "/set-up" });
    if ((await getViewer()) !== null) throw redirect({ href: deps.back });
    return { organization: organization.name, back: deps.back };
  },
  head: () => ({ meta: [{ title: "Sign in · Pakshi" }] }),
  server: {
    handlers: {
      POST: async ({ request }) => {
        const form = await readForm(request, SignInForm);
        if (Option.isNone(form)) return redirectTo(request, "/sign-in?error=credentials");
        const { redirect: target, ...credentials } = form.value;
        const back = returnTo(target);
        const signedIn = await postToStudioApi(
          request,
          `${authBasePath}/sign-in/email`,
          credentials,
        );
        if (signedIn.ok) return redirectTo(request, back, signedIn);
        const search = new URLSearchParams({
          error: signedIn.status < 500 ? "credentials" : "unavailable",
        });
        if (back !== "/") search.set("redirect", back);
        return redirectTo(request, `/sign-in?${search.toString()}`);
      },
    },
  },
  component: function SignIn() {
    const { organization, back } = Route.useLoaderData();
    const search = Route.useSearch();
    const notice =
      search.error !== undefined
        ? notices[search.error]
        : search.reset !== undefined
          ? notices.reset
          : null;
    return (
      <AccountLayout
        audience={`${organization} teams`}
        title="Sign in to Pakshi"
        description={`Use the email address ${organization} invited you with.`}
        notice={notice}
        footer="Not invited yet? Ask your team's Pakshi admin to invite you. If you can sign in but can't see your site, ask them for access to it."
      >
        <form method="post" className="flex flex-col gap-5">
          <input type="hidden" name="redirect" value={back} />
          <FormField label="Email" name="email" type="email" autoComplete="email" />
          <FormField
            label="Password"
            name="password"
            type="password"
            autoComplete="current-password"
          />
          <Button type="submit" size="lg" className="h-11 font-bold">
            Sign in
          </Button>
          <Link to="/forgot-password" className="text-center text-sm text-link underline">
            Forgot your password?
          </Link>
        </form>
      </AccountLayout>
    );
  },
});
