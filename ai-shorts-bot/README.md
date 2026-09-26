# AI Shorts Bot

Zero-extra-cost prototype for a nightly YouTube Shorts pipeline.

## What it does

1. ChatGPT automation prepares an original `story.json`.
2. GitHub Actions renders a 30-second vertical MP4 using Python + FFmpeg.
3. If the repository secret `YOUTUBE_OAUTH_JSON` exists, it uploads the MP4 to YouTube.
4. The workflow stores the rendered video as a short-lived artifact for debugging.

The renderer uses programmatically drawn original cartoon scenes and original synthesized background audio, so it does not download or reuse other creators' videos.

## One secret only

Create a GitHub Actions secret named:

`YOUTUBE_OAUTH_JSON`

with this JSON structure:

```json
{
  "client_id": "YOUR_GOOGLE_OAUTH_CLIENT_ID",
  "client_secret": "YOUR_GOOGLE_OAUTH_CLIENT_SECRET",
  "refresh_token": "YOUR_YOUTUBE_REFRESH_TOKEN"
}
```

Never commit these credentials to this public repository.

## Important YouTube limitation

New unverified YouTube Data API projects can upload through the API, but YouTube restricts those uploads to **private** until the API project passes YouTube's compliance audit. The workflow therefore defaults to private uploads.

After the project is audited, change `YOUTUBE_PRIVACY` in the workflow from `private` to `public`.

## Schedule

The GitHub workflow runs at 21:30 UTC, which is 05:30 in Taiwan (UTC+8).
