export function PlaceholderPage({ title, note }: { title: string; note: string }) {
  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-lg font-semibold">{title}</h1>
      <div className="flex h-[60vh] items-center justify-center rounded-lg border border-dashed border-neutral-300 text-sm text-neutral-400 dark:border-neutral-700">
        {note}
      </div>
    </div>
  );
}
