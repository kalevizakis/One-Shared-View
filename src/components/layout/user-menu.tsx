"use client";

import { Eye, LogOut, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ROLE_LABEL } from "@/lib/domain/status";
import { signOut } from "@/app/actions/auth";
import type { Profile } from "@/types/database";

interface UserMenuProps {
  profile: Profile;
  isPreview?: boolean;
}

export function UserMenu({ profile, isPreview = false }: UserMenuProps) {
  /*
   * In preview there is no person to identify, so showing "PREVIEW" as though it
   * were somebody's NTID would be misleading. An icon replaces the initials, and
   * the label says what this session is instead of who it is.
   *
   * The initials computation is guarded: "Preview (read-only)" would otherwise
   * produce "P(" from the bracket. Real display names are unaffected.
   */
  const initials = isPreview
    ? ""
    : profile.display_name
        .split(" ")
        .map((part) => part.replace(/[^\p{L}\p{N}]/gu, "")[0])
        .filter(Boolean)
        .slice(0, 2)
        .join("")
        .toUpperCase();

  const label = isPreview ? "Preview · read-only" : profile.ntid.toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="h-9 gap-2 px-2"
          aria-label={
            isPreview
              ? "Read-only preview session"
              : `Signed in as ${profile.display_name}`
          }
        >
          <span className="flex size-7 items-center justify-center rounded-full bg-primary text-[0.6875rem] font-bold text-primary-foreground">
            {isPreview ? (
              <Eye className="size-3.5" aria-hidden />
            ) : (
              initials || <User className="size-3.5" />
            )}
          </span>
          <span className="hidden text-sm font-semibold sm:inline">{label}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="space-y-1">
          <p className="text-sm font-semibold">
            {isPreview ? "Read-only preview" : profile.display_name}
          </p>
          {isPreview ? (
            <p className="text-xs font-normal text-muted-foreground">
              Viewing real portfolio data. Nothing can be changed from this
              session.
            </p>
          ) : (
            <>
              <p className="text-xs font-normal text-muted-foreground">
                NTID {profile.ntid.toUpperCase()} · {ROLE_LABEL[profile.role]}
              </p>
              {profile.job_title ? (
                <p className="text-xs font-normal text-muted-foreground">
                  {profile.job_title}
                </p>
              ) : null}
            </>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {/* signOut is intentionally NOT write-guarded — a preview visitor must
            always be able to leave. */}
        <form action={signOut}>
          <DropdownMenuItem asChild>
            <button type="submit" className="w-full cursor-pointer">
              <LogOut className="size-4" />
              {isPreview ? "Exit preview" : "Sign out"}
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
