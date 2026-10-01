/*
  Field — a label, a value box, and at most one line beneath it.

  Locked from Requester-form variant B (2026-09-30). See docs/design/system.md.

  The design shows fields filled in, so this renders the value as text. The
  Angular component renders a real input with the same box, the same label
  position and the same message slot.

  One line beneath, never two: an error replaces the hint rather than stacking
  on it, because a Requester reading two lines under one box reads neither.

  The label is 14/500 foreground with the required mark in primary. The box is
  card on an input edge (3:1 on page and card); focus adds the primary edge and
  halo through the unlayered .field-box rule in globals.css.

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
  required = false,
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
  required?: boolean;
  invalid?: boolean;
  width?: number;
}) {
  const box = [
    "field-box mt-1.5 flex h-11 items-center rounded-md border bg-card px-3.5 text-sm",
    error || invalid ? "border-failed" : "border-input",
    figure || code ? "figure" : "",
    code ? "tracking-widest" : "",
    value ? "" : "text-muted-foreground",
  ].join(" ");

  return (
    <div style={width ? { width } : undefined}>
      <label className="text-sm font-medium text-foreground">
        {label}
        {required ? <span className="text-primary">*</span> : null}
      </label>
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
