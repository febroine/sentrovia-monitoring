# Project design sources

Status: configured for the existing Sentrovia web application. This file maps the
incumbent interface sources; it does not introduce a new design system.

## Canonical sources

| Concern | Actual project path / source | Status / owner |
| --- | --- | --- |
| Product goals and constraints | [Repository overview](../README.md) and [engineering instructions](../AGENTS.md) | Repository owner |
| Brand / visual direction | [Global application styles](../src/app/globals.css) | Existing implementation |
| Executable tokens / theme | [Global application styles](../src/app/globals.css) | Existing implementation |
| Shared UI components | [Button](../src/components/ui/button.tsx), [Dialog](../src/components/ui/dialog.tsx), [Select](../src/components/ui/select.tsx) | Existing implementation |
| Navigation / behavior | [Monitoring page](../src/app/monitoring/page.tsx) | Existing implementation |
| Good existing screens / references | [Monitoring page](../src/app/monitoring/page.tsx) and [monitor table](../src/components/monitoring/monitor-table.tsx) | Preserve current operational density |
| Platform accessibility requirements | Existing semantic components and WCAG-compatible browser behavior | Verify in scoped review |
| Run/build/test/capture commands | [Package scripts](../package.json) | `npm run dev`, `npm test`, `npm run typecheck`, `npm run lint`, `npm run build` |

## Workflow configuration

Audit `.designflow/config.json` watch/exclude globs for this repository, including all
UI source, global styles, tokens, layout configuration, assets, and relevant manifests.
Register canonical sources once using real local Markdown links here (for example
`[Design](../DESIGN.md)`) or `design_sources` in config. Existing root DESIGN.md,
PRODUCT_DESIGN.md and PRODUCT.md are included automatically. `artifact_paths` remains
supported for existing configurations. Plain table/prose path names are not parsed as links. Configure actual checks or explain why
there are none. Set `configured` only after resolving the above. For a monorepo, decide
whether this workflow covers one application or the repository; narrow patterns carefully.

## Decision precedence

Honor applicable instructions and explicit user scope first. Within design work, use
approved product/brand decisions and canonical executable tokens/components. A task-local
spec may propose a scoped project change, but cannot waive the owner's global strict
D01-D26 visual policy. Record conflicts with scope, affected consumers and decision source;
do not silently expand a redesign or invent an aesthetic exception. Security/permissions
and actual authorized scope remain in force.

## Runs

Scoped work and review records live in `design/runs/<task>/`. Evidence has an explicit
source snapshot and declared coverage. A pass covers that scope, not the whole product.
