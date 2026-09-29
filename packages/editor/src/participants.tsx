import { Avatar, AvatarFallback } from "@repo/ui/components/avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@repo/ui/components/tooltip";
import { cn } from "cn";

import type { FieldTarget } from "./context.tsx";
import { initials, presenceColor, useFieldPeers, useParticipants } from "./presence.ts";

/** Each presence color as a background with text on it, in order. Tailwind finds classes only when they're written out. */
const colorClasses = [
  "bg-presence-1 text-presence-foreground",
  "bg-presence-2 text-presence-foreground",
  "bg-presence-3 text-presence-foreground",
  "bg-presence-4 text-presence-foreground",
  "bg-presence-5 text-presence-foreground",
  "bg-presence-6 text-presence-foreground",
] as const;

const colorClass = (color: number) => colorClasses[color - 1];

/** Everyone else editing the draft, as avatars in their colors that say where each person is. */
export function EditorParticipants() {
  const participants = useParticipants();
  if (participants.length === 0) return null;
  return (
    <ul aria-label="Also editing this draft" className="flex -space-x-2">
      {participants.map((participant) => (
        <li key={participant.id}>
          <Tooltip>
            <TooltipTrigger render={<Avatar className="ring-2 ring-card" />}>
              <AvatarFallback
                aria-hidden
                className={cn("text-xs font-semibold", colorClass(participant.color))}
              >
                {initials(participant.name)}
              </AvatarFallback>
            </TooltipTrigger>
            <TooltipContent>
              {participant.name}: {participant.where.toLowerCase()}
            </TooltipContent>
          </Tooltip>
          <span className="sr-only">
            {participant.name}, {participant.where.toLowerCase()}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Who else is on a field, shown beside its control in the settings panel. */
export function FieldPresence(props: { readonly field: FieldTarget }) {
  const [peer] = useFieldPeers(props.field);
  if (peer === undefined) return null;
  const firstName = peer.person.name.split(/\s+/)[0] ?? peer.person.name;
  return (
    <span className="flex items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
      <span
        aria-hidden
        className={cn("size-2 rounded-full", colorClass(presenceColor(peer.person.id)))}
      />
      {peer.presence?.typing === true ? `${firstName} is typing` : `${firstName} is here`}
    </span>
  );
}
