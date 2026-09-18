import { cn } from "@/lib/utils";
import { HEALTH_CLASSES, HEALTH_DOT, HEALTH_LABEL } from "@/lib/domain/status";
import type { HealthStatus } from "@/types/database";

interface HealthBadgeProps {
  health: HealthStatus | null;
  className?: string;
}

/**
 * Health is never conveyed by colour alone: the badge always carries its label,
 * and the dot is paired with that text (WCAG 2.2 AA).
 */
export function HealthBadge({ health, className }: HealthBadgeProps) {
  if (!health) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground",
          className,
        )}
      >
        <span className="size-1.5 rounded-full bg-muted-foreground" aria-hidden />
        No update
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
        HEALTH_CLASSES[health],
        className,
      )}
    >
      <span
        className={cn("size-1.5 rounded-full", HEALTH_DOT[health])}
        aria-hidden
      />
      {HEALTH_LABEL[health]}
    </span>
  );
}
