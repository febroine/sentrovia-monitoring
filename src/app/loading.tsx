export default function ApplicationLoading() {
  return (
    <div className="mx-auto flex min-h-[40vh] w-full max-w-2xl items-center px-5 py-12" role="status">
      <div className="w-full border-y py-6 text-sm text-muted-foreground">Loading page…</div>
    </div>
  );
}
