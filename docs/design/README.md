# Design

The visual design lives in **[`prototypes/dds-sharing-ui/`](../../prototypes/dds-sharing-ui/)**
as runnable HTML and CSS, not as an image export. Open its `index.html`.

That choice is deliberate. §16.4 asked for a wireframe; a PNG of a wireframe
would be a second artefact for an implementer to translate, and a Figma link
would rot. What #43 and #47 need is markup they can lift, class names that map to
components, and a `data-i18n` attribute on every text node naming the
`messages/th.json` key that feeds it.

The decisions it settles are recorded in
**[ADR 0009](../adr/0009-the-visual-layer.md)** — no component library, one
shared token stylesheet, IBM Plex Sans Thai self-hosted, WCAG 2.2 AA.

New Thai copy the design needed is **proposed, not landed**, in
`prototypes/dds-sharing-ui/messages/th.proposed.json`. §16.3 makes copy
normative; a design session does not get to change it.
