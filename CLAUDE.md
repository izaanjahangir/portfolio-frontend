# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Project

Personal portfolio for Izaan Jahangir. Next.js 16 (App Router, React 19,
TypeScript, React Compiler). It embeds an AI assistant that answers questions
about him, backed by a separate Python/FastAPI server.

The backend is **not** in this repo. It runs at `http://127.0.0.1:8000` in
development; its OpenAPI spec is at `/openapi.json` and its docs at `/docs`.
Read the spec rather than guessing at endpoint shapes.

## Commands

```bash
npm run dev      # dev server on :3000
npm run build    # production build
npm run lint     # eslint
npx tsc --noEmit # typecheck
```

Run **all three** of typecheck, lint, and build before declaring work done.
Lint is strict: `--max-warnings=0`, and the React Compiler rules reject
setState called synchronously in an effect body and refs mutated during render.

## Git

**Never commit on your own initiative. Always ask first and wait for a clear
yes**, even when the work is finished, verified, and obviously commit-worthy.
Finishing a task is not permission to commit it. Permission given once covers
that commit only, never the next one.

**When told to commit, commit directly to `main`.** Never create feature
branches, and don't ask whether to branch — Izaan is the only developer here,
so there is no reviewer and no PR workflow, and a branch just adds a merge
step.

These two rules are separate: the first governs *when* to commit, the second
*where*. A "yes" to the first never implies standing permission.

## Structure

Layered; a file may import from layers below it, never above. Full detail and
the reasoning are in [ARCHITECTURE.md](ARCHITECTURE.md) — read it before adding
files.

```
src/
  app/          Next routing only — thin files that delegate to screens
  screens/      One folder per screen
  components/   Global reusable components
  reactQuery/   Query/mutation hooks, one file per resource
  apiService/   HTTP calls, one file per resource
  hooks/        Global hooks
  providers/    Client-side context providers
  utils/        Cross-cutting helpers (axios setup, dates, formatting)
  config/       Constants, site metadata, structured data
  types/        Shared types
  styles/       Global stylesheets
```

Conventions:

- Components and screens colocate `index.tsx` with `style.module.css`.
  Children used by only one component nest under its own `components/` folder.
- `apiService/` and `reactQuery/` mirror each other one-to-one, named after the
  URL prefix (`chat.ts` ↔ `useChat.ts`).
- A hook spanning more than one resource goes in `hooks/`, not `reactQuery/`.
- Import with the `@/` alias. Relative imports only for siblings in the same
  component folder.
- Route files (`app/**/page.tsx`) stay thin: metadata plus a screen.

## Rules that are easy to break

**Styling is CSS Modules.** Not CSS-in-JS — it would force client boundaries
and strip content out of the prerendered HTML.

**Keep screens as server components.** Adding `"use client"` to a screen
removes its content from the prerendered HTML and silently costs SEO. Push
interactivity into a child instead: `AgentScreen` is a server component that
renders the client-side `AgentChat`.

**Every page needs its own `metadata`** with a description and
`alternates.canonical`. The root layout's `title.template` appends the site
name, so a page sets only its own title.

**Add new routes to `app/sitemap.ts`.** Nothing does this automatically.

**Feature-detect browser APIs through `useClientFlag`.** Detection differs
between server and client; branching on it directly is a hydration error.

**Speech starts before the answer is complete.** `speakStream` queues
sentences as deltas arrive. Anything that can end a reply — success, error,
or the visitor stopping — must close or cancel that session, or the loop
hangs in `speaking` forever.

**Never open the mic while the agent is speaking.** Recognition would
transcribe the agent's own voice and reply to itself. See the voice section in
ARCHITECTURE.md before touching `useVoiceChat`.

**Memoise objects returned from hooks.** They land in effect dependency arrays;
a fresh identity each render re-runs those effects on every render. This has
already caused one real bug in the speech teardown.

**Don't render model output as HTML.** `Markdown` deliberately omits
`rehype-raw`. Answers come from a model; keep them inert.

**The devtools guard must stay a literal comparison.**
`process.env.NODE_ENV === "development"` in `providers/QueryProvider.tsx` is
what lets Next dead-code-eliminate the devtools import. Hoisting it into a
variable ships them to production.

**Streaming uses `fetch`, not axios.** Browser axios buffers the whole
response before resolving, so nothing arrives incrementally, and the
envelope interceptor is wrong for SSE frames. `postChat` still uses axios.

**Backend metadata wins over the keyword fallback.** `end_of_conversation:
false` must never be overridden by the client's own guess — only a missing
or null metadata object falls back. The backend omits it intermittently, so
the fallback cannot be deleted.

**The proxy uses `fetch`, not axios, on purpose.**
`app/api/agent/[...path]/route.ts` forwards bytes untouched. The axios instance
unwraps envelopes and throws on non-2xx — exactly wrong for a passthrough that
must forward 422s intact.

**Don't switch to `output: "export"`.** Pages are already prerendered to static
HTML, so it gains nothing, and static export cannot run POST route handlers —
it would break the agent proxy and force the browser to call the Python backend
directly with CORS and a public URL.

## Environment

`.env.local` (gitignored); `.env.example` documents the variables.

| Variable | Scope | Notes |
| --- | --- | --- |
| `AGENT_API_URL` | server | Proxy target. Never exposed to the browser. |
| `NEXT_PUBLIC_SITE_URL` | browser | Absolute origin, no trailing slash. |

`NEXT_PUBLIC_SITE_URL` still defaults to `http://localhost:3000`. It feeds
canonical URLs, Open Graph tags, the sitemap and the social card — set it to
the real domain before deploying.

## Status

Done: the agent (streaming chat over SSE, markdown, session restore, retry),
the layered structure, the SEO foundation (metadata, JSON-LD, sitemap,
robots, OG image), and hands-free browser-native voice conversation (Web
Speech API, no backend, no cost) — the visitor talks, the agent answers
aloud, and it listens again. The agent's `end_of_conversation` and
`language` metadata drive when voice mode closes and which voice speaks.

Next: the real portfolio design and content. The UI so far is deliberately
plain — the chat is themed entirely through `--agent-*` custom properties in
`styles/agent-theme.css`, so it can be restyled without touching component
code.

Note for SEO: the assistant's answers are client-rendered and invisible to
crawlers. Content that lives only in the Python backend will never be indexed,
so projects and experience still need to exist as real HTML on the site.
