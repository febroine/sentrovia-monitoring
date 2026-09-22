export type GlobalSearchResultType = "monitor" | "company" | "log" | "member" | "setting";

export interface GlobalSearchResult {
  id: string;
  type: GlobalSearchResultType;
  title: string;
  description: string;
  href: string;
  monitorId?: string;
}
