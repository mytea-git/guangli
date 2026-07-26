import { cn } from "@/lib/utils/cn";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-lg border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900",
        className,
      )}
      {...props}
    />
  );
}
