"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowUpRight, ChevronDown, Clock } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { HealthBadge } from "@/components/shared/health-badge";
import { cn } from "@/lib/utils";
import {
  HEALTH_LABEL,
  IMPACT_LABEL,
  LIFECYCLE_LABEL,
  formatShortDate,
  isOverdue,
  isStale,
  relativeDay,
} from "@/lib/domain/status";
import type {
  HealthStatus,
  LifecycleStatus,
  Profile,
  ProjectWithContext,
} from "@/types/database";

type HealthFilter = "all" | HealthStatus | "missing";
type FreshnessFilter = "all" | "fresh" | "stale" | "missing";

const LIFECYCLE_STATUSES: LifecycleStatus[] = [
  "proposed",
  "active",
  "on_hold",
  "complete",
  "cancelled",
];

interface ProjectTableProps {
  projects: ProjectWithContext[];
  owners: Profile[];
}

export function ProjectTable({ projects, owners }: ProjectTableProps) {
  const [health, setHealth] = useState<HealthFilter>("all");
  const [freshness, setFreshness] = useState<FreshnessFilter>("all");
  const [ownerId, setOwnerId] = useState<string>("all");
  const [lifecycleStatuses, setLifecycleStatuses] = useState<
    Set<LifecycleStatus>
  >(() => new Set(["proposed", "active", "on_hold"]));

  const filtered = useMemo(() => {
    return projects.filter((project) => {
      const update = project.currentUpdate;
      const submitted = update?.status === "submitted";
      const effectiveHealth = submitted ? update.health : project.current_health;

      if (!lifecycleStatuses.has(project.lifecycle_status)) return false;

      if (health === "missing" && submitted) return false;
      if (health !== "all" && health !== "missing") {
        if (!submitted || effectiveHealth !== health) return false;
      }

      if (freshness === "missing" && submitted) return false;
      if (freshness === "fresh") {
        if (!submitted || isStale(update.submitted_at)) return false;
      }
      if (freshness === "stale") {
        if (!submitted || !isStale(update.submitted_at)) return false;
      }

      if (ownerId !== "all" && project.owner_profile_id !== ownerId) return false;

      return true;
    });
  }, [projects, lifecycleStatuses, health, freshness, ownerId]);

  const healthChips: { value: HealthFilter; label: string }[] = [
    { value: "all", label: "All" },
    { value: "on_track", label: HEALTH_LABEL.on_track },
    { value: "at_risk", label: HEALTH_LABEL.at_risk },
    { value: "blocked", label: HEALTH_LABEL.blocked },
    { value: "missing", label: "No update" },
  ];

  function toggleLifecycleStatus(status: LifecycleStatus, checked: boolean) {
    setLifecycleStatuses((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(status);
      } else {
        next.delete(status);
      }
      return next;
    });
  }

  return (
    <section aria-labelledby="all-projects-heading">
      <div className="mb-3 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <h2 id="all-projects-heading" className="text-lg font-bold">
          All projects
        </h2>

        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <div
            className="flex flex-wrap gap-1.5"
            role="group"
            aria-label="Filter by project health"
          >
            {healthChips.map((chip) => (
              <button
                key={chip.value}
                type="button"
                onClick={() => setHealth(chip.value)}
                aria-pressed={health === chip.value}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  health === chip.value
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                {chip.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="w-[150px] justify-between"
                  aria-label={`Filter by project status; ${lifecycleStatuses.size} selected`}
                >
                  Status ({lifecycleStatuses.size})
                  <ChevronDown className="size-4 opacity-50" aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-[190px]">
                <DropdownMenuLabel>Project status</DropdownMenuLabel>
                {LIFECYCLE_STATUSES.map((status) => (
                  <DropdownMenuCheckboxItem
                    key={status}
                    checked={lifecycleStatuses.has(status)}
                    onCheckedChange={(checked) =>
                      toggleLifecycleStatus(status, checked === true)
                    }
                    onSelect={(event) => event.preventDefault()}
                  >
                    {LIFECYCLE_LABEL[status]}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <Select
              value={freshness}
              onValueChange={(value) => setFreshness(value as FreshnessFilter)}
            >
              <SelectTrigger
                className="w-[150px]"
                aria-label="Filter by update freshness"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any freshness</SelectItem>
                <SelectItem value="fresh">Current</SelectItem>
                <SelectItem value="stale">Stale</SelectItem>
                <SelectItem value="missing">Missing</SelectItem>
              </SelectContent>
            </Select>

            {owners.length > 0 ? (
              <Select value={ownerId} onValueChange={setOwnerId}>
                <SelectTrigger
                  className="w-[150px]"
                  aria-label="Filter by project owner"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any owner</SelectItem>
                  {owners.map((owner) => (
                    <SelectItem key={owner.id} value={owner.id}>
                      {owner.display_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-secondary hover:bg-secondary">
              <TableHead className="min-w-[180px] text-[0.6875rem] font-bold tracking-wide uppercase">
                Project
              </TableHead>
              <TableHead className="min-w-[220px] text-[0.6875rem] font-bold tracking-wide uppercase">
                Expected value
              </TableHead>
              <TableHead className="min-w-[260px] text-[0.6875rem] font-bold tracking-wide uppercase">
                Executive summary
              </TableHead>
              <TableHead className="text-[0.6875rem] font-bold tracking-wide uppercase">
                Owner
              </TableHead>
              <TableHead className="text-[0.6875rem] font-bold tracking-wide uppercase">
                Health
              </TableHead>
              <TableHead className="text-[0.6875rem] font-bold tracking-wide uppercase">
                Impact
              </TableHead>
              <TableHead className="text-[0.6875rem] font-bold tracking-wide uppercase">
                Next milestone
              </TableHead>
              <TableHead className="text-[0.6875rem] font-bold tracking-wide uppercase">
                Updated
              </TableHead>
              <TableHead className="w-10">
                <span className="sr-only">Open</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={9}
                  className="py-12 text-center text-sm text-muted-foreground"
                >
                  No projects match these filters.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((project) => {
                const update = project.currentUpdate;
                const submitted = update?.status === "submitted";
                const stale = submitted && isStale(update.submitted_at);
                const milestoneOverdue = isOverdue(
                  project.nextMilestone?.target_date ?? null,
                );

                return (
                  <TableRow key={project.id}>
                    <TableCell className="max-w-[40ch] whitespace-normal align-top">
                      <Link
                        href={`/projects/${project.id}`}
                        className="inline-block max-w-[40ch] whitespace-normal [overflow-wrap:anywhere] font-semibold text-foreground hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      >
                        {project.name}
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-[320px] whitespace-normal align-top text-sm leading-5 text-muted-foreground">
                      {project.expected_value || "—"}
                    </TableCell>
                    <TableCell className="max-w-[360px] whitespace-normal align-top text-sm leading-5 text-muted-foreground">
                      {project.executive_summary || "—"}
                    </TableCell>
                    <TableCell className="align-top text-sm">
                      {project.owner?.display_name ?? "Unassigned"}
                      {project.owner ? (
                        <span className="mt-1 block text-[0.6875rem] text-muted-foreground">
                          {project.owner.ntid.toUpperCase()}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="align-top">
                      <HealthBadge
                        health={submitted ? update.health : project.current_health}
                      />
                      {!submitted ? (
                        <span className="mt-1.5 flex items-center gap-1 text-[0.6875rem] font-semibold text-status-at-risk">
                          <AlertTriangle className="size-3" aria-hidden />
                          Update missing
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="align-top text-sm">
                      {submitted && update.impact
                        ? IMPACT_LABEL[update.impact]
                        : "—"}
                    </TableCell>
                    <TableCell className="align-top text-sm">
                      {project.nextMilestone?.name ?? "—"}
                      {project.nextMilestone ? (
                        <span
                          className={cn(
                            "mt-1 block text-[0.6875rem]",
                            milestoneOverdue
                              ? "font-semibold text-status-blocked"
                              : "text-muted-foreground",
                          )}
                        >
                          {milestoneOverdue
                            ? "Overdue"
                            : formatShortDate(project.nextMilestone.target_date)}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="align-top text-sm">
                      {submitted ? relativeDay(update.submitted_at) : "—"}
                      {stale ? (
                        <span className="mt-1 flex items-center gap-1 text-[0.6875rem] font-semibold text-status-at-risk">
                          <Clock className="size-3" aria-hidden />
                          Stale
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="align-top">
                      <Button
                        asChild
                        variant="ghost"
                        size="icon"
                        className="size-8"
                      >
                        <Link
                          href={`/projects/${project.id}`}
                          aria-label={`Open ${project.name}`}
                        >
                          <ArrowUpRight className="size-4" />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <p className="mt-2.5 text-xs text-muted-foreground" aria-live="polite">
        Showing {filtered.length} of {projects.length} projects.
      </p>
    </section>
  );
}
