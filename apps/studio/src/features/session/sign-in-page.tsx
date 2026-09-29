import { Logo } from "@/components/logo";

export function SignInPage(props: { readonly organizationName: string; readonly failed: boolean }) {
  return (
    <div className="flex min-h-screen bg-white">
      <section
        aria-label="About Pakshi"
        className="relative hidden w-[53%] shrink-0 flex-col overflow-hidden bg-linear-to-b from-[#7cc6f5] via-[#a6d9f8] to-[#ddf0fc] px-14 pt-10 pb-33 lg:flex"
      >
        <Logo inverse />
        <p className="relative mt-auto max-w-140 text-[38px] leading-[1.18] font-semibold tracking-[-0.02em]">
          Pakshi is where {props.organizationName} teams build and update their websites.
        </p>
      </section>
      <main className="flex grow flex-col items-center justify-center p-10">
        <div className="flex w-full max-w-110 flex-col gap-6 rounded-[18px] border border-border bg-white px-9 pt-9 pb-7.5">
          <div className="flex flex-col gap-2">
            <h1 className="text-[26px] font-semibold tracking-[-0.015em]">Sign in to Pakshi</h1>
            <p className="text-[15px] leading-normal text-muted-foreground">
              Use your {props.organizationName} account. Pakshi has no separate password.
            </p>
          </div>
          {props.failed && (
            <p role="alert" className="rounded-md bg-[#fff0d4] px-4 py-3 text-sm text-[#7a4a00]">
              Sign-in didn't finish. Try again, or contact your IT service desk.
            </p>
          )}
          <a
            href="/sign-in/start"
            className="flex h-11.5 items-center justify-center gap-2.5 rounded-lg bg-primary text-[15px] font-bold text-primary-foreground"
          >
            Continue with {props.organizationName} account
          </a>
          <p className="border-t border-[#e8eef3] pt-5 text-[13px] leading-normal text-muted-foreground">
            Can't get in? Contact the IT service desk about your account. If you can sign in but
            can't see your site, ask your team's Pakshi admin for access.
          </p>
        </div>
      </main>
    </div>
  );
}
