# AI Shorts Bot

Single-user creator automation for producing original YouTube Shorts and uploading them to the operator's own authorized channel.

## What it does

1. A scheduled ChatGPT automation reviews current Shorts trends and the operator's available channel analytics.
2. It creates an original `story.json` with a format, duration, hook, scenes, and characters.
3. GitHub Actions renders a vertical MP4 using Python, Pillow, and FFmpeg.
4. The upload client uses the YouTube Data API v3 `videos.insert` endpoint with OAuth 2.0 scope `youtube.upload`.
5. Rendered output and upload metadata are kept only as short-lived GitHub Actions artifacts for debugging.

The renderer uses programmatically generated original scenes and synthesized background audio. The project does not download or re-upload other creators' videos and is not designed to automate or inflate engagement.

## Privacy and Terms

- [Privacy Policy](./PRIVACY.md)
- [Terms of Service](./TERMS.md)
- [YouTube API Audit Draft](./AUDIT_FORM_DRAFT.md)

## Credentials

The uploader reads one GitHub Actions secret named `YOUTUBE_OAUTH_JSON`.

Credentials must never be committed to this public repository.

## YouTube API verification status

The workflow currently defaults to `YOUTUBE_PRIVACY: private`.

YouTube documents that videos uploaded through `videos.insert` by unverified API projects created after July 28, 2020 are restricted to private viewing mode until the API project passes a compliance audit. After the project passes the audit, the workflow can be changed to public uploads.

## Trigger

The GitHub workflow is triggered when `ai-shorts-bot/story.json` changes, or manually with `workflow_dispatch`. The separate GitHub cron schedule was removed to avoid duplicate daily uploads.
