# Project structure

Layered by responsibility, one folder per layer. A file may import from
layers below it, never above.

```
src/
  app/          Next routing only — thin files, no UI logic
  screens/      One folder per screen, rendered by a route
  components/   Global, reusable components
  reactQuery/   Query/mutation hooks, one file per resource
  apiService/   HTTP calls, one file per resource
  hooks/        Global hooks
  providers/    Client-side context providers
  utils/        Cross-cutting helpers (axios setup, dates, formatting)
  config/       Constants, site metadata, structured data
  types/        Shared TypeScript types
  styles/       Global stylesheets
```

Dependency direction:

```
app → screens → components → hooks → reactQuery → apiService → utils/axios
                                ↘ config, types, utils (any layer may use these)
```

## The layers

### `app/` — routing only

Next's App Router *is* `app/`; it can't be moved. So route files stay
three lines and delegate:

```tsx
// app/agent/page.tsx
import { AgentScreen } from "@/screens/AgentScreen";

export default function AgentPage() {
  return <AgentScreen />;
}
```

Route handlers (server endpoints) also live here — see
`app/api/agent/[...path]/route.ts`, the proxy to the Python backend.

### `screens/` and `components/`

Same shape in both:

```
AgentChat/
  index.tsx              the component
  style.module.css       its styles
  components/            children used only by this component
    Composer/
      index.tsx
      style.module.css
```

A component used by more than one thing moves up to `src/components/`.
`Markdown` lives there because a blog or project page will want it too;
`Composer` and `MessageList` stay nested under `AgentChat`.

Styles are CSS Modules (`style.module.css`) rather than `style.ts` — same
colocation, but zero runtime and no React Server Component friction.

### `apiService/` — one file per resource

Named after the URL prefix: `chat.ts` for `/api/chat`, `users.ts` for
`/api/users/*`. Plain async functions, no React. Each takes an optional
`signal` so callers can cancel.

### `reactQuery/` — one file per resource

Mirrors `apiService/` one-to-one: `useChat.ts` wraps `apiService/chat.ts`.
Holds queries, mutations, cache updates and optimistic writes.
`queryKeys.ts` centralises every cache key.

Hooks spanning more than one resource go in `hooks/`, not here —
`useAgentChat` composes `useSendMessage` + `useConversation` + `useIdentity`
and is the single seam between data and UI.

### `utils/`

One file per concern: `axios.ts` (instance + interceptors + `ApiError`),
`identity.ts` (localStorage store), `messages.ts`. Add `datetime.ts`,
`currency.ts` etc. the same way.

### `providers/`

Client-side context providers. They need `"use client"`, so keeping them
here lets `app/layout.tsx` stay a server component.

## Import paths

Use the `@/` alias, already configured in `tsconfig.json`:

```ts
import { AgentChat } from "@/components/AgentChat";
import { queryKeys } from "@/reactQuery/queryKeys";
```

Relative imports only for siblings inside the same component folder.

## Adding a screen

1. `src/screens/AboutScreen/{index.tsx,style.module.css}`
2. `src/app/about/page.tsx` rendering `<AboutScreen />`

## Adding an endpoint

1. `src/apiService/<resource>.ts` — the call
2. `src/reactQuery/use<Resource>.ts` — the hook
3. Add its key to `src/reactQuery/queryKeys.ts`

## SEO

Every page is prerendered to static HTML at build time (`.next/server/app/*.html`),
so crawlers get full markup with no JS execution. `output: "export"` is
deliberately **not** used: it would add nothing here, and it cannot run POST
route handlers, which would break the agent proxy and force the browser to
call the Python backend directly (CORS + a public backend URL).

What's wired up:

| Concern | Where |
| --- | --- |
| Site name, description, socials | `config/site.ts` |
| JSON-LD builders | `config/structuredData.ts` |
| Title template, OG, Twitter, robots | `app/layout.tsx` |
| Per-page title, description, canonical | each `page.tsx` |
| `/sitemap.xml` | `app/sitemap.ts` |
| `/robots.txt` | `app/robots.ts` |
| OG / Twitter card image | `app/opengraph-image.tsx`, `app/twitter-image.tsx` |

Rules to keep it working:

- **Set `NEXT_PUBLIC_SITE_URL`** to the real origin in production. Canonical
  URLs, Open Graph and the sitemap all need an absolute origin; it falls
  back to `http://localhost:3000`, which is wrong to ship.
- **Add new routes to `app/sitemap.ts`.** Nothing does this automatically.
- **Give every page its own `metadata`** with a `description` and
  `alternates.canonical`. The layout's `title.template` appends the site
  name, so a page sets only its own title.
- **Keep screens as server components.** Adding `"use client"` to a screen
  strips its content out of the prerendered HTML. Push interactivity down
  into a child component instead — `AgentScreen` is a server component that
  renders the client-side `AgentChat`.
- **One `<h1>` per page**, with real headings below it.

The social card is drawn by `utils/ogImage.tsx` and rendered to PNG by
`next/og` at build time, so it costs nothing at request time. Next picks up
the `opengraph-image` / `twitter-image` filenames automatically and injects
the `og:image` and `twitter:image` tags — no metadata wiring needed. Note
that `next/og` supports only a subset of CSS: flexbox and absolute
positioning, no grid, and any element with multiple children needs an
explicit `display`.

Worth adding later: per-project metadata and per-page OG images once
project pages exist (drop an `opengraph-image.tsx` in that route's folder).

### The agent and SEO

The assistant's answers are client-rendered and invisible to crawlers —
which is correct, chat transcripts shouldn't be indexed. But it means the
content the agent knows about you lives only in the Python backend. Search
engines can't see any of it.

So the portfolio still needs that material as real HTML on the page:
projects, experience, skills, written out. The agent is a better way to
explore that content, not a replacement for publishing it.

## Agent specifics

### Backend

| Variable | Where | Default |
| --- | --- | --- |
| `AGENT_API_URL` | server (proxy target) | `http://127.0.0.1:8000` |
| `NEXT_PUBLIC_AGENT_API_BASE` | browser (axios baseURL) | `/api/agent` |

The browser calls `/api/agent/*`; the route handler forwards to
`AGENT_API_URL`. This keeps the backend URL off the client and avoids CORS.
That proxy uses `fetch`, not the axios instance, on purpose: the instance's
interceptor unwraps envelopes and throws on non-2xx, which is exactly wrong
for a byte passthrough that must forward 422s intact.

### Cache behaviour

The transcript lives in the React Query cache under
`["agent","conversation",sessionId]`, not in component state.

- Before the backend mints a session, messages accumulate under `"draft"`.
- The first reply writes the thread onto the real session key *before*
  saving the identity, so the key change lands on fresh data
  (`staleTime: Infinity`) and never refetches what we already have.
- A `404` on restore clears the dead session instead of pinning the visitor
  to it.

### Voice (phase 1: browser-native)

Hands-free voice conversation using the Web Speech API — no backend, no
cost. The visitor taps the mic once and then just talks; there is no send
button in the loop and no dictation-into-a-textbox step.

```
idle → listening → thinking → speaking → listening → …
```

Chrome, Edge and Safari support it; Firefox does not, so the control is
feature-detected and simply absent there.

| Piece | File |
| --- | --- |
| The loop | `hooks/useVoiceChat.ts` |
| Recognition types + detection | `utils/speechRecognition.ts` |
| Synthesis store (shared global) | `utils/speechSynthesis.ts` |
| Markdown stripping + chunking | `utils/text.ts` |
| Mic / status UI | `components/AgentChat/components/{MicButton,VoiceStatus}` |

#### The rule that matters

**The mic is never open while the agent is speaking.** If it were,
recognition would transcribe the agent's own voice, send it back as the
next question, and the conversation would talk to itself indefinitely.
Every transition into `speaking` stops recognition first, and listening
only resumes from the utterance's `onEnd`.

#### Other things that are the way they are for a reason

- **The loop runs on callbacks, not effects.** An effect watching "has a
  reply arrived?" reacts a render late — long enough to reopen the mic
  while the agent is still talking. Reply arrival is delivered through
  `onAssistantMessage`, threaded from the mutation's `onSuccess`.
- **`speak()` reports failure as completion.** A device with no voices
  accepts an utterance, reports `speaking === true`, and never fires
  `onend`. Without treating that as an ending, the loop hangs in
  `speaking` forever and the mic never reopens. Guards: refuse to speak
  when no voice exists, and a per-utterance stall ceiling.
- **Hook return values are memoised.** They end up in effect dependency
  arrays; a fresh object each render re-runs those effects continuously.
  This caused a real bug — the teardown effect cancelled every utterance
  mid-sentence, leaving the loop stuck.
- **Feature detection goes through `useClientFlag`.** Detection differs
  between server and client; branching on it directly is a hydration error.
- **Three consecutive silent turns end voice mode**, so a forgotten open
  mic doesn't sit there indefinitely.
- **Long answers are spoken as a queue of short utterances.** Chrome
  truncates a single utterance after roughly 15 seconds.
- **Answers are stripped of markdown before speaking.** Raw markdown reads
  as punctuation soup; code blocks are announced, not spelled out.

#### Known limits

- **No barge-in.** Interrupting means tapping stop — the mic is closed
  while the agent speaks, so it cannot hear you. Real barge-in needs
  acoustic echo cancellation and a VAD running on a live audio stream,
  which the Web Speech API does not expose.
- **Requires HTTPS** in production, or the mic never prompts.
- **Chrome's recognition is not on-device** — audio goes to Google's
  servers. Worth disclosing.
- Per-message speak buttons remain available outside voice mode.

Phase 2 (server TTS for a natural voice) is not built. If you add it, do
**not** accept arbitrary text at an endpoint — that makes the site a free
TTS service anyone can bill to you. Speak by message id instead, which
needs ids added to the backend schema first.

### Theming

Override any `--agent-*` property from your own stylesheet:
`--agent-accent`, `--agent-bg`, `--agent-fg`, `--agent-surface`,
`--agent-border`, `--agent-muted`, `--agent-danger`, `--agent-pre-bg`.

### Notes

- The backend is non-streaming; the typing indicator stands in for it. If
  you add SSE later, only `apiService/chat.ts` and `reactQuery/useChat.ts`
  change.
- Markdown renders without `rehype-raw`, so model output cannot inject HTML.
  Keep it that way.
- React Query devtools mount in development only, bottom-right. The
  `process.env.NODE_ENV === "development"` guard must stay a literal
  comparison or the import stops being tree-shaken.
