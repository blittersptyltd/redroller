# Redroller

A responsive, infinite-scrolling Reddit reader inspired by Scrolledit. Browse subreddits as visual cards, save favourites, discover related communities, and inspect images without losing your place.

Built with Reddit Devvit, React, TypeScript, Vite, Hono, and Redis. Redroller runs inside Reddit as an interactive post with an expanded reader view.

## Features

- **Card feeds:** images, galleries, Reddit-hosted video, and text posts with automatic pagination and a manual load-more fallback.
- **Feed controls:** Hot, New, and Top sorting; Top time ranges; media-only filtering; comfortable and compact layouts.
- **Favourites:** a persistent sidebar and a mixed feed combining saved communities. On small screens, navigation collapses into a menu.
- **Discovery:** Recommended, Popular (All time or Trending), and Random community suggestions.
- **Reading memory:** saved preferences, recent seen-post history, and an attempt to resume at the previous reading position.
- **Hide seen:** filters posts viewed before the current feed opened, so cards do not disappear while reading.
- **Image viewer:** fitted images by default, gallery controls, click-to-zoom to the loaded image's original resolution, and dragging or keyboard panning.
- **Content warnings:** NSFW and spoiler media require a reveal action.

## Try the current build

The development app is `redroller-brad`, installed in the private subreddit **r/redroller_brad_dev**.

[Open the Redroller launch post](https://www.reddit.com/r/redroller_brad_dev/comments/1x6y5ik/redroller_explore_your_favourite_subreddits/), then select **Open Redroller**. Use Reddit's **Fullscreen** option for the widest view.

Testers need a Reddit account and access to the private subreddit. A moderator can add them under **Mod Tools → Mods & Members → Approved users**. Favourites and reading preferences are stored separately for each Reddit user within the app installation.

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

`npm run dev` starts a Devvit playtest using the app and subreddit configured in [`devvit.json`](devvit.json). It builds the client and server, uploads changes, and prints a Reddit playtest URL. This is a Reddit-hosted development loop, rather than a standalone localhost reader.

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

Tests cover input validation, media normalization, pagination, mixed feeds, reader state, and discovery. UI behaviour should also be checked in the live playtest, particularly fullscreen/mobile layouts, image controls, and saved preferences.

Stopping the playtest process leaves its last uploaded version installed. Public publication is a separate release step; see the [Devvit playtest guide](https://developers.reddit.com/docs/guides/tools/playtest) and [launch guide](https://developers.reddit.com/docs/guides/launch/launch-guide).

## Reader controls

Click inside the reader before using keyboard shortcuts.

| Control | Action |
| --- | --- |
| `j` / `k` | Focus the next / previous card. |
| `Enter` on a focused card | Open its image viewer, reveal content, or open the post, depending on the card. |
| Left / right arrow in a fitted image viewer | Move between gallery images. |
| Click an image or select **100%** | Switch to the loaded image's original dimensions. |
| Drag, scroll, or use arrow keys while zoomed | Pan around the image. |
| Click the zoomed image or select **Fit image** | Return to the fitted view. |
| `Escape` | Reset zoom first; close the viewer when already fitted. |

## How it works

The React client requests feed and preference data from Hono routes in the Devvit server. The server validates inputs with Zod, uses the Devvit Reddit SDK to retrieve content, and uses the trusted runtime user ID to scope Redis records. Media URLs returned by Reddit are displayed by the browser.

| File | Responsibility |
| --- | --- |
| [`src/client/main.tsx`](src/client/main.tsx) | Reader layout, cards, feeds, favourites, pagination, and keyboard browsing. |
| [`src/client/reader-features.tsx`](src/client/reader-features.tsx) | Saved reader state, image viewer, and discovery UI. |
| [`src/client/styles.css`](src/client/styles.css) | Responsive layouts and visual styling. |
| [`src/client/launch.tsx`](src/client/launch.tsx) | Inline launch screen for the Reddit post. |
| [`src/server/index.ts`](src/server/index.ts) | API routes, user-scoped storage, caching, and reader-post creation. |
| [`src/server/feed.ts`](src/server/feed.ts) | Post normalization and single-community / mixed-feed pagination. |
| [`src/server/discovery.ts`](src/server/discovery.ts) | Community recommendation, popularity, and random-selection logic. |
| [`lib/reddit.ts`](lib/reddit.ts) | Shared Zod schemas and TypeScript types. |
| [`devvit.json`](devvit.json) | App identity, permissions, entrypoints, and test subreddit. |

### Discovery sources

- **Recommended** follows community links in favourites' descriptions, supplemented by public discussions explicitly mentioning those favourites. Suggestions include a reason. No LLM or trained recommendation model is used.
- **Popular — All time** ranks communities by combined scores in Reddit's top 100 all-time Popular posts.
- **Popular — Trending** ranks communities by appearances and position in the current Popular listing.
- **Random** shuffles communities found in recent `r/all` posts, avoiding favourites and recently suggested communities where possible.

Suggestions are checked for availability and exclude private, NSFW, quarantined, and discovery-disabled communities. Popularity is based on sampled listings, not an exhaustive ranking of every subreddit. Recommended and Popular results are cached for five minutes.

## Current limitations

- **Open on Reddit uses the current tab.** The tested Reddit host blocks direct popups from the embedded app and ignores the navigation effect's new-tab target.
- **Image zoom uses the supplied image.** Direct images and gallery media can be viewed at their natural dimensions; posts with only a thumbnail cannot gain additional detail through zooming.
- **Reading position is best effort.** Feeds change, posts can disappear, and saved cursors may no longer reproduce the same list.
- **Reddit controls availability.** Private, banned, quarantined, or otherwise unavailable communities may fail to load. Video playback depends on the media supplied by Reddit.
- **This is a private Devvit app.** A standalone website deployment and public app release are not included.

## Repository hygiene

Keep credentials out of source control. [`.gitignore`](.gitignore) excludes `.env*`, `.devvit/`, `node_modules/`, and generated `dist/` bundles. Commit `package-lock.json` with dependency changes so installations remain reproducible.

## AI-assisted development example

Redroller was developed through an iterative AI-assisted workflow: start with a browsing idea, build against the available Reddit platform, test with real content, and refine the interface from screenshots and feedback. The compact layout, favourites, discovery modes, and image zoom provide concrete examples for a future website training section. The application itself does not train an AI model.
