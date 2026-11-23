import { LoaderCircle } from "lucide-react";

const loadingRows = [
  { primary: "w-44", secondary: "w-28", trailing: "w-16" },
  { primary: "w-56", secondary: "w-36", trailing: "w-20" },
  { primary: "w-40", secondary: "w-24", trailing: "w-14" },
  { primary: "w-52", secondary: "w-32", trailing: "w-24" },
];

export default function ApplicationLoading() {
  return (
    <section
      aria-busy="true"
      aria-live="polite"
      className="min-h-[52vh] w-full py-2 sm:py-4"
      role="status"
    >
      <header className="flex flex-col gap-5 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div aria-hidden="true" className="space-y-3">
          <div className="h-6 w-40 max-w-[70vw] rounded-sm bg-surface-highest" />
          <div className="h-3 w-72 max-w-[82vw] rounded-sm bg-muted" />
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin text-sky-500 motion-reduce:animate-none" aria-hidden="true" />
          <span>Preparing workspace</span>
        </div>
      </header>

      <div className="mt-7 grid gap-8 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div aria-hidden="true" className="grid gap-3">
          {loadingRows.map((row, index) => (
            <div
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-6 rounded-md bg-card px-3 py-5"
              key={index}
            >
              <div className="min-w-0 space-y-2.5">
                <div className={`h-3 max-w-full rounded-sm bg-surface-highest ${row.primary}`} />
                <div className={`h-2.5 max-w-[75%] rounded-sm bg-muted ${row.secondary}`} />
              </div>
              <div className={`h-2.5 rounded-sm bg-muted ${row.trailing}`} />
            </div>
          ))}
        </div>

        <aside aria-hidden="true" className="hidden rounded-md bg-card/60 p-5 lg:block">
          <div className="h-3 w-24 rounded-sm bg-surface-highest" />
          <div className="mt-5 space-y-4">
            <div className="h-2.5 w-full rounded-sm bg-muted" />
            <div className="h-2.5 w-4/5 rounded-sm bg-muted" />
            <div className="h-2.5 w-3/5 rounded-sm bg-muted" />
          </div>
          <div className="mt-8 rounded-md bg-muted/20 p-4">
            <div className="h-2.5 w-20 rounded-sm bg-surface-highest" />
            <div className="mt-3 h-2.5 w-2/3 rounded-sm bg-muted" />
          </div>
        </aside>
      </div>

      <span className="sr-only">Loading the requested page.</span>
    </section>
  );
}
