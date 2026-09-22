"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/types/database";
import {
  canAdminister,
  canManageReporting,
  canViewReports,
} from "@/lib/domain/status";

interface AppNavProps {
  role: UserRole;
  isPreview?: boolean;
  className?: string;
  onNavigate?: () => void;
}

export function AppNav({
  role,
  isPreview = false,
  className,
  onNavigate,
}: AppNavProps) {
  const pathname = usePathname();

  /*
   * Preview shows the four screens the solution is reviewed on, and never /admin.
   *
   * Two overrides are deliberate. "My update" normally hides for an 'exec', and
   * preview IS an 'exec' — but the update form is one of the things a reviewer
   * came to see, so it is shown (read-only). "Audit trail" normally needs
   * lead/admin, and preview must not have either role, so it is opened here and
   * matched by a SELECT-only RLS policy rather than by promoting the role.
   *
   * Hiding /admin is presentation only. The page itself still redirects on its
   * own `canAdminister` check, and every admin action is refused server-side, so
   * typing the URL gains nothing.
   */
  const links = [
    { href: "/", label: "Portfolio", show: true },
    { href: "/my-update", label: "My update", show: isPreview || role !== "exec" },
    { href: "/reports", label: "Reports", show: canViewReports(role) },
    {
      href: "/audit",
      label: "Audit trail",
      show: isPreview || canManageReporting(role),
    },
    { href: "/admin", label: "Admin", show: !isPreview && canAdminister(role) },
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
