# AI Shorts Bot Privacy Policy

Effective date: 2026-09-26

AI Shorts Bot is a single-user automation operated by the repository owner. It generates original short-form videos and uses the YouTube Data API v3 to upload those videos and their metadata to the operator's own authorized YouTube channel.

## YouTube API Services

AI Shorts Bot uses Google OAuth 2.0 and the YouTube Data API v3. The OAuth scope used by the upload client is:

- https://www.googleapis.com/auth/youtube.upload

The client uses this permission only to upload videos and set upload metadata such as title, description, category, audience setting, synthetic-media disclosure setting, and privacy status.

AI Shorts Bot does not use the YouTube API to purchase, generate, inflate, exchange, or manipulate views, likes, comments, subscribers, watch time, or other engagement.

## Data We Process

The upload workflow may process:

- OAuth client credentials and refresh token supplied by the operator.
- Generated video files and generated metadata.
- The YouTube video ID and upload result returned by the YouTube Data API.

OAuth credentials are stored only as encrypted GitHub Actions secrets and are not committed to this public repository.

Rendered videos and upload-result files may be retained temporarily as GitHub Actions artifacts for debugging. The current workflow retains these artifacts for 3 days.

## Data Sharing and Sale

AI Shorts Bot does not sell personal data or YouTube API data. The automation is not offered as a public multi-user service.

Data may be processed by service providers necessary to run the automation, including Google/YouTube and GitHub, subject to their own terms and privacy policies.

## Revoking Access

The operator can revoke Google/YouTube authorization at any time from the Google Account permissions / connected apps settings. The operator can also delete the GitHub Actions secret containing the OAuth credentials.

After authorization is revoked, credentials are no longer used. Stored user-authorized YouTube API data will be deleted as soon as reasonably possible and, where the YouTube API Services Developer Policies require it, within 30 calendar days.

## Google Privacy Policy

Google Privacy Policy:
https://policies.google.com/privacy

## YouTube API Services Terms and Developer Policies

This client is intended to comply with:

- YouTube API Services Terms of Service
- YouTube API Services Developer Policies
- Google API Services User Data Policy, where applicable

## Contact

Questions about this privacy policy can be raised through the public GitHub repository's Issues section or directly with the repository owner.
