![Redroller — Less noise. More rabbit holes.](https://i.redd.it/dkfmq1uq8bwh1.png)

# Redroller

**Your favourite subreddits. An endless wall of cards.**

Explore Reddit through images, galleries, videos and conversations in a spacious, scrolling reader. Browse All, dive into a community, or bring your favourites together in one feed — all inside Reddit.

**[Try Redroller →](https://www.reddit.com/r/redroller/comments/1x76oio/redroller_explore_your_favourite_subreddits/)** · [Visit r/redroller](https://www.reddit.com/r/redroller/) · [Get help](https://www.reddit.com/message/compose/?to=%2Fr%2Fredroller&subject=Redroller%20support)

Open the reader post, select **Open Redroller**, then choose **Continue without saving** or **Remember my reading**. You don't need to install anything to browse. Use Reddit's **Fullscreen** option for the most space.

![Redroller's desktop reader showing a three-column landscape photography feed with subreddit search, sorting and discovery.](https://i.redd.it/rzy68sxq8bwh1.jpeg)

*The live desktop reader, browsing r/EarthPorn. Posts and images belong to their respective creators; feed content changes over time.*

## Find your next rabbit hole

- **Keep rolling.** Explore All or enter a subreddit. New cards load as you scroll, with a manual load-more option when you need it.
- **Make it your feed.** Choose Hot, New or Top, set a Top time range, switch between comfortable and compact layouts, or show only media.
- **Keep your favourites close.** Enable saving, star communities and open **Favourites mix** to browse them together.
- **Discover somewhere new.** Try Recommended for connections to your favourites, Popular for All-time or Trending suggestions, or Random for a fresh selection.
- **Pick up where you left off.** Optional reading memory saves preferences, seen posts and a best-effort reading position. **Hide seen** skips posts viewed before you opened the current feed.

New readers start at **All**. Select **Discover → All** or the Redroller logo to return there. All is Reddit-wide, rather than your personalised Home feed; the app cannot access your subscriptions, saved posts, votes or Reddit browsing history.

## Take a closer look

Select a card's image, title or comment count to open a post preview inside the reader. Explore galleries, play supported videos, read text, or inspect an image at its loaded resolution. Close the preview and carry on from the same place.

![Redroller's internal post preview showing a landscape image with Fit/100% zoom and gallery controls.](https://i.redd.it/dipqervq8bwh1.jpeg)

*Image-preview example: “Tatra Mountains, Poland” by u/StiopaK in r/EarthPorn. The **100%** control opens the loaded image at its natural size.*

| Control | Action |
| --- | --- |
| `j` / `k` | Focus the next / previous card. |
| `Enter` on a focused card | Open its preview, or reveal spoiler content first. |
| Left / right arrow with an image fitted | Move between gallery images. |
| Click an image or select **100%** | Zoom to the loaded image's natural dimensions. |
| Drag, scroll or use arrow keys while zoomed | Pan around the image. |
| Click the zoomed image or select **Fit image** | Return to the fitted view. |
| `Escape` | Reset zoom first, then close the preview. |

Click inside the reader before using keyboard shortcuts. **Open on Reddit** takes you to the original post in the current tab, where you can read comments, interact or report content.

## Your reading, your choice

Use **Continue without saving** for a temporary session. Sign in to Reddit and choose **Remember my reading** if you want favourites and reading memory across visits. Saving is optional, and your favourites stay separate from your Reddit subscriptions.

Open **Privacy & help** at any time to read the privacy policy and terms, change your saving choice or delete your saved data. Redroller supports public, non-mature communities; private and quarantined communities, mature posts and removed posts are excluded. Spoiler media stays hidden until you reveal it.

## For community moderators

Redroller is **approved as an unlisted app**. Readers can use the existing public reader in r/redroller; the developer listing is where eligible moderators manage installation. Unlisted approval does not make the app available for every community to install.

If the app is available for a community you moderate:

1. Install it from the [Redroller app page](https://developers.reddit.com/apps/redroller-reader).
2. Select **Create Redroller reader** from the subreddit moderator menu.
3. Share or pin the launch post so people can open the reader.

Each installation has separate saved data. Favourites and reading preferences do not transfer between app identities or subreddit installations.

## Support and release notes

[Message the r/redroller moderators](https://www.reddit.com/message/compose/?to=%2Fr%2Fredroller&subject=Redroller%20support) for help or to report an app issue. Include the community, device and what happened. To report a Reddit post, use **Open on Reddit** and Reddit's report controls.

**Version 0.0.4** is approved as unlisted and installed in r/redroller. It improves desktop scrolling by loading more posts when any column runs low and reserving space while images load. All feeds and internal post previews are also available.

Redroller is independently maintained, inspired by Scrolledit, and is not endorsed by Reddit.

## Privacy and retention

Saving is opt-in. When enabled, the app stores the Reddit user ID, favourites, preferences, up to 2,000 seen-post IDs, and a feed resume marker in installation-scoped Reddit Redis storage. Data expires 30 days after its last save. The app does not persist post bodies or media, use external analytics, sell reading data, or train AI models on Reddit content. Reddit and media hosts process the requests required to display content.

**Privacy & help → Delete my saved data** removes the account's saved records in that installation. Consent tokens and Redis transactions stop stale tabs and in-flight saves restoring deleted data. Saving again requires a fresh explicit choice. Earlier playtest data is migrated when the user enables saving, or can be deleted without opting in; access and the installing developer's upgrade apply a 30-day expiry to legacy records.

Devvit currently exposes no supported account-deletion trigger for this app. Inactive/deleted accounts' new-format data expires under the retention period above. Legacy records belonging to testers who never return cannot be globally enumerated with the available storage API; this remains a known limitation. Contact the r/redroller moderators with the installation subreddit for earlier removal. Reddit's service logs follow Reddit's own retention rules. The in-app privacy policy and terms are available before consent and from **Privacy & help** throughout the reader.

### Review notes

This release requests only the Reddit API and Redis permissions. It uses no external server or AI service. Reddit content access uses the app's Devvit context, not a user's personal OAuth token; the app does not claim to reproduce personalised Reddit blocking or feed preferences. Community access checks reject private, quarantined, and mature communities before requesting their posts.

Desktop playtest and responsive browser checks are part of development validation. Testing in the actual Reddit mobile app and from a regular non-moderator account remains outstanding and must not be inferred from responsive browser checks. The account-deletion and legacy-retention limitations above are disclosed for review.

## Current limitations

- **Open on Reddit uses the current tab.** The tested Reddit host blocks direct popups from the embedded app and ignores the navigation effect's new-tab target.
- **Image zoom uses the supplied image.** Direct images and gallery media can be viewed at their natural dimensions; posts with only a thumbnail cannot gain additional detail through zooming.
- **Reading position is best effort.** Feeds change, posts can disappear, and saved cursors may no longer reproduce the same list.
- **Reddit controls availability.** Only public or publicly readable restricted communities without mature/quarantine flags are supported. Banned or unavailable communities fail to load. Video playback depends on the media supplied by Reddit.
- **Release availability depends on Reddit review.** Updates require their own approval before public rollout. A standalone website deployment is not included.

## For developers

The source repository contains a [development guide](https://github.com/blittersptyltd/redroller/blob/main/docs/DEVELOPMENT.md) with setup, commands and architecture notes. Repository access is required. The app identifier is `redroller-reader`; development uses the private `r/redroller_reader_dev` playtest. No separate Reddit API client ID or project `.env` variables are needed.
