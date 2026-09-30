/*
  Chip — a value that belongs to what the Requester chose. Used for the
  provinces a health region expands to.

  Locked from Requester-form variant B (2026-09-30). See docs/design/system.md.

  Card on a hairline, never a wash, so it cannot be mistaken for a Tag. A Tag
  reports what the system is doing to a Request; a Chip lists part of what was
  asked for. The hairline is enough here because a chip is not a control; the
  solid primary stays reserved for the choice itself (the selected region).

  Not interactive. A region's provinces are its expansion, not a list to edit.
*/

export function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="border-border bg-card text-foreground inline-block rounded-sm border px-2 py-0.5 text-xs">
      {children}
    </span>
  );
}

export default Chip;
