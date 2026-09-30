/*
  Segmented — a small closed set of mutually exclusive choices, where seeing all
  of them at once is the point. Used once, for Area: whole country, one
  province, one health region. Never both, never two.

  Locked from Requester-form variant B (2026-09-30). See docs/design/system.md.

  Separate small buttons, not one joined bar. The selected segment is a mode,
  so it takes the wash and a primary edge, not the solid fill: the solid
  primary belongs to the answer, the selected cell on the region map.
*/

export function Segmented({
  options,
  value,
}: {
  options: { value: string; label: string; disabled?: boolean }[];
  value: string;
}) {
  return (
    <div role="radiogroup" className="flex w-fit gap-2">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={option.disabled}
            className={[
              "rounded-sm border px-3.5 py-1.5 text-sm transition-colors",
              "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary",
              "disabled:cursor-not-allowed disabled:opacity-45",
              selected
                ? "border-primary bg-primary-wash text-primary font-semibold"
                : "border-input bg-card text-foreground hover:bg-primary-wash",
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
