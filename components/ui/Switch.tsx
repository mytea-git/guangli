"use client";

import { cn } from "@/lib/utils/cn";

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
}

export function Switch({ checked, onChange, label, disabled }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50",
        checked ? "bg-neutral-900 dark:bg-neutral-100" : "bg-neutral-300 dark:bg-neutral-700",
      )}
    >
      <span
        className={cn(
          "inline-block h-4 w-4 transform rounded-full bg-white transition-transform dark:bg-neutral-900",
          checked ? "translate-x-6" : "translate-x-1",
        )}
      />
    </button>
  );
}
