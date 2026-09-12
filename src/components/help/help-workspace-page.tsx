"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { HelpFaqPanel } from "@/components/help/help-faq-panel";
import { helpCategories, quickNotes, type HelpCategory } from "@/components/help/help-data";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function HelpWorkspacePage() {
  const [query, setQuery] = useState("");
  const matches = useMemo(() => findHelpMatches(query), [query]);
  const isSearching = query.trim().length > 0;

  return (
    <div className="flex w-full flex-col gap-6">
      <header>
        <h1 className="mb-1 text-2xl font-semibold tracking-tight">Help</h1>
        <p className="text-sm text-muted-foreground">Operational guidance and troubleshooting.</p>
        <div className="relative mt-5 max-w-2xl">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search help" className="pl-9" aria-label="Search help" />
        </div>
      </header>

      {isSearching ? <HelpSearchResults query={query} matches={matches} /> : <>
        <QuickChecks />
        <Tabs defaultValue={helpCategories[0]?.value} className="flex-col gap-6">
          <TabsList variant="line" className="w-fit max-w-full justify-start overflow-x-auto rounded-md bg-muted/30 p-1">
            {helpCategories.map((category) => (
              <TabsTrigger key={category.value} value={category.value} className="flex-none rounded-md px-3">
                <category.icon data-icon="inline-start" className="text-muted-foreground" />
                {category.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {helpCategories.map((category) => <TabsContent key={category.value} value={category.value}><HelpFaqPanel category={category} /></TabsContent>)}
        </Tabs>
      </>}
    </div>
  );
}

function QuickChecks() {
  return (
    <section aria-labelledby="quick-checks-title">
      <h2 id="quick-checks-title" className="text-base font-semibold">Common checks</h2>
      <ul className="mt-3 grid gap-3 md:grid-cols-2 md:gap-4">
        {quickNotes.map((note) => {
          const NoteIcon = note.icon;
          return <li key={note.text} className="flex gap-3 rounded-md bg-muted/20 p-4"><NoteIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" /><p className="text-sm leading-6 text-muted-foreground">{note.text}</p></li>;
        })}
      </ul>
    </section>
  );
}

type HelpMatch = { category: HelpCategory; question: string; answer: string };

function HelpSearchResults({ query, matches }: { query: string; matches: HelpMatch[] }) {
  return <section aria-live="polite">
    <h2 className="text-base font-semibold">{matches.length === 0 ? "No matching guidance" : `${matches.length} result${matches.length === 1 ? "" : "s"}`}</h2>
    {matches.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">No help topics match “{query.trim()}”.</p> : <div className="mt-4 grid gap-3">{matches.map((match) => <HelpSearchResult key={`${match.category.value}-${match.question}`} match={match} />)}</div>}
  </section>;
}

function HelpSearchResult({ match }: { match: HelpMatch }) {
  const CategoryIcon = match.category.icon;
  return <article className="rounded-md bg-muted/20 px-4 py-4 sm:px-5"><p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><CategoryIcon className="size-3.5" />{match.category.label}</p><h3 className="mt-1 text-sm font-semibold">{match.question}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{match.answer}</p></article>;
}

function findHelpMatches(query: string): HelpMatch[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return [];
  return helpCategories.flatMap((category) => category.faqs.filter((faq) => `${faq.question} ${faq.answer}`.toLocaleLowerCase().includes(normalizedQuery)).map((faq) => ({ category, ...faq })));
}
