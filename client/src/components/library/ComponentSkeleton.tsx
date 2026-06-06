export function ComponentSkeleton() {
  return (
    <div className="space-y-2 px-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="animate-pulse flex items-center gap-2 p-2 rounded-lg bg-gray-100">
          <div className="w-8 h-8 rounded bg-gray-200 shrink-0" />
          <div className="flex-1 space-y-1">
            <div className="h-3 bg-gray-200 rounded w-2/3" />
            <div className="h-2 bg-gray-200 rounded w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}
