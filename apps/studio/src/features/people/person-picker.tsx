import type { Person } from "@repo/contracts/studio";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@repo/ui/components/command";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useDeferredValue, useState } from "react";

import { searchPeople } from "../sites/functions";

/**
 * Finds people in the organization by name or email, and hands the one
 * chosen to `onPick`. People already chosen aren't offered again.
 */
export function PersonPicker(props: {
  readonly label: string;
  readonly exclude: ReadonlyArray<string>;
  readonly onPick: (person: Person) => void;
}) {
  const [search, setSearch] = useState("");
  const deferred = useDeferredValue(search.trim());
  const found = useQuery({
    queryKey: ["people", deferred],
    queryFn: () => searchPeople({ data: { search: deferred } }),
    enabled: deferred !== "",
    placeholderData: keepPreviousData,
  });
  const people = (found.data ?? []).filter((person) => !props.exclude.includes(person.id));
  return (
    <Command shouldFilter={false} className="rounded-md border">
      <CommandInput
        aria-label={props.label}
        placeholder="Search by name or email"
        value={search}
        onValueChange={setSearch}
      />
      {/* The input controls the list, so the list is there even before a search. */}
      <CommandList>
        {deferred !== "" && (
          <CommandEmpty>{found.isFetching ? "Searching" : "No one matches."}</CommandEmpty>
        )}
        {deferred !== "" &&
          people.map((person) => (
            <CommandItem
              key={person.id}
              value={person.id}
              onSelect={() => {
                props.onPick(person);
                setSearch("");
              }}
            >
              <span className="flex flex-col">
                <span>{person.name}</span>
                <span className="text-xs text-muted-foreground">{person.email}</span>
              </span>
            </CommandItem>
          ))}
      </CommandList>
    </Command>
  );
}
