import React from "react";

export type StatusType =
  | "active_verified"
  | "verified"
  | "pending_verification"
  | "pending"
  | "under_scrutiny"
  | "maturing_soon"
  | "warning"
  | "matured"
  | "renewal_requested"
  | "release_requested"
  | "released"
  | "deficient"
  | "failed"
  | "forfeited"
  | "neutral";

interface StatusBadgeProps {
  status: StatusType | string;
  label?: string;
  size?: "sm" | "md";
  showDot?: boolean;
  className?: string;
}

export function StatusBadge({
  status,
  label,
  size = "md",
  showDot = true,
  className = "",
}: StatusBadgeProps) {
  const normalized = status.toLowerCase().replace(/[\s-]+/g, "_");

  let styleClasses = "";
  let dotColor = "";
  let defaultLabel = label || status.replace(/_/g, " ").toUpperCase();

  switch (normalized) {
    case "active_verified":
    case "verified":
    case "success":
      styleClasses = "bg-teal-50 text-teal-800 border-teal-200 dark:bg-teal-950/50 dark:text-teal-300 dark:border-teal-800";
      dotColor = "bg-teal-600 dark:bg-teal-400";
      defaultLabel = label || "Active & Verified";
      break;

    case "pending_verification":
    case "pending":
    case "under_scrutiny":
    case "submitted":
      styleClasses = "bg-slate-100 text-slate-800 border-slate-300 dark:bg-slate-800/60 dark:text-slate-300 dark:border-slate-700";
      dotColor = "bg-slate-500 dark:bg-slate-400";
      defaultLabel = label || "Pending Verification";
      break;

    case "maturing_soon":
    case "warning":
    case "renewal_requested":
      styleClasses = "bg-amber-50 text-amber-900 border-amber-300 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800";
      dotColor = "bg-amber-500 dark:bg-amber-400";
      defaultLabel = label || (normalized === "maturing_soon" ? "Maturing Soon" : "Renewal Requested");
      break;

    case "release_requested":
    case "released":
      styleClasses = "bg-sky-50 text-sky-800 border-sky-200 dark:bg-sky-950/50 dark:text-sky-300 dark:border-sky-800";
      dotColor = "bg-sky-600 dark:bg-sky-400";
      defaultLabel = label || (normalized === "released" ? "Released" : "Release Requested");
      break;

    case "deficient":
    case "failed":
    case "forfeited":
    case "matured":
      styleClasses = "bg-rose-50 text-rose-800 border-rose-300 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800";
      dotColor = "bg-rose-600 dark:bg-rose-400";
      defaultLabel = label || (normalized === "deficient" ? "Deficient" : normalized.toUpperCase());
      break;

    default:
      styleClasses = "bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700";
      dotColor = "bg-zinc-400";
      defaultLabel = label || status.replace(/_/g, " ").toUpperCase();
      break;
  }

  const sizeClasses =
    size === "sm"
      ? "text-[10px] px-2 py-0.5"
      : "text-[11px] px-2.5 py-1 font-semibold";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border tracking-wide uppercase font-mono ${sizeClasses} ${styleClasses} ${className}`}
    >
      {showDot && (
        <span
          className={`h-1.5 w-1.5 rounded-full shrink-0 ${dotColor}`}
          aria-hidden="true"
        />
      )}
      <span>{defaultLabel}</span>
    </span>
  );
}
