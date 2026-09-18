/*
  Chip — a value that belongs to what the Requester chose. Used for the
  provinces a health region expands to.

  Copied from the Lunagraph project `dds-sharing`. See docs/design/system.md.

  Outlined, never filled, so it cannot be mistaken for a Tag. A Tag reports what
  the system is doing to a Request; a Chip lists part of what was asked for. The
  primary colour is right here, because a chip is part of the selection, but it
  is the outline weight of it: the solid fill stays reserved for the choice
  itself (the selected region, the selected group).

  Not interactive. A region's provinces are its expansion, not a list to edit.
*/

export function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="border-primary text-primary inline-block border px-3 py-1 text-sm">
      {children}
    </span>
  );
}

export default Chip;
