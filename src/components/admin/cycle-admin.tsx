"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { deleteCycle, saveCycle } from "@/app/actions/admin";
import { CYCLE_STATUS_LABEL, formatDate } from "@/lib/domain/status";
import type {
  CycleStatus,
  Portfolio,
  ReportingCadence,
  ReportingCycle,
} from "@/types/database";

interface CycleAdminProps {
  cycles: ReportingCycle[];
  portfolio: Portfolio;
}

interface Draft {
  id: string | null;
  name: string;
  cadence: ReportingCadence;
  startsAt: string;
  dueAt: string;
  closesAt: string;
  status: CycleStatus;
}

function toDateInput(value: string): string {
  return value.slice(0, 10);
}

export function CycleAdmin({ cycles, portfolio }: CycleAdminProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ReportingCycle | null>(null);

  function edit(cycle: ReportingCycle) {
    setDraft({
      id: cycle.id,
      name: cycle.name,
      cadence: cycle.cadence,
      startsAt: toDateInput(cycle.starts_at),
      dueAt: toDateInput(cycle.due_at),
      closesAt: toDateInput(cycle.closes_at),
      status: cycle.status,
    });
  }

  function save() {
    if (!draft) return;
    const formData = new FormData();
    if (draft.id) formData.set("id", draft.id);
    formData.set("portfolioId", portfolio.id);
    formData.set("name", draft.name);
    formData.set("cadence", draft.cadence);
    formData.set("startsAt", draft.startsAt);
    formData.set("dueAt", draft.dueAt);
    formData.set("closesAt", draft.closesAt);
    formData.set("status", draft.status);

    startTransition(async () => {
      const result = await saveCycle(formData);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? "Saved.");
      setDraft(null);
      router.refresh();
    });
  }

  function canDelete(cycle: ReportingCycle): boolean {
    const isHistorical =
      cycle.status === "locked" || cycle.status === "closed";
    const hasNewerCycle = cycles.some(
      (candidate) =>
        candidate.portfolio_id === cycle.portfolio_id &&
        new Date(candidate.due_at).getTime() >
          new Date(cycle.due_at).getTime(),
    );
    return isHistorical && hasNewerCycle;
  }

  function remove() {
    if (!deleteTarget) return;

    const formData = new FormData();
    formData.set("id", deleteTarget.id);

    startTransition(async () => {
      const result = await deleteCycle(formData);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? "Reporting cycle deleted.");
      setDeleteTarget(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">Reporting cycles</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Locking a cycle freezes its updates — only an administrator can reopen
            it. Older locked or closed cycles can be permanently deleted.
          </p>
        </div>
        <Button
          onClick={() =>
            setDraft({
              id: null,
              name: "",
              cadence: "weekly",
              startsAt: "",
              dueAt: "",
              closesAt: "",
              status: "upcoming",
            })
          }
          disabled={Boolean(draft)}
        >
          <Plus className="size-4" />
          Add cycle
        </Button>
      </div>

      {draft ? (
        <form
          className="rounded-xl border border-border bg-card p-5"
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          <h3 className="text-base font-bold">
            {draft.id ? "Edit reporting cycle" : "New reporting cycle"}
          </h3>

          <fieldset disabled={pending} className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="cycle-name">Cycle name</Label>
              <Input
                id="cycle-name"
                value={draft.name}
                onChange={(event) =>
                  setDraft({ ...draft, name: event.target.value })
                }
                placeholder="Week ending 2 October 2026"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="cycle-start">Starts</Label>
              <Input
                id="cycle-start"
                type="date"
                value={draft.startsAt}
                onChange={(event) =>
                  setDraft({ ...draft, startsAt: event.target.value })
                }
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="cycle-due">Submission deadline</Label>
              <Input
                id="cycle-due"
                type="date"
                value={draft.dueAt}
                onChange={(event) =>
                  setDraft({ ...draft, dueAt: event.target.value })
                }
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="cycle-close">Closes</Label>
              <Input
                id="cycle-close"
                type="date"
                value={draft.closesAt}
                onChange={(event) =>
                  setDraft({ ...draft, closesAt: event.target.value })
                }
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="cycle-status">Status</Label>
              <Select
                value={draft.status}
                onValueChange={(value) =>
                  setDraft({ ...draft, status: value as CycleStatus })
                }
              >
                <SelectTrigger id="cycle-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(CYCLE_STATUS_LABEL) as CycleStatus[]).map(
                    (value) => (
                      <SelectItem key={value} value={value}>
                        {CYCLE_STATUS_LABEL[value]}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="cycle-cadence">Cadence</Label>
              <Select
                value={draft.cadence}
                onValueChange={(value) =>
                  setDraft({ ...draft, cadence: value as ReportingCadence })
                }
              >
                <SelectTrigger id="cycle-cadence">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </fieldset>

          <div className="mt-5 flex gap-2">
            <Button type="submit" disabled={pending}>
              {pending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              Save cycle
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setDraft(null)}
              disabled={pending}
            >
              <X className="size-4" />
              Cancel
            </Button>
          </div>
        </form>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cycle</TableHead>
              <TableHead>Start date</TableHead>
              <TableHead>Deadline</TableHead>
              <TableHead>Closes</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {cycles.map((cycle) => (
              <TableRow key={cycle.id}>
                <TableCell className="font-medium">{cycle.name}</TableCell>
                <TableCell className="text-sm">
                  {formatDate(cycle.starts_at)}
                </TableCell>
                <TableCell className="text-sm">{formatDate(cycle.due_at)}</TableCell>
                <TableCell className="text-sm">
                  {formatDate(cycle.closes_at)}
                </TableCell>
                <TableCell className="text-sm">
                  {CYCLE_STATUS_LABEL[cycle.status]}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => edit(cycle)}
                      disabled={pending}
                    >
                      Edit
                    </Button>
                    {canDelete(cycle) ? (
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => setDeleteTarget(cycle)}
                        disabled={pending || Boolean(draft)}
                      >
                        <Trash2 className="size-4" />
                        Delete
                      </Button>
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open && !pending) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {deleteTarget?.name ?? "reporting cycle"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone. All project updates, reminder records, and
              generated reports for this cycle will be permanently deleted.
              Decisions will remain, but will no longer link to their source
              update.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <Button variant="destructive" onClick={remove} disabled={pending}>
              {pending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Trash2 className="size-4" />
              )}
              {pending ? "Deleting…" : "Delete cycle"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
