# Listing assets

- `icon.png`: 1024 × 1024 PNG rendered from `../community/icon.svg`, preserving the existing Redroller layered-card mark.
- `banner.svg` / `banner.png`: 1600 × 400 banner extending the existing dark olive/coral identity, tagline and card-outline motif.
- `reader-desktop.jpg`: real published v0.0.4 reader screenshot, captured 19 October 2026 from the public reader post below, browsing r/EarthPorn Hot. A temporary logged-out session was used. Cropped only to remove the Reddit modal title bar.
- `post-preview.jpg`: the same session, with the internal preview open for “Tatra Mountains, Poland [4608x3072] [OC]” by u/StiopaK. Cropped only to remove the Reddit modal title bar. No UI or feed content was fabricated.

Source: https://www.reddit.com/r/redroller/comments/1x76oio/redroller_explore_your_favourite_subreddits/

Reddit posts and photographs belong to their respective creators. The screenshots demonstrate the reader; they do not imply ownership of the displayed photographs. Visible desktop examples include work by u/Alaric_Darconville, u/StiopaK, u/wheres_felix, u/Popular-Seat4361 and u/imtoooldforthis_.

## Publishing

The developer portal renders README image paths literally. The following assets were uploaded through the authenticated Devvit media service for `redroller-reader` on 19 October 2026. Each public URL was fetched successfully and its image type and dimensions checked before inclusion in the README. Reddit serves the JPEG uploads with a `.jpeg` extension.

- Banner: https://i.redd.it/dkfmq1uq8bwh1.png
- Desktop reader: https://i.redd.it/rzy68sxq8bwh1.jpeg
- Post preview: https://i.redd.it/dipqervq8bwh1.jpeg

Keep the original local assets for future edits; the listing uses the public Reddit-hosted copies because this private repository cannot provide anonymous raw GitHub URLs.

The icon is configured separately through `marketingAssets.icon` in `devvit.json`; it is applied after the version is published and approved. Keep the app unlisted unless Brad explicitly requests broader distribution.
