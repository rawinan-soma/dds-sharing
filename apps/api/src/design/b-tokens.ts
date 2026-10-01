// The B design system's colour tokens (docs/design/system.md "Colour" and
// "State"), the one copy the API's own HTML reads: the server-rendered pages
// and the emails load no app stylesheet, so they inline these values.
// `b-tokens.spec.ts` holds this file to system.md's tables. The retired
// `on-dark` pair is left out, as system.md asks.
export const B = {
  background: '#e4e6ea',
  card: '#ffffff',
  foreground: '#1b1d24',
  mutedForeground: '#5f6470',
  border: '#dfe1e6',
  input: '#7a7e88',
  primary: '#3b5bfd',
  primaryHover: '#3050e8',
  primaryWash: '#eef1ff',
  primaryForeground: '#ffffff',
  /** Text on a `foreground` panel; no API page draws one yet. */
  inverse: '#ffffff',
  inverseMuted: '#c9ccd3',
  success: '#1a7a4f',
  successWash: '#e6f4ec',
  pending: '#8a5a00',
  pendingWash: '#fdf3dc',
  failed: '#c42b3a',
  failedWash: '#fbe9eb',
  inert: '#5f6470',
  inertWash: '#eceef2',
} as const;

// Values the screens draw that system.md names no token for.
export const DRAWN = {
  /** The grey of the queue band and the collection page's tiles. */
  bandGrey: '#f7f8fa',
  /** The white mark or tick on a solid state fill. */
  onStateFill: '#ffffff',
} as const;
