// Reviewer — told at seeding and at first login, not in the spec itself
// (spec §12.9): the seeding CLI already prints a one-time password and a
// terminal QR, so it also prints this, and first login shows it once
// alongside the forced password change. English is the source of record
// here (ADR 0010 covers the Angular surfaces and the four NestJS emails,
// not this CLI/first-login notice), and it is never translated.
export const REVIEWER_RETENTION_NOTICE = `
What is recorded about you, kept indefinitely, for audit and traceability:
  - every sign-in and failed sign-in, with your IP address and browser
  - your response times against the 24-business-hour decision promise
  - every Alert you clear, and every one left uncleared while assigned to you
  - your display name, permanently, on every Decision you make

This is never deleted, and there is no way to opt out — it is what makes a
data release traceable to who asked and who approved it.
`.trim();
