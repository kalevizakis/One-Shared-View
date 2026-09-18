"use client";

import { useRouter } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ANY_VALUE, ENTITY_OPTIONS } from "@/lib/domain/audit";
import type { Profile } from "@/types/database";

interface AuditFiltersProps {
  entity: string;
  actor: string;
  people: Profile[];
}

export function AuditFilters({ entity, actor, people }: AuditFiltersProps) {
  const router = useRouter();

  function apply(next: { entity?: string; actor?: string }) {
    const params = new URLSearchParams();
    const entityValue = next.entity ?? entity;
    const actorValue = next.actor ?? actor;
    if (entityValue && entityValue !== ANY_VALUE)
      params.set("entity", entityValue);
    if (actorValue && actorValue !== ANY_VALUE) params.set("actor", actorValue);
    const query = params.toString();
    router.push(query ? `/audit?${query}` : "/audit");
  }

  const filtered = entity !== ANY_VALUE || actor !== ANY_VALUE;

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="space-y-1.5">
        <Label htmlFor="audit-entity">Record type</Label>
        <Select
          value={entity}
          onValueChange={(value) => apply({ entity: value })}
        >
          <SelectTrigger id="audit-entity" className="w-[210px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ENTITY_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="audit-actor">Changed by</Label>
        <Select value={actor} onValueChange={(value) => apply({ actor: value })}>
          <SelectTrigger id="audit-actor" className="w-[210px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY_VALUE}>Anyone</SelectItem>
            {people.map((person) => (
              <SelectItem key={person.id} value={person.id}>
                {person.display_name} ({person.ntid})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {filtered ? (
        <Button variant="ghost" onClick={() => router.push("/audit")}>
          Clear filters
        </Button>
      ) : null}
    </div>
  );
}
