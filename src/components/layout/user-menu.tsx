"use client";

import { LogOut, User } from "lucide-react";
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
}

export function UserMenu({ profile }: UserMenuProps) {
  const initials = profile.display_name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="h-9 gap-2 px-2"
          aria-label={`Signed in as ${profile.display_name}`}
        >
          <span className="flex size-7 items-center justify-center rounded-full bg-primary text-[0.6875rem] font-bold text-primary-foreground">
            {initials || <User className="size-3.5" />}
          </span>
          <span className="hidden text-sm font-semibold sm:inline">
            {profile.ntid.toUpperCase()}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="space-y-1">
          <p className="text-sm font-semibold">{profile.display_name}</p>
          <p className="text-xs font-normal text-muted-foreground">
            NTID {profile.ntid.toUpperCase()} · {ROLE_LABEL[profile.role]}
          </p>
          {profile.job_title ? (
            <p className="text-xs font-normal text-muted-foreground">
              {profile.job_title}
            </p>
          ) : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <form action={signOut}>
          <DropdownMenuItem asChild>
            <button type="submit" className="w-full cursor-pointer">
              <LogOut className="size-4" />
              Sign out
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
