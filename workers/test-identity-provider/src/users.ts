/** The people the test identity provider signs in. Non-production stages seed their Pakshi access. */
export const testUsers = [
  { id: "user_meera", name: "Meera Kapoor", email: "meera.kapoor@pakshi.test" },
  { id: "user_sam", name: "Sam Okafor", email: "sam.okafor@pakshi.test" },
  { id: "user_jonah", name: "Jonah Reyes", email: "jonah.reyes@pakshi.test" },
] as const;

export type TestUser = (typeof testUsers)[number];
