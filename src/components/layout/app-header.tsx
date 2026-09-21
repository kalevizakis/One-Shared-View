"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { AppNav } from "./app-nav";
import { UserMenu } from "./user-menu";
import { ThemeToggle } from "./theme-toggle";
import type { Profile } from "@/types/database";

interface AppHeaderProps {
  profile: Profile;
  isPreview?: boolean;
}

export function AppHeader({ profile, isPreview = false }: AppHeaderProps) {
  const [open, setOpen] = useState(false);

  return (
    <header
      data-print="hide"
      className="sticky top-0 z-40 w-full border-b border-border bg-card"
    >
      <div className="mx-auto flex h-16 max-w-[1540px] items-center gap-4 px-4 sm:px-6 lg:px-10">
        <Link
          href="/"
          className="flex items-center gap-2.5 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <Image
            src="/pfizer-logo.svg"
            alt="Pfizer"
            width={24}
            height={23}
            className="h-auto"
          />
          <span className="text-lg font-bold whitespace-nowrap text-primary">
            One Shared View
          </span>
        </Link>

        <AppNav
          role={profile.role}
          isPreview={isPreview}
          className="ml-6 hidden lg:flex"
        />

        <div className="ml-auto flex items-center gap-1.5">
          <ThemeToggle />
          <UserMenu profile={profile} isPreview={isPreview} />

          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden"
                aria-label="Open navigation"
              >
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-64 p-6">
              <SheetTitle className="mb-4 text-base">Navigation</SheetTitle>
              <AppNav
                role={profile.role}
                isPreview={isPreview}
                className="flex-col items-stretch"
                onNavigate={() => setOpen(false)}
              />
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
