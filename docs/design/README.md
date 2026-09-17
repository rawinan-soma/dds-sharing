# Design

The UI design for DDS Sharing. Four documents and the source of the design
system.

| File | What it is |
|---|---|
| [`brief.md`](brief.md) | Every screen the service needs, what each must contain, and which rules are requirements rather than styling. The design was built against this |
| [`system.md`](system.md) | The tokens and the two components, written out. Read before implementing anything |
| [`handoff.md`](handoff.md) | Per-screen layout, states, edge cases, responsive intent and accessibility |
| [`source/`](source) | The token file and the components, copied from the design tool |

**The design itself lives in the Lunagraph project `dds-sharing`** — twelve
screens, built in Thai. These documents describe it; they do not replace it.

## Where `source/` goes

`source/globals.css` and `source/components/` are React and Tailwind v4 because
that is what the design tool renders. They are **not** the implementation. When
the Angular scaffold lands (#60), the tokens move into the app's stylesheet
unchanged, and the two components are rewritten as Angular components carrying
the same variants, sizes and states.

## Two things that are not settled

- **The Thai on the canvas is a layout proxy**, except the Disease group names,
  province names and เขตสุขภาพ numbering, which come from `docs/disease-groups.md`
  and `docs/provinces.csv` and are authoritative. Copy is authored in English
  into the catalogue (ADR 0010); the repo owner translates.
- **ADRs 0015, 0016 and 0017 are cited by ticket #74 but are not in
  `docs/adr/`.** ADR 0017 — a Reviewer never corrects a Requester's email
  address — is load-bearing for the in-flight screen, and right now the design
  is the only place it is written down.
