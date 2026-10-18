# Redroller listing polish

Brad selected polishing the existing dark olive and coral branding on 19 October 2026.

Use the established layered-card icon and wordmark. Add a wide branded banner and two real screenshots from the published v0.0.4 reader: a desktop community feed and the internal image preview. Lead the listing with a short reader-facing explanation and a direct link to the public reader post. Retain complete usage, moderation, privacy, support and review information. Move repository setup and source architecture into a developer guide.

The alternative was a new visual identity; it was not selected. A separate marketing website is outside this change. Reddit owns the portal layout, so the work targets the app icon and rendered README.

Set `marketingAssets.icon` to a 1024px PNG rendered from the existing community SVG. README images need public HTTPS URLs: relative repository paths resolve against the developer portal and the GitHub repository is private. Upload only the selected listing assets to Reddit and replace image references with the returned URLs before publishing. The new icon requires publication and approval. Do not change the app's unlisted distribution mode.

Capture screenshots in a temporary logged-out reader session, without changing Brad's preferences. Record the screenshot source and image credits. Verify the icon dimensions, Markdown rendering, image loading and links; run the existing build and typecheck after the configuration change.

The supplied approval email confirms v0.0.4 is approved as unlisted. Reflect that in the copy without claiming that the new listing changes have already been approved.
