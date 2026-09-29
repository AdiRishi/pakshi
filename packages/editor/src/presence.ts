import type { Peer } from "@repo/contracts/live";

import { type FieldTarget, useEditorState, useServices } from "./context.tsx";

/** How many colors tell people apart. Studio's theme defines `--presence-1` to `--presence-6`. */
export const presenceColorCount = 6;

/** The color a person always has, from 1 to `presenceColorCount`, so they look the same to everyone. */
export const presenceColor = (person: string) => {
  let hash = 0;
  for (const char of person) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return (hash % presenceColorCount) + 1;
};

/** Someone else editing the draft, with every connection they have open merged into one. */
export interface Participant {
  readonly id: string;
  readonly name: string;
  readonly color: number;
  /** Where they are, in words, such as "Typing in Heading" or "On another page". */
  readonly where: string;
  readonly typing: boolean;
}

const samePeers = (a: ReadonlyArray<Peer>, b: ReadonlyArray<Peer>) =>
  a.length === b.length && a.every((peer, index) => peer === b[index]);

const sameParticipants = (a: ReadonlyArray<Participant>, b: ReadonlyArray<Participant>) =>
  a.length === b.length &&
  a.every((participant, index) => {
    const other = b[index];
    return (
      other !== undefined &&
      participant.id === other.id &&
      participant.name === other.name &&
      participant.where === other.where &&
      participant.typing === other.typing
    );
  });

/** The initials of a name, for an avatar. */
export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter((part) => part.length > 0)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

/** Everyone else editing the draft, one entry per person, with where each of them is. */
export const useParticipants = (): ReadonlyArray<Participant> => {
  const { definitions } = useServices();
  return useEditorState(({ peers, page, view }) => {
    const people = new Map<string, Participant>();
    for (const peer of peers) {
      const presence = peer.presence;
      const focus = presence?.page === page ? presence.focus : null;
      const holder =
        focus === null ? undefined : focus.target === "site" ? view.parts : view.pages[page];
      const block = focus === null ? undefined : holder?.blocks[focus.block];
      const contract = block === undefined ? undefined : definitions.get(block.type);
      const [fieldName] = focus?.path ?? [];
      const field = fieldName === undefined ? undefined : contract?.fields[fieldName];
      const typing = presence?.typing === true && presence.page === page;
      const where =
        presence === null
          ? "Opening the draft"
          : presence.page !== page
            ? "On another page"
            : field !== undefined
              ? `${typing ? "Typing in" : "On"} ${field.title}`
              : contract !== undefined
                ? `On ${contract.title}`
                : "On this page";
      const known = people.get(peer.person.id);
      // Someone typing shows as typing, whichever of their windows it's in.
      if (known === undefined || (typing && !known.typing))
        people.set(peer.person.id, {
          id: peer.person.id,
          name: peer.person.name,
          color: presenceColor(peer.person.id),
          where,
          typing,
        });
    }
    return Array.from(people.values()).toSorted((a, b) => a.name.localeCompare(b.name));
  }, sameParticipants);
};

const sameField = (focus: Peer["presence"], field: FieldTarget) => {
  const path = focus?.focus?.path;
  return (
    focus?.focus?.target === field.target &&
    focus.focus.block === field.block &&
    path !== undefined &&
    path.length === field.path.length &&
    path.every((step, index) => step === field.path[index])
  );
};

/** The people on one field of the page being edited. */
export const useFieldPeers = (field: FieldTarget) => {
  const page = useEditorState((state) => state.page);
  return useEditorState(
    (state) =>
      state.peers.filter((peer) => peer.presence?.page === page && sameField(peer.presence, field)),
    samePeers,
  );
};
