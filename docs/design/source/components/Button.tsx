/*
  Button — three variants, two sizes. Nothing else.

  Copied from the Lunagraph project `dds-sharing`. React here because that is
  what the design tool renders; the Angular component must carry the same
  variants, the same two sizes and the same states. See docs/design/system.md.

  primary    the one action this screen exists for. One per screen, and it is
             the only place the saturated colour appears on an action.
  secondary  a real action that is not the point of the screen: reject,
             resend, re-run, refresh, an alert outcome.
  quiet      disclosure and dismissal. Reveals something or closes something,
             never changes a record.

  Sizes are md and lg, and lg is reserved for the action a screen is named
  after. There is deliberately no sm: five paddings is what this component was
  written to end. The first request for a fourth size is a layout problem.

  Disabled is not decoration here. On the in-flight list, resend and re-run are
  disabled while a job is queued or running, and the row states why in words.
  A disabled button without that sentence beside it is a bug.

  loading replaces the label with its in-progress form, passed in loadingLabel
  (ส่งคำขอ becomes กำลังส่ง…), and makes the button inert while it waits. No
  spinner: the words say what is happening, and every round trip in this
  service is short. The button keeps its variant and its width, so nothing
  around it moves. It is aria-busy, and stays focusable so focus is not lost
  mid-press; the second press is ignored rather than sent twice.
*/

type Variant = "primary" | "secondary" | "quiet";
type Size = "md" | "lg";

const base =
  "inline-flex items-center justify-center font-sans transition-colors " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary " +
  "disabled:cursor-not-allowed disabled:opacity-45";

const variants: Record<Variant, string> = {
  primary:
    "bg-primary text-primary-foreground font-semibold " +
    "hover:bg-primary-hover active:bg-primary-hover " +
    "disabled:hover:bg-primary",
  secondary:
    "border border-border-strong text-foreground " +
    "hover:bg-land active:bg-land-strong " +
    "disabled:hover:bg-transparent",
  // Framed in muted-foreground (5.69:1), not the hairline border colour
  // (1.39:1): the frame is a quiet button's only boundary, so it must meet
  // WCAG 1.4.11's 3:1. Still visibly lighter than secondary's ink frame.
  quiet:
    "border border-muted-foreground text-muted-foreground " +
    "hover:bg-land hover:text-foreground active:bg-land-strong " +
    "disabled:hover:bg-transparent",
};

const loadingVariants: Record<Variant, string> = {
  primary: "bg-primary-hover text-primary-foreground font-semibold cursor-progress",
  secondary: "border border-border-strong bg-land text-foreground cursor-progress",
  quiet: "border border-muted-foreground bg-land text-foreground cursor-progress",
};

const sizes: Record<Size, string> = {
  md: "px-5 py-2 text-sm",
  lg: "px-8 py-3 text-base",
};

export function Button({
  variant = "secondary",
  size = "md",
  fullWidth = false,
  disabled = false,
  loading = false,
  loadingLabel,
  children,
  ...rest
}: {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
  disabled?: boolean;
  loading?: boolean;
  loadingLabel?: string;
  children: React.ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-busy={loading || undefined}
      className={[
        base,
        loading ? loadingVariants[variant] : variants[variant],
        sizes[size],
        fullWidth ? "w-full" : "",
      ].join(" ")}
      {...rest}
    >
      {loading && loadingLabel ? loadingLabel : children}
    </button>
  );
}

export default Button;
