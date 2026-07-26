import { forwardRef } from "react";
import { cn } from "@/lib/utils/cn";

type Variant = "primary" | "ghost" | "outline" | "danger";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

const variantClass: Record<Variant, string> = {
  primary:
    "bg-neutral-900 text-white hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300",
  ghost: "bg-transparent hover:bg-neutral-200/60 dark:hover:bg-neutral-800/60",
  outline:
    "border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800",
  danger: "bg-red-600 text-white hover:bg-red-500",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "primary", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50",
        variantClass[variant],
        className,
      )}
      {...props}
    />
  );
});
