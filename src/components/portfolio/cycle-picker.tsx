"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CYCLE_STATUS_LABEL } from "@/lib/domain/status";
import type { ReportingCycle } from "@/types/database";

interface CyclePickerProps {
  cycles: ReportingCycle[];
  selectedId: string;
  basePath?: string;
}

export function CyclePicker({ cycles, selectedId, basePath }: CyclePickerProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function handleChange(cycleId: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("cycle", cycleId);
    router.push(`${basePath ?? ""}?${params.toString()}`);
  }

  return (
    <Select value={selectedId} onValueChange={handleChange}>
      <SelectTrigger className="w-full sm:w-[210px]" aria-label="Reporting cycle">
        <SelectValue placeholder="Select a reporting period" />
      </SelectTrigger>
      <SelectContent>
        {cycles.map((cycle) => (
          <SelectItem key={cycle.id} value={cycle.id}>
            {cycle.name} · {CYCLE_STATUS_LABEL[cycle.status]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
