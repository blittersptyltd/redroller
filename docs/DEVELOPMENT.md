# Developing Redroller

Redroller runs inside Reddit using Devvit, React, TypeScript, Vite, Hono and Redis. For the reader-facing overview, see [README.md](../README.md).

## Development setup

### Requirements

- Node.js **22.20.0 or newer**, as specified in `package.json`, and npm.
- A registered Reddit developer account with access to the Devvit app and its test subreddit.
- GitHub access to this private repository.

```bash
git clone https://github.com/blittersptyltd/redroller.git
cd redroller
npm ci
npx devvit login
npm run dev
```

`npm run dev` starts a Devvit playtest using the app and private test subreddit configured in [`devvit.json`](../devvit.json). It builds the client and server, uploads changes, and prints a Reddit playtest URL. This is a Reddit-hosted development loop, rather than a standalone localhost reader.

To select another authorised test subreddit:

```bash
npm run dev -- your_test_subreddit
```

For a separate deployment, register your own Devvit app and update `name` and `dev.subreddit` in `devvit.json`. Cloning this repository does not grant permission to upload to the existing app.

If the installation has no reader post yet, use the subreddit moderator menu action **Create Redroller reader**.

The current application does not require project `.env` variables or a separate Reddit API client ID/secret. Reddit API access and Redis storage come from the Devvit runtime; the CLI handles developer authentication.

### Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Build, upload, and watch the configured private playtest. |
| `npm run build` | Build client and server bundles into `dist/`. |
| `npm run typecheck` | Check server/shared and client TypeScript configurations. |
| `npm test` | Run the configured server test entrypoints. |
| `node --import tsx src/server/feed.test.ts` | Run the existing suite directly with individual TAP test results. |

Tests cover input validation, media normalization, pagination, mixed feeds, reader state, discovery, content restrictions, consent, migration, retention, and deletion with concurrent saves. UI behaviour should also be checked in the live playtest, particularly fullscreen/mobile layouts, image controls, and saved preferences.

Stopping the playtest process leaves its last uploaded version installed. Public publication is a separate release step; see the [Devvit playtest guide](https://developers.reddit.com/docs/guides/tools/playtest) and [launch guide](https://developers.reddit.com/docs/guides/launch/launch-guide).

## How it works

The React client requests feed and preference data from Hono routes in the Devvit server. The server validates inputs with Zod, uses the Devvit Reddit SDK to retrieve content, and uses the trusted runtime user ID to scope Redis records. Media URLs returned by Reddit are displayed by the browser.

| File | Responsibility |
| --- | --- |
| [`src/client/main.tsx`](../src/client/main.tsx) | Reader layout, cards, feeds, favourites, pagination, and keyboard browsing. |
| [`src/client/reader-features.tsx`](../src/client/reader-features.tsx) | Saved reader state, post preview, and discovery UI. |
| [`src/client/styles.css`](../src/client/styles.css) | Responsive layouts and visual styling. |
| [`src/client/launch.tsx`](../src/client/launch.tsx) | Inline launch screen for the Reddit post. |
| [`src/client/privacy.tsx`](../src/client/privacy.tsx) | Consent choices, privacy policy, terms, support, and deletion controls. |
| [`src/server/index.ts`](../src/server/index.ts) | API routes, consent checks, and reader-post creation. |
| [`src/server/user-data.ts`](../src/server/user-data.ts) | Account-scoped storage, retention, legacy migration, and deletion transactions. |
| [`src/server/feed.ts`](../src/server/feed.ts) | Post normalization and single-community / mixed-feed pagination. |
| [`src/server/discovery.ts`](../src/server/discovery.ts) | Community recommendation, popularity, and random-selection logic. |
| [`lib/reddit.ts`](../lib/reddit.ts) | Shared Zod schemas and TypeScript types. |
| [`devvit.json`](../devvit.json) | App identity, permissions, and entrypoints. |

### Discovery sources

- **Recommended** follows community links in favourites' descriptions, supplemented by public discussions explicitly mentioning those favourites. Suggestions include a reason. No LLM or trained recommendation model is used.
- **Popular — All time** ranks communities by combined scores in Reddit's top 100 all-time Popular posts.
- **Popular — Trending** ranks communities by appearances and position in the current Popular listing.
- **Random** shuffles communities found in recent `r/all` posts, avoiding favourites and recently suggested communities where possible.

Suggestions are checked for availability and exclude private, NSFW, quarantined, and discovery-disabled communities. Popularity is based on sampled listings, not an exhaustive ranking of every subreddit. Recommendations are fetched on demand without storing a separate copy of a user's favourite-derived results.

## Repository hygiene

Keep credentials out of source control. [`.gitignore`](../.gitignore) excludes `.env*`, `.devvit/`, `node_modules/`, and generated `dist/` bundles. Commit `package-lock.json` with dependency changes so installations remain reproducible.

## AI-assisted development example

Redroller was developed through an iterative AI-assisted workflow: start with a browsing idea, build against the available Reddit platform, test with real content, and refine the interface from screenshots and feedback. The compact layout, favourites, discovery modes, and image zoom provide concrete examples for a future website training section. The application itself does not train an AI model.
