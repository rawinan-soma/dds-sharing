#!/usr/bin/env python3
"""Check assets/app.css against the claims ADR 0009 makes about it.

Run:  python3 scripts/check-metrics.py     (after `pnpm build`)

Every assertion here is something ADR 0009 states in prose. The point is that
the next agent can find out whether the prose is still true without reading the
CSS, and that a Tailwind or DaisyUI upgrade which quietly reintroduces a Latin
metric fails loudly instead of shipping clipped tone marks.

Noto Sans Thai's own glyph box is ascent 1061 + descent 450 = 1.511em on a
1000-upm body, which is where the 1.55 floor comes from.
"""
import re, pathlib, sys

CSS = pathlib.Path(__file__).resolve().parent.parent / "assets" / "app.css"
if not CSS.exists():
    sys.exit("assets/app.css not built — run `pnpm build` first")
css = CSS.read_text()

GLYPH_BOX = 1.511
FLOOR = 1.55

# (label, regex, must_be_absent)
CHECKS = [
    ("DaisyUI theme 'dds' is defined, not inherited",  r"\[data-theme=dds\]\{",           False),
    ("DaisyUI theme 'dds-reviewer' is defined",        r"\[data-theme=dds-reviewer\]\{",  False),
    ("no built-in DaisyUI theme leaked in",            r"oklch\(45% 0\.24 277",           True),
    ("primary  #0a5468",                               r"--color-primary:#0a5468",        False),
    ("secondary #06333f (the approval-gate ground)",   r"--color-secondary:#06333f",      False),
    ("success  #14603c",                               r"--color-success:#14603c",        False),
    ("error    #9b1c22",                               r"--color-error:#9b1c22",          False),
    ("warning  #7a4a00",                               r"--color-warning:#7a4a00",        False),
    ("--size-field .275rem → 44px controls",           r"--size-field:\.275rem",          False),
    ("--size-selector .3125rem → 30px badge/radio",    r"--size-selector:\.3125rem",      False),
    ("--depth 0 (no elevation, no .btn text-shadow)",  r"--depth:0",                      False),
    ("preflight line-height 1.5 replaced by 1.75",     r"html\{[^}]*line-height:1\.75",   False),
    ("letter-spacing 0 on body",                       r"body\{[^}]*letter-spacing:0",    False),
    ("hyphens none on body",                           r"body\{[^}]*hyphens:none",        False),
    (".btn font-size raised off DaisyUI's 14px",       r"\.btn\{[^}]*font-size:var\(--text-base\)", False),
    (".btn text-shadow removed",                       r"\.btn\{[^}]*text-shadow:none",   False),
    (".input --font-size-min raised off 14px",         r"--font-size-min:var\(--text-base\)",       False),
    (".alert's hard-coded 1.25rem line box replaced",  r"\.alert\{[^}]*line-height:1\.75",False),
    (".badge wraps instead of clipping",               r"\.badge\{[^}]*height:auto",      False),
    (".footer-title uppercase removed",                r"\.footer-title\{[^}]*text-transform:none", False),
    ("text-justify neutralised",                       r"\.text-justify\{text-align:start!important\}", False),
    ("44px floor on every control",                    r"min-height:2\.75rem",            False),
    (".decision is position:static (§10.2, not sticky)", r"\.decision\{[^}]*position:static", False),
    ("Noto Sans Thai self-hosted (thai subset)",       r"NotoSansThai-thai\.woff2",       False),
    ("Noto Sans Mono self-hosted",                     r"NotoSansMono-latin\.woff2",      False),
    ("Thai unicode-range shipped",                     r"U\+0?E01-0?E5B",                 False),
    ("NO Google Fonts on the critical path (§15.3)",   r"fonts\.(googleapis|gstatic)\.com", True),
    ("no Noto Sans Thai LOOPED anywhere",              r"Noto Sans Thai Looped",          True),
]

failures = []
for label, pattern, absent in CHECKS:
    hit = bool(re.search(pattern, css))
    ok = (not hit) if absent else hit
    print(f"  {'ok  ' if ok else 'FAIL'}  {label}")
    if not ok:
        failures.append(label)

print(f"\nline-height floor — nothing may sit under {FLOOR} "
      f"(Noto Sans Thai's glyph box is {GLYPH_BOX}em):")
low = []
for m in re.finditer(r"--text-([a-z0-9]+)--line-height:([0-9.]+)", css):
    step, value = m.group(1), float(m.group(2))
    ok = value >= FLOOR
    print(f"  {'ok  ' if ok else 'LOW '}  --text-{step}--line-height: {value}")
    if not ok:
        low.append(step)

# Source-level rule: every colour is declared once, in the theme, with its
# measured ratio beside it. No hex may appear below the @theme block — a colour
# written inside a component is a colour nobody measured on the ground it lands
# on, which is exactly how --color-muted shipped at 4.49:1 the first time.
SRC = pathlib.Path(__file__).resolve().parent.parent / "src" / "app.css"
stray = []
if SRC.exists():
    body = SRC.read_text().split("@layer base", 1)
    if len(body) == 2:
        for line in body[1].splitlines():
            code = line.split("/*")[0]
            if re.search(r"#[0-9a-fA-F]{3,8}\b", code):
                stray.append(line.strip())
print("\nno colour declared outside the theme:")
if stray:
    for s in stray:
        print(f"  STRAY  {s}")
else:
    print("  ok    src/app.css declares no hex below @theme")

# Every custom property this stylesheet references must actually be defined in
# it, and none may define itself. A `var(--x)` with no `--x` behind it renders
# as nothing at all — no error, no warning, and on a background that is simply
# the missing colour. This check exists because exactly that shipped once:
# a blanket rename rewrote five --color-*-tint declarations into references to
# themselves, and the notices lost their backgrounds silently.
declared = set(re.findall(r"(--[\w-]+)\s*:", css))
declared |= set(re.findall(r"@property\s+(--[\w-]+)", css))
# Scoped to --color-*: those are this design's own, and a missing colour is the
# failure that renders as "nothing was painted" rather than as an error.
referenced = {v for v in re.findall(r"var\((--color-[\w-]+)", css)}
undefined = sorted(referenced - declared)
selfref = sorted(re.findall(r"(--[\w-]+)\s*:\s*var\(\1\)", css))
print("\nevery --color-* var() resolves:")
if undefined or selfref:
    for v in undefined:
        print(f"  UNDEF  {v} is referenced but never declared")
    for v in selfref:
        print(f"  SELF   {v} is defined as var({v})")
else:
    print(f"  ok    {len(referenced)} --color-* references, all declared, none self-referential")

if failures or low or stray or undefined or selfref:
    print(f"\n{len(failures)} failed check(s), {len(low)} line-height(s) under the floor, "
          f"{len(stray)} stray colour(s), "
          f"{len(undefined) + len(selfref)} unresolved var()")
    sys.exit(1)
print("\nall checks pass")
