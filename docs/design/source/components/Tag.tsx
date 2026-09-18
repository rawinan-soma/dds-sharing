/*
  Tag — the state of a Request, and nothing else.

  Copied from the Lunagraph project `dds-sharing`. See docs/design/system.md.

  Filled: ink on its own wash. The four tones are the whole state vocabulary,
  and none of them is green, because green means "you chose this".

  pending  a person is being waited on
  ready    there is something here you can act on
  failed   broken
  inert    nothing to do, whether queued, running or finished

  A Tag always carries a word. The colour is never the only signal.

  For a value the Requester chose (a province in a region), use Chip. The two
  must not look alike: a Tag reports what the system is doing, a Chip lists what
  was asked for.
*/

type Tone = "pending" | "ready" | "failed" | "inert";
type Size = "sm" | "md";

const tones: Record<Tone, string> = {
  pending: "bg-pending-wash text-pending",
  ready: "bg-ready-wash text-ready",
  failed: "bg-failed-wash text-failed",
  inert: "bg-inert-wash text-inert",
};

const sizes: Record<Size, string> = {
  sm: "px-2 py-1 text-xs",
  md: "px-3 py-1 text-sm",
};

export function Tag({
  tone,
  size = "sm",
  children,
}: {
  tone: Tone;
  size?: Size;
  children: React.ReactNode;
}) {
  return (
    <span className={["inline-block font-semibold", tones[tone], sizes[size]].join(" ")}>
      {children}
    </span>
  );
}

export default Tag;
