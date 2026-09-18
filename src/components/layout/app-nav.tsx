"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/types/database";
import { canAdminister, canManageReporting } from "@/lib/domain/status";

interface AppNavProps {
  role: UserRole;
  className?: string;
  onNavigate?: () => void;
}

export function AppNav({ role, className, onNavigate }: AppNavProps) {
  const pathname = usePathname();

  const links = [
    { href: "/", label: "Portfolio", show: true },
    { href: "/my-update", label: "My update", show: role !== "exec" },
    { href: "/reports", label: "Reports", show: true },
    { href: "/audit", label: "Audit trail", show: canManageReporting(role) },
    { href: "/admin", label: "Admin", show: canAdminister(role) },
  ].filter((link) => link.show);

  return (
    <nav className={cn("flex gap-1", className)} aria-label="Primary">
      {links.map((link) => {
        const isActive =
          link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);

        return (
          <Link
            key={link.href}
            href={link.href}
            onClick={onNavigate}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-2 text-sm font-semibold transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              isActive
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
