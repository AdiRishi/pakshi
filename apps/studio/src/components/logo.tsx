/** Pakshi's bird mark and wordmark. */
export const Logo = ({ inverse = false }: { readonly inverse?: boolean }) => (
  <span className="flex items-center gap-2.5">
    <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true">
      <rect width="30" height="30" rx="9" className={inverse ? "fill-white" : "fill-sky"} />
      <path
        d="M7 18C10 12.5 12.5 12 15 16C17.5 12 20 12.5 23 18"
        className="stroke-foreground"
        strokeWidth="2.4"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
    <span className="text-[19px] font-bold tracking-[-0.02em]">pakshi</span>
  </span>
);
