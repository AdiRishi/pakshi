/**
 * One CSV cell. A value a spreadsheet would read as a formula starts with an
 * apostrophe, so opening an export can't run anything someone typed.
 */
const cell = (value: string) => {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
};

/** Rows of cells as CSV. */
export const csv = (rows: ReadonlyArray<ReadonlyArray<string>>) =>
  rows.map((row) => row.map(cell).join(",")).join("\r\n");
