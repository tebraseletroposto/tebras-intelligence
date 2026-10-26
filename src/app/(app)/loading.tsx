export default function Loading() {
  return (
    <div className="animate-pulse space-y-4" aria-busy="true" aria-label="Carregando">
      <div className="h-8 w-64 rounded bg-zinc-200" />
      <div className="h-4 w-96 max-w-full rounded bg-zinc-200" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-24 rounded-lg bg-zinc-200" />)}
      </div>
      <div className="h-64 rounded-lg bg-zinc-200" />
    </div>
  );
}
