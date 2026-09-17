/*
  Segmented — a small closed set of mutually exclusive choices, where seeing all
  of them at once is the point. Used once, for Area: whole country, one
  province, one health region. Never both, never two.

  Copied from the Lunagraph project `dds-sharing`. See docs/design/system.md.

  The selected segment is the only saturated thing in the control, because in
  this system the solid colour means "you chose this". Hover tints an
  unselected segment with land, never with the accent: a hover is not a choice.

  Dividers are border-border-strong and the outer frame is the same, so the
  control reads as one object rather than three buttons that happen to touch.
*/

export function Segmented({
  options,
  value,
}: {
  options: { value: string; label: string; disabled?: boolean }[];
  value: string;
}) {
  return (
    <div role="radiogroup" className="border-border-strong flex w-fit border">
      {options.map((option, index) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={option.disabled}
            className={[
              "px-5 py-2 text-sm transition-colors",
              "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary",
              "disabled:cursor-not-allowed disabled:opacity-45",
              index > 0 ? "border-border-strong border-l" : "",
              selected
                ? "bg-primary text-primary-foreground font-semibold"
                : "hover:bg-land active:bg-land-strong",
            ].join(" ")}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export default Segmented;
