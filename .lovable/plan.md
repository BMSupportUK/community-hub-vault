# Plan: Make video-only New Content clear

## Recommendation
Add a short preview line for video-only forum posts so New Content does not show a blank dash. The best approach is:

- If the post has normal text, keep showing that text.
- If the post only contains a video embed or video link, show a clear fallback such as `Video shared in this topic`.
- If possible, include the video source, for example `YouTube video shared in this topic` or `Vimeo video shared in this topic`.
- Keep the topic title, board, author, and date as they are now.

This avoids forcing every user to write a description, while still making video-only posts understandable in the New Content feed.

## What I would change
1. Update the forum feed preview logic so embedded videos are detected before the HTML is stripped.
2. Add a helper that returns a readable preview:
   - text post: cleaned text preview
   - YouTube embed/link only: `YouTube video shared in this topic`
   - Vimeo embed/link only: `Vimeo video shared in this topic`
   - direct video file only: `Video shared in this topic`
   - no usable content: `No description added`
3. Use the same preview on:
   - Boro Fan Zone New Content page
   - member Latest Activity / all posts pages
   - any shared forum feed card using the existing post feed component
4. Keep the change display-only so it does not alter existing forum posts or stored data.

## Optional improvement
If you want stronger descriptions later, add an optional `Description` box when posting a video. The feed would show that written description first, then fall back to the automatic video message if no description was entered.

## Technical details
Current feed cards read `forum_posts.body`, strip HTML, and show `—` when no text remains. Video embeds are HTML-only, so their card preview becomes empty. I will replace that fallback with media-aware preview text in the shared forum feed code.
