import { Schema } from "effect";

/** An email address as people type it. Pakshi compares addresses without case. */
export const EmailAddress = Schema.Trim.check(
  Schema.isMaxLength(254),
  Schema.isPattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, { message: "Enter an email address" }),
);
export type EmailAddress = typeof EmailAddress.Type;
