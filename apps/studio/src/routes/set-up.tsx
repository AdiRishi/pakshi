import { accountsPaths, AccountRefusal, passwordLength, SetUp } from "@repo/contracts/accounts";
import { Button } from "@repo/ui/components/button";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { Option, Schema } from "effect";

import { AccountLayout, type Notice } from "@/features/accounts/account-layout";
import { FormField } from "@/features/accounts/form-field";
import { getOrganization } from "@/features/session/functions";
import { postToStudioApi, readForm, redirectTo } from "@/server/forward";

const decodeRefusal = Schema.decodeUnknownOption(Schema.fromJsonString(AccountRefusal));

const notices = {
  invalid: {
    kind: "problem",
    title: "Check the details",
    text: "Fill in every field.",
  },
  failed: {
    kind: "problem",
    title: "Setting up didn't finish",
    text: "Pakshi couldn't set up just now. Try again in a moment.",
  },
} as const satisfies Record<string, Notice>;

/**
 * Setting Pakshi up, which the first person to open an empty stage does: they
 * name the organization and make their account, and become its admin.
 */
export const Route = createFileRoute("/set-up")({
  validateSearch: Schema.toStandardSchemaV1(
    Schema.Struct({ error: Schema.optionalKey(Schema.Literals(["invalid", "failed"])) }),
  ),
  loader: async () => {
    if ((await getOrganization()) !== null) throw redirect({ to: "/sign-in" });
  },
  head: () => ({ meta: [{ title: "Set up Pakshi" }] }),
  server: {
    handlers: {
      POST: async ({ request }) => {
        const form = await readForm(request, SetUp);
        if (Option.isNone(form)) return redirectTo(request, "/set-up?error=invalid");
        const made = await postToStudioApi(request, accountsPaths.setUp, form.value);
        if (made.ok) return redirectTo(request, "/", made);
        const refusal = decodeRefusal(await made.text());
        if (Option.isSome(refusal) && refusal.value.reason === "set-up")
          return redirectTo(request, "/sign-in");
        return redirectTo(
          request,
          `/set-up?error=${Option.isSome(refusal) && refusal.value.reason === "invalid" ? "invalid" : "failed"}`,
        );
      },
    },
  },
  component: function SetUp() {
    const { error } = Route.useSearch();
    return (
      <AccountLayout
        audience="your teams"
        title="Set up Pakshi"
        description="Name your organization and make your account. You'll be its admin, and you invite everyone else."
        notice={error === undefined ? null : notices[error]}
      >
        <form method="post" className="flex flex-col gap-5">
          <FormField
            label="Organization"
            name="organization"
            autoComplete="organization"
            maxLength={80}
            description="Such as Riverton Council. People see it when they sign in."
          />
          <FormField label="Your name" name="name" autoComplete="name" maxLength={80} />
          <FormField label="Email" name="email" type="email" autoComplete="email" />
          <FormField
            label="Password"
            name="password"
            type="password"
            autoComplete="new-password"
            maxLength={passwordLength.max}
          />
          <Button type="submit" size="lg" className="h-11 font-bold">
            Set up Pakshi
          </Button>
        </form>
      </AccountLayout>
    );
  },
});
