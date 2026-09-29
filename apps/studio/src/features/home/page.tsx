import type { Viewer } from "@repo/contracts/studio";
import { useNavigate } from "@tanstack/react-router";

import { Logo } from "@/components/logo";
import { authClient } from "@/features/session/auth-client";

const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

export function HomePage({ viewer }: { readonly viewer: Viewer }) {
  const navigate = useNavigate();
  const signOut = async () => {
    await authClient.signOut();
    await navigate({ to: "/sign-in" });
  };
  const [primaryRole] = viewer.roles;
  return (
    <div className="flex min-h-screen">
      <nav
        aria-label="Studio"
        className="flex w-62 shrink-0 flex-col gap-7 border-r border-border bg-white px-3.5 py-5"
      >
        <span className="px-2">
          <Logo />
        </span>
        <a
          href="/"
          aria-current="page"
          className="flex h-10 items-center rounded-[10px] bg-accent px-2.5 text-[15px] font-semibold"
        >
          Home
        </a>
        <div className="mt-auto flex items-center gap-2.5 px-2 py-2.5">
          <span
            aria-hidden="true"
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-foreground text-[13px] font-semibold text-white"
          >
            {initials(viewer.user.name)}
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-semibold">{viewer.user.name}</span>
            <span className="truncate text-xs text-muted-foreground">
              {primaryRole === undefined
                ? "No access yet"
                : `${primaryRole.role}, ${primaryRole.scope}`}
            </span>
          </span>
        </div>
        <button
          type="button"
          onClick={() => void signOut()}
          className="mx-2 h-9 rounded-[9px] border border-border text-[13px] font-semibold"
        >
          Sign out
        </button>
      </nav>
      <main className="flex min-w-0 grow flex-col">
        <section className="flex flex-col gap-2 bg-accent px-10 pt-9 pb-7.5">
          <h1 className="text-[32px] font-semibold tracking-[-0.02em]">
            Hello, {viewer.user.name.split(" ")[0]}
          </h1>
          <p className="text-base text-secondary-foreground">
            Your sites and what you can do on them.
          </p>
        </section>
        <div className="grid gap-8 px-10 py-8 lg:grid-cols-[minmax(0,1fr)_470px]">
          <section aria-labelledby="your-sites" className="flex flex-col gap-3">
            <h2 id="your-sites" className="text-[19px] font-semibold">
              Your sites
            </h2>
            {viewer.sites.length === 0 ? (
              <p className="rounded-[14px] border border-border bg-white px-4 py-3.5 text-sm text-muted-foreground">
                You can't edit any sites yet. Ask your team's Pakshi admin for access.
              </p>
            ) : (
              <ul className="flex flex-col divide-y divide-[#e8eef3] rounded-[14px] border border-border bg-white">
                {viewer.sites.map((site) => (
                  <li key={site.id} className="flex flex-col gap-0.5 px-4 py-3">
                    <span className="text-sm font-semibold">{site.name}</span>
                    <span className="text-[13px] text-muted-foreground">{site.brand}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section aria-labelledby="your-access" className="flex flex-col gap-3">
            <h2 id="your-access" className="text-[19px] font-semibold">
              Your access
            </h2>
            <ul className="flex flex-col divide-y divide-[#e8eef3] rounded-[14px] border border-border bg-white">
              {viewer.roles.length === 0 ? (
                <li className="px-4 py-3.5 text-sm text-muted-foreground">No roles yet</li>
              ) : (
                viewer.roles.map((role) => (
                  <li
                    key={`${role.role}-${role.scope}`}
                    className="flex justify-between gap-3 px-4 py-3 text-sm"
                  >
                    <span className="font-semibold">{role.role}</span>
                    <span className="text-muted-foreground">{role.scope}</span>
                  </li>
                ))
              )}
            </ul>
          </section>
        </div>
      </main>
    </div>
  );
}
