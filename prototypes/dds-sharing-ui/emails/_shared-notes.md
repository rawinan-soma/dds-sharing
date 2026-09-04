# The four emails — what the markup does and why

Spec §11, issue #50. Thai copy, and they must render in **Outlook desktop**,
which uses the Word rendering engine.

## ⚠️ Tailwind and DaisyUI do not reach these files, and must not

ADR 0009 settles the visual layer as Tailwind CSS + DaisyUI for every *screen*.
These four files are the stated exception, and the reason is mechanical rather
than stylistic: **Word supports neither an external stylesheet nor a class
selector it can rely on**, so a utility class and a component class are equally
invisible to it. Everything below is what is left when both are gone.

The consequence to hold on to: **these emails did not change when the stack
changed.** They were written against Outlook, not against a CSS framework, so
reversing decisions 1 and 3 of ADR 0009 left them untouched. The only edit they
have taken is one colour token — `#64707c` to `#5e6975` — because that token
was corrected for contrast on the tinted Reviewer ground and this service keeps
one palette, not two.

## What that forces, and it is not negotiable

| Constraint | Why |
|---|---|
| **Tables for layout.** No flex, no grid, no float. | Word has no support for any of them. |
| **Inline styles only.** No `<style>` block relied on, no CSS custom properties. | Word drops most of a `<style>` block and all custom properties. The DaisyUI theme's colours are therefore **transcribed as literal hex** in these files — the one place in this design where that is correct. |
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
