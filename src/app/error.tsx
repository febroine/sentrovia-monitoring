"use client";

import { Button } from "@/components/ui/button";

export default function ApplicationError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-2xl items-center px-5 py-12">
      <div className="w-full border-y py-8">
        <h1 className="text-xl font-semibold tracking-tight">This page could not be loaded</h1>
        <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
          Check the database and application services, then try the request again.
        </p>
        <Button className="mt-5" onClick={reset}>
          Try again
        </Button>
      </div>
    </main>
  );
}
