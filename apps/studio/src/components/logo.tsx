import { cn } from "cn";

/** Pakshi's bird mark and wordmark. `inverse` puts the mark on a card-colored tile. */
export const Logo = ({ inverse = false }: { readonly inverse?: boolean }) => (
  <span className="flex items-center gap-2.5">
    <svg viewBox="0 0 30 30" aria-hidden="true" className="size-8">
      <rect width="30" height="30" rx="9" className={cn(inverse ? "fill-card" : "fill-primary")} />
      <path
        d="M7 18C10 12.5 12.5 12 15 16C17.5 12 20 12.5 23 18"
        className="stroke-foreground"
        strokeWidth="2.4"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
    <span className="text-lg font-bold tracking-tight">pakshi</span>
  </span>
);
