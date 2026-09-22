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
import { Switch } from "@/components/ui/switch";
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
import {
  addRosterPerson,
  clearProfileContact,
  deleteInactiveProfile,
  saveProfileAccess,
  saveProfileContact,
} from "@/app/actions/admin";
import { ROLE_DESCRIPTION, ROLE_LABEL } from "@/lib/domain/status";
import type {
  Profile,
  ProfileContact,
  ProfileDeletionEligibility,
  UserRole,
} from "@/types/database";

const ROLES = Object.keys(ROLE_LABEL) as UserRole[];

interface PeopleAdminProps {
  people: Profile[];
  contacts: Record<string, ProfileContact>;
  currentProfileId: string;
  deletionEligibility: Record<string, ProfileDeletionEligibility>;
}

export function PeopleAdmin({
  people,
  contacts,
  currentProfileId,
  deletionEligibility,
}: PeopleAdminProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  const [editingEmailFor, setEditingEmailFor] = useState<string | null>(null);
  const [emailDraft, setEmailDraft] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Profile | null>(null);
  const [newPerson, setNewPerson] = useState({
    ntid: "",
    displayName: "",
    jobTitle: "",
    email: "",
    role: "owner" as UserRole,
  });

  function updateAccess(person: Profile, role: UserRole, active: boolean) {
    const formData = new FormData();
    formData.set("id", person.id);
    formData.set("role", role);
    formData.set("active", active ? "on" : "");

    startTransition(async () => {
      const result = await saveProfileAccess(formData);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? "Access updated.");
      router.refresh();
    });
  }

  function addPerson() {
    const formData = new FormData();
    formData.set("ntid", newPerson.ntid);
    formData.set("displayName", newPerson.displayName);
    formData.set("jobTitle", newPerson.jobTitle);
    formData.set("email", newPerson.email);
    formData.set("role", newPerson.role);

    startTransition(async () => {
      const result = await addRosterPerson(formData);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? "Person added.");
      setNewPerson({
        ntid: "",
        displayName: "",
        jobTitle: "",
        email: "",
        role: "owner",
      });
      setAdding(false);
      router.refresh();
    });
  }

  function beginEditEmail(person: Profile) {
    setEditingEmailFor(person.id);
    setEmailDraft(contacts[person.id]?.email ?? "");
  }

  function saveEmail(person: Profile) {
    const formData = new FormData();
    formData.set("profileId", person.id);
    formData.set("email", emailDraft);

    startTransition(async () => {
      const result = await saveProfileContact(formData);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? "Reminder email saved.");
      setEditingEmailFor(null);
      setEmailDraft("");
      router.refresh();
    });
  }

  function clearEmail(person: Profile) {
    const formData = new FormData();
    formData.set("profileId", person.id);

    startTransition(async () => {
      const result = await clearProfileContact(formData);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? "Reminder email removed.");
      setEditingEmailFor(null);
      setEmailDraft("");
      router.refresh();
    });
  }

  function removePerson() {
    if (!deleteTarget) return;

    const formData = new FormData();
    formData.set("id", deleteTarget.id);

    startTransition(async () => {
      const result = await deleteInactiveProfile(formData);
      if (result.error) {
        toast.error(result.error);
        router.refresh();
        return;
      }
      toast.success(result.message ?? "Person removed from the roster.");
      if (editingEmailFor === deleteTarget.id) {
        setEditingEmailFor(null);
        setEmailDraft("");
      }
      setDeleteTarget(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">People and access</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Only NTIDs on this roster can sign in. Reminder emails are used for
            local draft reminders and stay off the broadly readable roster.
            Inactive people can be removed once no portfolio data references
            them.
          </p>
        </div>
        <Button onClick={() => setAdding(true)} disabled={adding}>
          <Plus className="size-4" />
          Add person
        </Button>
      </div>

      {adding ? (
        <form
          className="rounded-xl border border-border bg-card p-5"
          onSubmit={(event) => {
            event.preventDefault();
            addPerson();
          }}
        >
          <h3 className="text-base font-bold">Add to roster</h3>
          <fieldset disabled={pending} className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="new-ntid">NTID</Label>
              <Input
                id="new-ntid"
                value={newPerson.ntid}
                onChange={(event) =>
                  setNewPerson({
                    ...newPerson,
                    ntid: event.target.value.toLowerCase(),
                  })
                }
                autoComplete="off"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-name">Full name</Label>
              <Input
                id="new-name"
                value={newPerson.displayName}
                onChange={(event) =>
                  setNewPerson({ ...newPerson, displayName: event.target.value })
                }
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-title">Job title</Label>
              <Input
                id="new-title"
                value={newPerson.jobTitle}
                onChange={(event) =>
                  setNewPerson({ ...newPerson, jobTitle: event.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-email">Reminder email</Label>
              <Input
                id="new-email"
                type="email"
                value={newPerson.email}
                onChange={(event) =>
                  setNewPerson({
                    ...newPerson,
                    email: event.target.value.toLowerCase(),
                  })
                }
                placeholder="optional — needed for Notify"
                autoComplete="off"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="new-role">Role</Label>
              <Select
                value={newPerson.role}
                onValueChange={(value) =>
                  setNewPerson({ ...newPerson, role: value as UserRole })
                }
              >
                <SelectTrigger id="new-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((role) => (
                    <SelectItem key={role} value={role}>
                      {ROLE_LABEL[role]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {ROLE_DESCRIPTION[newPerson.role]}
              </p>
            </div>
          </fieldset>

          <div className="mt-5 flex gap-2">
            <Button type="submit" disabled={pending}>
              {pending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              Add person
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setAdding(false)}
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
              <TableHead>Name</TableHead>
              <TableHead>NTID</TableHead>
              <TableHead>Reminder email</TableHead>
              <TableHead>Registered</TableHead>
              <TableHead className="w-[190px]">Role</TableHead>
              <TableHead className="w-[130px]">Access</TableHead>
              <TableHead className="min-w-[190px]">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {people.map((person) => {
              const contact = contacts[person.id];
              const editing = editingEmailFor === person.id;
              const eligibility = deletionEligibility[person.id];

              return (
                <TableRow key={person.id}>
                  <TableCell>
                    <span className="font-medium">{person.display_name}</span>
                    {person.job_title ? (
                      <span className="block text-xs text-muted-foreground">
                        {person.job_title}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-sm">{person.ntid}</TableCell>
                  <TableCell className="min-w-[220px]">
                    {editing ? (
                      <div className="flex flex-col gap-2">
                        <Input
                          type="email"
                          value={emailDraft}
                          onChange={(event) =>
                            setEmailDraft(event.target.value.toLowerCase())
                          }
                          aria-label={`Reminder email for ${person.display_name}`}
                          disabled={pending}
                          autoFocus
                        />
                        <div className="flex flex-wrap gap-1.5">
                          <Button
                            size="sm"
                            type="button"
                            disabled={pending || !emailDraft.trim()}
                            onClick={() => saveEmail(person)}
                          >
                            Save
                          </Button>
                          <Button
                            size="sm"
                            type="button"
                            variant="ghost"
                            disabled={pending}
                            onClick={() => {
                              setEditingEmailFor(null);
                              setEmailDraft("");
                            }}
                          >
                            Cancel
                          </Button>
                          {contact ? (
                            <Button
                              size="sm"
                              type="button"
                              variant="ghost"
                              disabled={pending}
                              onClick={() => clearEmail(person)}
                            >
                              Remove
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <p className="text-sm">
                          {contact?.email ?? (
                            <span className="text-muted-foreground">
                              Not set
                            </span>
                          )}
                        </p>
                        {!person.is_preview ? (
                          <Button
                            size="sm"
                            type="button"
                            variant="ghost"
                            className="h-auto px-0 py-0 text-xs"
                            disabled={pending}
                            onClick={() => beginEditEmail(person)}
                          >
                            {contact ? "Edit email" : "Add email"}
                          </Button>
                        ) : null}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {person.auth_user_id ? "Yes" : "Not yet"}
                  </TableCell>
                  <TableCell>
                    <Select
                      value={person.role}
                      onValueChange={(value) =>
                        updateAccess(person, value as UserRole, person.active)
                      }
                      disabled={pending}
                    >
                      <SelectTrigger
                        aria-label={`Role for ${person.display_name}`}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ROLES.map((role) => (
                          <SelectItem key={role} value={role}>
                            {ROLE_LABEL[role]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={person.active}
                        onCheckedChange={(checked) =>
                          updateAccess(person, person.role, checked)
                        }
                        disabled={pending || person.id === currentProfileId}
                        aria-label={`Access for ${person.display_name}`}
                      />
                      <span className="text-xs text-muted-foreground">
                        {person.active ? "Active" : "Disabled"}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {person.active ? (
                      <span className="text-xs text-muted-foreground">
                        Disable access first
                      </span>
                    ) : (
                      <div className="space-y-1.5">
                        <Button
                          size="sm"
                          type="button"
                          variant="destructive"
                          disabled={pending || !eligibility?.can_delete}
                          onClick={() => setDeleteTarget(person)}
                        >
                          <Trash2 className="size-4" />
                          Delete
                        </Button>
                        {!eligibility?.can_delete ? (
                          <p className="max-w-[260px] text-xs text-muted-foreground">
                            {eligibility
                              ? eligibility.blockers.join(" · ")
                              : "Deletion checks are not available yet."}
                          </p>
                        ) : null}
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
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
              Delete {deleteTarget?.display_name ?? "this person"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the inactive roster entry
              {deleteTarget ? ` (${deleteTarget.ntid})` : ""} and its saved
              reminder email. Portfolio history is not changed. If this person
              previously registered, their sign-in record remains but has no
              access unless they are added to the roster again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              onClick={removePerson}
              disabled={pending}
            >
              {pending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Trash2 className="size-4" />
              )}
              {pending ? "Deleting…" : "Delete person"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
