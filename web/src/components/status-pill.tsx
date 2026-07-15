import { cn } from "@/lib/utils";
import { titleCase } from "@/lib/format";

type Tone = "neutral" | "success" | "warning" | "info" | "danger" | "brand";

const toneClasses: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground",
  success:
    "bg-success/12 text-success-foreground/90 [.dark_&]:text-success ring-1 ring-success/25",
  warning:
    "bg-warning/15 text-warning-foreground [.dark_&]:text-warning ring-1 ring-warning/30",
  info: "bg-info/12 text-info [.dark_&]:text-info ring-1 ring-info/25",
  danger: "bg-destructive/12 text-destructive ring-1 ring-destructive/25",
  brand: "bg-primary/12 text-primary ring-1 ring-primary/25",
};

// Map every backend status string to a tone so colors stay consistent everywhere.
const STATUS_TONE: Record<string, Tone> = {
  // circle
  forming: "info",
  active: "brand",
  complete: "success",
  wound_down: "neutral",
  // cycle
  proposed: "warning",
  // period
  upcoming: "neutral",
  collecting: "info",
  closed: "neutral",
  paid_out: "success",
  // contribution
  pending: "warning",
  paid: "success",
  missed: "danger",
  // payout
  released: "info",
  confirmed: "success",
  // kyc
  verified: "success",
  unverified: "neutral",
  rejected: "danger",
  // member
  invited: "warning",
  left: "neutral",
  suspended: "danger",
  organizer: "brand",
  member: "neutral",
  // dispute / vote
  open: "warning",
  resolved_paid: "success",
  resolved_unpaid: "danger",
  expired: "neutral",
  approve: "success",
  decline: "danger",
};

export function StatusPill({
  status,
  className,
  label,
}: {
  status: string;
  className?: string;
  label?: string;
}) {
  const tone = STATUS_TONE[status] ?? "neutral";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        toneClasses[tone],
        className,
      )}
    >
      <span
        className={cn("size-1.5 rounded-full", {
          "bg-muted-foreground": tone === "neutral",
          "bg-success": tone === "success",
          "bg-warning": tone === "warning",
          "bg-info": tone === "info",
          "bg-destructive": tone === "danger",
          "bg-primary": tone === "brand",
        })}
      />
      {label ?? titleCase(status)}
    </span>
  );
}
