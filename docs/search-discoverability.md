# Search and repository discoverability

Research date: 17 September 2026. Scope: the public GitHub repository and its README, not a separately hosted marketing site. The app redirects its root route to login or onboarding, so changing its metadata would not make the repository rank in Google.

## What the search results show

- The public repository is accessible and already has a descriptive GitHub About line and 14 relevant topics. A `site:github.com/febroine/sentrovia-monitoring` search in the research tool did not return a matching result. This is a discovery signal, **not proof that Google has not indexed it**. A direct Google result check is needed; the repository owner does not control the `github.com` domain for Search Console verification.
- Results for broad terms such as *self-hosted uptime monitoring* and *open-source website monitoring* are crowded with established projects, especially [Uptime Kuma](https://github.com/louislam/uptime-kuma) and [Gatus](https://github.com/TwiN/gatus). Sentrovia has a more specific story: it verifies a failed check, tests the monitoring host's connection, and records notification outcomes.
- Google advises descriptive titles and headings, language people use to search, and content that helps readers. It does not promise indexing or rankings from keyword placement alone. See [Search Essentials](https://developers.google.com/search/docs/essentials), the [SEO Starter Guide](https://developers.google.com/search/docs/fundamentals/seo-starter-guide), and [helpful content guidance](https://developers.google.com/search/docs/fundamentals/creating-helpful-content).

No Search Console, Google Ads Keyword Planner, or other query-volume dataset was available. The priorities below reflect search intent and product fit, **not measured search volume or ranking difficulty**. This distinction matters: the first README revision was written before numeric keyword research, and must not be described as volume-led optimization.

## Measurement needed before numeric prioritization

Target market: global English. The next comparison needs one export from Google Keyword Planner (or a named SEO provider) for the same geography, language, search network, and date range across all terms below. Record the source and export date. Useful fields are average monthly searches, the twelve monthly values, and any available organic keyword difficulty. Google's own [historical metrics documentation](https://developers.google.com/google-ads/api/docs/keyword-planning/generate-historical-metrics) defines its search volume as an approximate past-12-month average. Its *competition index* measures **ad placement competition**, not organic SEO difficulty.

The Google Trends endpoint returned HTTP 429 in this environment, and the available browser research connection was unavailable. Public pages with isolated figures did not identify a comparable global English geography and period or a verifiable calculation method. Their numbers were therefore excluded. A qualitative search-results sample found established monitoring products and comparison articles for broad terms such as *self-hosted uptime monitoring* and *API monitoring software*; this shows visible competitors, but is not a numeric difficulty score.

Seed terms to measure together:

```text
self hosted uptime monitoring
open source uptime monitoring
website uptime monitoring
website monitoring software
api monitoring
api uptime monitoring
self hosted api monitoring
docker uptime monitoring
cron job monitoring
heartbeat monitoring
public status page software
postgresql monitoring
tcp port monitoring
verified outage alerts
false positive uptime alerts
```

## Keyword and intent map

| Priority | Search language and close variants | Intent | Where it belongs | Product evidence |
| --- | --- | --- | --- | --- |
| Primary | self-hosted uptime monitoring; open-source uptime monitor | Find software to run on one's own infrastructure | README opening and GitHub About | Docker Compose and Windows service installation |
| Primary | website monitoring; website uptime monitor; HTTP/HTTPS monitoring | Check if a site responds | README opening and monitor table | HTTP/HTTPS checks, response status, redirects, latency |
| Primary | API monitoring; API uptime monitor; JSON endpoint monitoring | Check API availability and response data | Monitor table and feature explanation | API/JSON checks and assertions |
| Differentiator | verified outage alerts; reduce false uptime alerts; outage verification | Avoid alerts caused by transient failures | Opening and verification section | Retry threshold, connectivity checks, final probe |
| Supporting | public status page; status page software | Publish service availability | Features and product tour | Public status pages |
| Supporting | Docker Compose uptime monitoring; self-hosted monitoring Docker | Install and evaluate quickly | Quick Start | Docker installer and Compose stack |
| Supporting | cron job monitoring; heartbeat monitoring | Detect missing scheduled runs | Monitor table | Heartbeat/cron checks |
| Supporting | PostgreSQL monitoring; TCP port monitoring; ping monitoring | Check a specific service type | Monitor table | Dedicated check types |
| Supporting | uptime reports; notification delivery history; screenshot evidence | Investigate incidents and prove delivery | Features and relevant sections | Reports, delivery attempts, best-effort HTTP screenshots |
| Secondary language | kendi sunucunda uptime izleme; web sitesi izleme; API izleme | Turkish-language discovery | Future Turkish documentation if maintained | Product supports Turkish notification content; the current README and interface are English |

Terms such as *free hosted uptime service*, *multi-region monitoring*, *DNS monitoring*, and *server resource monitoring* should not be targeted as current capabilities. Some are roadmap items; others describe a different product.

## Changes made and next checks

The README now leads with the main category and supported checks, then explains outage verification in ordinary language. A check-type table answers specific queries without repeating keywords unnaturally. The setup, evidence, and demo descriptions were shortened and made more concrete.

The current GitHub About description already covers the primary category and differentiator, and its topics cover the main monitor types. Keep them unless the product changes; adding more synonymous topics is unlikely to help readers. GitHub's [topic guidance](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/classifying-your-repository-with-topics) favors relevant subjects.

After publishing the README, check Google for the exact repository URL and branded searches such as `Sentrovia monitoring` over the next several weeks. Repository owners generally cannot verify a `github.com` URL in Search Console because GitHub controls that domain. If a separately owned documentation site is launched later, verify **that site's** domain in Search Console to measure impressions and queries. If the repository still does not appear for its own name, investigate discovery and indexing before rewriting the copy again. Independent, useful links and real product documentation can help discovery; keyword repetition alone cannot guarantee it.
