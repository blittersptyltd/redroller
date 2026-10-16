# Redroller

A responsive, infinite-scrolling Reddit reader inspired by Scrolledit. Browse subreddits as visual cards, save favourites, discover related communities, and inspect images without losing your place.

Built with Reddit Devvit, React, TypeScript, Vite, Hono, and Redis. Redroller runs inside Reddit as an interactive post with an expanded reader view.

## Using Redroller

Open a Redroller post and select **Open Redroller**. Choose **Continue without saving** for a temporary session, or **Remember my reading** to enable account-linked favourites and reading memory. New readers start at **All**, showing posts across Reddit with the app's public/non-mature content filters. Select **Discover → All** or the logo to return there, or enter a subreddit in the top bar. Returning readers with saving enabled resume their existing selection. Reddit's **Fullscreen** option gives the reader the most space.

Star a community to add it to the favourites sidebar when saving is enabled. **Favourites mix** combines those communities; **Recommended**, **Popular**, and **Random** help find more. Open **Privacy & help** at any time to read the privacy policy and terms, contact the developer, or delete saved data.

For support or to report an app issue, [message u/braddown](https://www.reddit.com/message/compose/?to=braddown&subject=Redroller%20support). To report a post, use **Open on Reddit** and Reddit's report controls. Redroller is independently maintained and is not endorsed by Reddit.

### For moderators

Once the app is available for your community, install it through its [Devvit app page](https://developers.reddit.com/apps/redroller-brad), then select **Create Redroller reader** from the subreddit moderator menu. This creates the launch post. The first release is intended for unlisted review, not a public directory launch.

## Features

- **Card feeds:** images, galleries, Reddit-hosted video, and text posts with automatic pagination and a manual load-more fallback.
- **All feed:** a Reddit-wide feed in the Discover menu on desktop and mobile. This is not the user's personalised Reddit Home feed; Devvit does not expose subscriptions, saved content, votes, or browsing history.
- **Feed controls:** Hot, New, and Top sorting; Top time ranges; media-only filtering; comfortable and compact layouts.
- **Favourites:** a persistent sidebar and a mixed feed combining saved communities. On small screens, navigation collapses into a menu.
- **Discovery:** Recommended, Popular (All time or Trending), and Random community suggestions.
- **Optional reading memory:** saved preferences, recent seen-post history, and an attempt to resume at the previous reading position, enabled only after choosing to save.
- **Hide seen:** filters posts viewed before the current feed opened, so cards do not disappear while reading.
- **Image viewer:** fitted images by default, gallery controls, click-to-zoom to the loaded image's original resolution, and dragging or keyboard panning.
- **Content controls:** private, quarantined, and mature communities are excluded; mature and removed posts are filtered on the server. Spoiler media requires a reveal action.
- **Privacy controls:** temporary browsing, explicit saving consent, 30-day retention after the last save, and deletion of saved data.

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

Tests cover input validation, media normalization, pagination, mixed feeds, reader state, discovery, content restrictions, consent, migration, retention, and deletion with concurrent saves. UI behaviour should also be checked in the live playtest, particularly fullscreen/mobile layouts, image controls, and saved preferences.

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
| [`src/client/privacy.tsx`](src/client/privacy.tsx) | Consent choices, privacy policy, terms, support, and deletion controls. |
| [`src/server/index.ts`](src/server/index.ts) | API routes, consent checks, and reader-post creation. |
| [`src/server/user-data.ts`](src/server/user-data.ts) | Account-scoped storage, retention, legacy migration, and deletion transactions. |
| [`src/server/feed.ts`](src/server/feed.ts) | Post normalization and single-community / mixed-feed pagination. |
| [`src/server/discovery.ts`](src/server/discovery.ts) | Community recommendation, popularity, and random-selection logic. |
| [`lib/reddit.ts`](lib/reddit.ts) | Shared Zod schemas and TypeScript types. |
| [`devvit.json`](devvit.json) | App identity, permissions, entrypoints, and test subreddit. |

### Discovery sources

- **Recommended** follows community links in favourites' descriptions, supplemented by public discussions explicitly mentioning those favourites. Suggestions include a reason. No LLM or trained recommendation model is used.
- **Popular — All time** ranks communities by combined scores in Reddit's top 100 all-time Popular posts.
- **Popular — Trending** ranks communities by appearances and position in the current Popular listing.
- **Random** shuffles communities found in recent `r/all` posts, avoiding favourites and recently suggested communities where possible.

Suggestions are checked for availability and exclude private, NSFW, quarantined, and discovery-disabled communities. Popularity is based on sampled listings, not an exhaustive ranking of every subreddit. Recommendations are fetched on demand without storing a separate copy of a user's favourite-derived results.

## Privacy and retention

Saving is opt-in. When enabled, the app stores the Reddit user ID, favourites, preferences, up to 2,000 seen-post IDs, and a feed resume marker in installation-scoped Reddit Redis storage. Data expires 30 days after its last save. The app does not persist post bodies or media, use external analytics, sell reading data, or train AI models on Reddit content. Reddit and media hosts process the requests required to display content.

**Privacy & help → Delete my saved data** removes the account's saved records in that installation. Consent tokens and Redis transactions stop stale tabs and in-flight saves restoring deleted data. Saving again requires a fresh explicit choice. Earlier playtest data is migrated when the user enables saving, or can be deleted without opting in; access and the installing developer's upgrade apply a 30-day expiry to legacy records.

Devvit currently exposes no supported account-deletion trigger for this app. Inactive/deleted accounts' new-format data expires under the retention period above. Legacy records belonging to testers who never return cannot be globally enumerated with the available storage API; this remains a pre-release limitation. Contact u/braddown with the installation subreddit for earlier removal. Reddit's service logs follow Reddit's own retention rules. The in-app privacy policy and terms are available before consent and from **Privacy & help** throughout the reader.

### Review notes

This release requests only the Reddit API and Redis permissions. It uses no external server or AI service. Reddit content access uses the app's Devvit context, not a user's personal OAuth token; the app does not claim to reproduce personalised Reddit blocking or feed preferences. Community access checks reject private, quarantined, and mature communities before requesting their posts.

Desktop playtest and responsive browser checks are part of development validation. Testing in the actual Reddit mobile app and from a regular non-moderator account remains outstanding and must not be inferred from responsive browser checks. The account-deletion and legacy-retention limitations above are disclosed for review.

## Current limitations

- **Open on Reddit uses the current tab.** The tested Reddit host blocks direct popups from the embedded app and ignores the navigation effect's new-tab target.
- **Image zoom uses the supplied image.** Direct images and gallery media can be viewed at their natural dimensions; posts with only a thumbnail cannot gain additional detail through zooming.
- **Reading position is best effort.** Feeds change, posts can disappear, and saved cursors may no longer reproduce the same list.
- **Reddit controls availability.** Only public or publicly readable restricted communities without mature/quarantine flags are supported. Banned or unavailable communities fail to load. Video playback depends on the media supplied by Reddit.
- **Release availability depends on Reddit review.** The current test installation is private. A standalone website deployment is not included.

## Repository hygiene

Keep credentials out of source control. [`.gitignore`](.gitignore) excludes `.env*`, `.devvit/`, `node_modules/`, and generated `dist/` bundles. Commit `package-lock.json` with dependency changes so installations remain reproducible.

## AI-assisted development example

Redroller was developed through an iterative AI-assisted workflow: start with a browsing idea, build against the available Reddit platform, test with real content, and refine the interface from screenshots and feedback. The compact layout, favourites, discovery modes, and image zoom provide concrete examples for a future website training section. The application itself does not train an AI model.
