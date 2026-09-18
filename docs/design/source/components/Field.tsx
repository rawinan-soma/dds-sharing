/*
  Field — a label, a value box, and at most one line beneath it.

  Copied from the Lunagraph project `dds-sharing`. See docs/design/system.md.

  The design shows fields filled in, so this renders the value as text. The
  Angular component renders a real input with the same box, the same label
  position and the same message slot.

  One line beneath, never two: an error replaces the hint rather than stacking
  on it, because a Requester reading two lines under one box reads neither.

  onCard flips the fill so the box always contrasts what it sits on: bg-card on
  the page, bg-background inside a card (sign in, dialogs).

  invalid marks the box without a message of its own, for fields that fail
  together and share one message below them: the two dates of a range that is
  too long are both wrong, and saying so twice would be noise.
*/

export function Field({
  label,
  value,
  placeholder,
  hint,
  error,
  figure = false,
  code = false,
  onCard = false,
  invalid = false,
  width,
}: {
  label: string;
  value?: string;
  placeholder?: string;
  hint?: string;
  error?: string;
  figure?: boolean;
  code?: boolean;
  onCard?: boolean;
  invalid?: boolean;
  width?: number;
}) {
  const box = [
    "mt-1 border px-3 py-2",
    error || invalid ? "border-failed" : "border-border-strong",
    onCard ? "bg-background" : "bg-card",
    figure || code ? "figure" : "",
    code ? "tracking-widest" : "",
    value ? "" : "text-muted-foreground",
  ].join(" ");

  return (
    <div style={width ? { width } : undefined}>
      <label className="text-sm text-muted-foreground">{label}</label>
      <div className={box}>{value ?? placeholder}</div>
      {error ? (
        <p className="text-failed mt-1 text-sm">{error}</p>
      ) : hint ? (
        <p className="mt-2 text-sm text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

export default Field;
