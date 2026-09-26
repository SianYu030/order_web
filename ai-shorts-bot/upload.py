#!/usr/bin/env python3
import json, os
from pathlib import Path
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload

ROOT=Path(__file__).resolve().parent
meta=json.loads((ROOT/"metadata.json").read_text(encoding="utf-8"))
oauth_raw=os.environ.get("YOUTUBE_OAUTH_JSON","").strip()
if not oauth_raw:
    raise SystemExit("YOUTUBE_OAUTH_JSON is not configured")

cfg=json.loads(oauth_raw)
required=["client_id","client_secret","refresh_token"]
missing=[k for k in required if not cfg.get(k)]
if missing:
    raise SystemExit("YOUTUBE_OAUTH_JSON missing: "+", ".join(missing))

creds=Credentials(
    token=None,
    refresh_token=cfg["refresh_token"],
    token_uri="https://oauth2.googleapis.com/token",
    client_id=cfg["client_id"],
    client_secret=cfg["client_secret"],
    scopes=["https://www.googleapis.com/auth/youtube.upload"],
)
youtube=build("youtube","v3",credentials=creds,cache_discovery=False)

privacy=os.environ.get("YOUTUBE_PRIVACY","private")
desc=meta.get("description","").strip()
hashtags=" ".join(meta.get("hashtags",[]))
if hashtags:
    desc=(desc+"\n\n"+hashtags).strip()

body={
    "snippet":{
        "title":meta.get("title","Animal Story")[:100],
        "description":desc[:5000],
        "categoryId":str(meta.get("category_id","15")),
    },
    "status":{
        "privacyStatus":privacy,
        "selfDeclaredMadeForKids":bool(meta.get("made_for_kids",False)),
        "containsSyntheticMedia":bool(meta.get("synthetic_media",False)),
    },
}
media=MediaFileUpload(str(ROOT/"output.mp4"),mimetype="video/mp4",resumable=True)
request=youtube.videos().insert(part="snippet,status",body=body,media_body=media)
response=None
while response is None:
    status,response=request.next_chunk()
    if status:
        print(f"Upload {int(status.progress()*100)}%")

result={
    "story_id":meta.get("story_id"),
    "video_id":response["id"],
    "privacy":response.get("status",{}).get("privacyStatus",privacy),
    "title":meta.get("title"),
}
(ROOT/"last_upload.json").write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding="utf-8")
print(json.dumps(result,ensure_ascii=False))
