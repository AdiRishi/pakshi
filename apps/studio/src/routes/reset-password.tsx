import { authBasePath, passwordLength } from "@repo/contracts/accounts";
import { Button } from "@repo/ui/components/button";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { Option, Schema } from "effect";

import { AccountLayout } from "@/features/accounts/account-layout";
import { FormField } from "@/features/accounts/form-field";
import { getOrganization } from "@/features/session/functions";
import { postToStudioApi, readForm, redirectTo } from "@/server/forward";

/**
 * Choosing a new password, from the link in a reset email. Better Auth checks
 * the link's token and sends people here with it, or with an error when it
 * has expired or been used.
 */
export const Route = createFileRoute("/reset-password")({
  validateSearch: Schema.toStandardSchemaV1(
    Schema.Struct({
      token: Schema.optionalKey(Schema.String),
      error: Schema.optionalKey(Schema.String),
    }),
  ),
  loader: async () => {
    const organization = await getOrganization();
    if (organization === null) throw redirect({ to: "/set-up" });
    return { organization: organization.name };
  },
  head: () => ({ meta: [{ title: "Choose a new password · Pakshi" }] }),
  server: {
    handlers: {
      POST: async ({ request }) => {
        const form = await readForm(
          request,
          Schema.Struct({ token: Schema.String, password: Schema.String }),
        );
        const reset = Option.isSome(form)
          ? await postToStudioApi(request, `${authBasePath}/reset-password`, {
              token: form.value.token,
              newPassword: form.value.password,
            })
          : null;
        return redirectTo(
          request,
          reset?.ok === true ? "/sign-in?reset=done" : "/reset-password?error=INVALID_TOKEN",
        );
      },
    },
  },
  component: function ResetPassword() {
    const { organization } = Route.useLoaderData();
    const { token, error } = Route.useSearch();
    const usable = token !== undefined && error === undefined;
    return (
      <AccountLayout
        audience={`${organization} teams`}
        title="Choose a new password"
        description="Changing it signs your account out everywhere else."
        notice={
          usable
            ? null
            : {
                kind: "problem",
                title: "This link doesn't work",
                text: "It has expired or been used. Ask for another one.",
              }
        }
        footer={
          <Link to={usable ? "/sign-in" : "/forgot-password"} className="text-link underline">
            {usable ? "Back to sign in" : "Ask for another link"}
          </Link>
        }
      >
        {usable && (
          <form method="post" className="flex flex-col gap-5">
            <input type="hidden" name="token" value={token} />
            <FormField
              label="New password"
              name="password"
              type="password"
              autoComplete="new-password"
              maxLength={passwordLength.max}
            />
            <Button type="submit" size="lg" className="h-11 font-bold">
              Change password
            </Button>
          </form>
        )}
      </AccountLayout>
    );
  },
});
