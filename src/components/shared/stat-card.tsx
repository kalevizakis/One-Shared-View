import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "default" | "on-track" | "at-risk" | "blocked";
}

const TONE_CLASSES: Record<NonNullable<StatCardProps["tone"]>, string> = {
  default: "text-foreground",
  "on-track": "text-status-on-track",
  "at-risk": "text-status-at-risk",
  blocked: "text-status-blocked",
};

export function StatCard({ label, value, hint, tone = "default" }: StatCardProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <p className="text-[0.6875rem] font-bold tracking-wider text-muted-foreground uppercase">
        {label}
      </p>
      <div className="mt-2 flex items-baseline gap-2">
        <span className={cn("text-3xl font-bold tabular-nums", TONE_CLASSES[tone])}>
          {value}
        </span>
        {hint ? (
          <span className="text-xs text-muted-foreground">{hint}</span>
        ) : null}
      </div>
    </div>
  );
}
