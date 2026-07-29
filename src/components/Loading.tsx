export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex flex-1 items-center justify-center">
      <p className="text-body text-muted-foreground">{label}</p>
    </div>
  );
}
