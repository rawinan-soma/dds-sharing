# The four emails — what the markup does and why

Spec §11, issue #50. Thai copy, and they must render in **Outlook desktop**,
which uses the Word rendering engine.

## What that forces, and it is not negotiable

| Constraint | Why |
|---|---|
| **Tables for layout.** No flex, no grid, no float. | Word has no support for any of them. |
| **Inline styles only.** No `<style>` block relied on, no CSS custom properties. | Word drops most of a `<style>` block and all custom properties. The tokens in `assets/tokens.css` are therefore **transcribed as literal hex** in these files — the one place in this design where that is correct. |
| **No `@font-face`.** | Outlook ignores it. The stack falls back to `Leelawadee UI` / `Tahoma` on Windows, both of which carry Thai. Stated explicitly so nobody "fixes" it by adding a webfont link. |
| **`mso-line-height-rule: exactly` with the height in px.** | Without it Word computes its own leading and **clips Thai tone marks against the line above** — the single most likely way these emails break, and it is invisible to anyone testing in Gmail. |
| **600 px fixed body width, `<table>` at `width="600"`.** | Word ignores `max-width`. |
| **Button = a bordered table cell wrapping an `<a>`.** | Word does not render `padding` on an inline `<a>`. |
| **`<!--[if mso]>` conditional wrappers** where a fallback differs. | The only reliable branch. |
| **No background images, no rounded corners relied on.** | Word drops both; the design degrades to a square, flat block, which is fine. |

## Delivery is the one that carries a capability

`04-delivery.html` carries the Download token. Three things about it are
load-bearing, not styling:

- The **72-hour clock is anchored on job completion, not on this email arriving**
  (§9.3), so the mail states the absolute expiry moment, never "72 hours from now".
- The **link is an absolute URL from `FRONTEND_URL`**, never derived from `Host`
  (§16.2) — deriving it is how a poisoned link reaches an inbox.
- **The token appears exactly once, in the href and in the visible link.** It is
  never repeated in a "if the button does not work, copy this" block *plus* the
  button, because two copies is two places it can be quoted out of.

## The rejection email gives no reason

`02-rejection.html` says the Request was not approved and gives no reason —
§10.3. The internal note never leaves the system. The rule was already stated to
the Requester on the form, so this mail is not where they first learn it.
