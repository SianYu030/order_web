# YouTube API Compliance Audit — Draft Answers

This file is a preparation checklist for the official YouTube API Services Audit and Quota Extension Form. Review every answer before submission.

## Section 1 — Request Type

Select:
- Complete a compliance audit to request for additional quota

Purpose:
- Compliance audit for a YouTube Data API project using videos.insert.
- The main objective is to have the API project verified so videos uploaded through videos.insert are not restricted to private viewing mode.
- Do not request unnecessary quota. The intended usage is approximately one original Short upload per day.

## Section 2 — Organization and Contact Information

Applying as:
- As an individual user

Organization legal name:
- self

Parent company:
- self

Organization size/type:
- Independent Developer/Sole Proprietor

Primary website:
- Use the public GitHub repository URL for this project.

Category:
- Choose the closest available creator software / media / technology category. If no close match is available, choose Other and write: "Personal creator automation software."

Primary contact:
- Use your own legal name and contact email.

Technical contact:
- Same as Primary Contact

Business contact:
- Same as Primary Contact

## Section 3 — Business Model and Google Contacts

Describe your work as it relates to YouTube:

"AI Shorts Bot is a single-user creator automation used only by me for my own YouTube channel. It generates original short-form vertical videos, renders them with Python and FFmpeg, prepares original titles/descriptions/hashtags, and uploads them through the YouTube Data API v3. The API client does not download or re-upload other creators' videos, does not automate views/likes/comments/subscribers, and does not sell or exchange engagement. The independent value provided by the client is original content generation, rendering, metadata preparation, and automated upload of content created by the operator."

Target audience:
- Individual Content Creators
- Internal Users (if available / appropriate)

Revenue model:
- Free service (we do not charge users)

If asked about ads inside the API client:
- Not applicable

Google representative:
- No, I do not have a Google representative

## Section 4 — API Client Overview

API Client Name:
- AI Shorts Bot

Does the name contain the word YouTube?
- No

Primary Access URL:
- Use the public GitHub repository URL, preferably the ai-shorts-bot folder or project README.

Privacy Policy URL:
- Use the public GitHub URL for ai-shorts-bot/PRIVACY.md

Terms of Service URL:
- Use the public GitHub URL for ai-shorts-bot/TERMS.md

Is the API Client publicly accessible?
- No

Reviewer access / special instructions:

"AI Shorts Bot is a single-user, non-public automation and has no customer login or public web interface. The source code and workflow are available in the public GitHub repository. The YouTube upload client is ai-shorts-bot/upload.py and the GitHub Actions workflow is .github/workflows/ai-shorts-bot.yml. OAuth credentials are stored only in GitHub Actions encrypted secrets and are not committed to the repository. The workflow currently defaults uploads to private while the API project is unverified."

## Section 5 — Project and Use Case

Google Cloud Project Number:
- Enter the numeric Project Number shown in Google Cloud Console. Do not enter the Project ID.

Use case category:
- Video Uploading & Account Management
- Tools for Creators (if multiple selections are allowed and the form considers this applicable)

OAuth 2.0:
- Yes

OAuth scope actually used:
- https://www.googleapis.com/auth/youtube.upload

Primary endpoint:
- youtube.videos.insert

Expected usage:
- Approximately 1 upload per day.
- Select the lowest quota level that comfortably covers this usage.
- Do not request higher quota unless actually needed.

Use-case description:

"AI Shorts Bot creates original short-form videos and uploads them only to the Google-account owner's own YouTube channel. The client uses OAuth 2.0 with the youtube.upload scope and calls youtube.videos.insert with snippet and status metadata. It sets title, description, category, made-for-kids status, synthetic-media disclosure status, and privacy status. The client does not manage third-party channels, automate engagement, scrape YouTube, or perform mass re-uploads. Current upload frequency is approximately one original Short per day."

## Evidence Checklist

Prepare these files/screenshots requested by the form:

1. Privacy Policy screenshot
   - Show the YouTube API Services section.
   - Show the Google Privacy Policy link.
   - Show the revocation / deletion section.

2. Homepage / project screenshot
   - Show the project name.
   - Show a visible link to the Privacy Policy.
   - If YouTube branding is displayed, use it only in accordance with YouTube branding rules.

3. Terms of Service screenshot / document
   - Use ai-shorts-bot/TERMS.md.

4. OAuth flow screenshots
   - Consent / authorization screen.
   - Requested YouTube upload scope.
   - If possible, a screen showing how access can be revoked.

5. Upload-interface / workflow evidence
   - Screenshot of the GitHub Actions workflow.
   - Screenshot or source view of ai-shorts-bot/upload.py.
   - Screenshot showing a successful API upload.
   - Do not expose client secrets, refresh tokens, authorization codes, access tokens, or GitHub secrets.

## Important

Never include credentials or tokens in the audit form screenshots or public repository.

The public workflow should remain set to private uploads until the API project has passed the compliance audit.
