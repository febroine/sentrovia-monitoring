import Link from "next/link";

const linkClassName =
  "mt-5 inline-flex h-8 items-center justify-center rounded-md bg-primary px-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-2xl items-center px-5 py-12">
      <div className="w-full border-y py-8">
        <h1 className="text-xl font-semibold tracking-tight">404 — Page not found</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          The address may be outdated or the page may have moved.
        </p>
        <Link href="/dashboard" className={linkClassName}>
          Return to dashboard
        </Link>
      </div>
    </main>
  );
}
