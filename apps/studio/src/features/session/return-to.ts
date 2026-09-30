/**
 * Where to send someone after they sign in: an address in Studio, or
 * Studio's home. Addresses on other sites are refused, so a link can't use
 * sign-in to send people away.
 */
export const returnTo = (value: string | null | undefined) =>
  value !== null && value !== undefined && /^\/(?![/\\])/.test(value) ? value : "/";
