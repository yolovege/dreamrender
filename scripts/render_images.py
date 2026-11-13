#!/usr/bin/env python3
"""Fill in the missing pictures for data/scenes.tsv.

For every scene without images/<id>.jpg, ask FLUX.1 [schnell] on Cloudflare
Workers AI for a picture and save it as a 384x384 JPEG. Pictures you add by
hand (images/<id>.jpg/.jpeg/.png/.webp, any size) are converted to the same
format and kept. Finally images/index.json is rewritten so the site knows
which scenes have a picture.

Credentials come from CF_ACCOUNT_ID / CF_API_TOKEN in the environment, or from
~/.config/dreamrender/cloudflare.env. They are never printed.

    python3 scripts/render_images.py              # everything missing
    python3 scripts/render_images.py --limit 5    # at most 5 new pictures
    python3 scripts/render_images.py --redo 042 317   # draw these again

The free tier allows about 100 pictures a day; once it is used up the script
stops, and running it again the next day carries on where it left off.
"""

import argparse
import base64
import io
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent
SCENES = ROOT / "data" / "scenes.tsv"
IMAGES = ROOT / "images"
CREDENTIALS = Path.home() / ".config" / "dreamrender" / "cloudflare.env"
MODEL = "@cf/black-forest-labs/flux-1-schnell"
STEPS = 8
SIZE = 384
QUALITY = 80
STYLE = (
    "1990s VHS home video still, found footage, washed out colors, chromatic aberration, "
    "tape noise, flash photography at night, dreamlike and strange, blurry, nostalgic"
)
HAND_MADE = (".jpeg", ".png", ".webp", ".jpg")
GIVE_UP_AFTER = 3  # consecutive failures of other kinds, e.g. the network is down
QUOTA_USED_UP = "daily free allocation"


def read_scenes():
    scenes = []
    for number, line in enumerate(SCENES.read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip() or line.startswith("#"):
            continue
        parts = line.split("\t")
        if len(parts) != 4:
            sys.exit(f"data/scenes.tsv 第 {number} 行：要有編號、中文字幕、英文字幕、畫面描述四欄，用 Tab 分開")
        scenes.append({"id": parts[0].strip(), "prompt": parts[3].strip()})
    return scenes


def credentials():
    values = {k: os.environ.get(k) for k in ("CF_ACCOUNT_ID", "CF_API_TOKEN")}
    if not all(values.values()) and CREDENTIALS.exists():
        for line in CREDENTIALS.read_text().splitlines():
            key, _, value = line.partition("=")
            if key.strip() in values and not values[key.strip()]:
                values[key.strip()] = value.strip()
    if not all(values.values()):
        sys.exit(f"找不到 Cloudflare 金鑰：請設定 CF_ACCOUNT_ID / CF_API_TOKEN，或寫在 {CREDENTIALS}")
    return values["CF_ACCOUNT_ID"], values["CF_API_TOKEN"]


def save(image, scene_id):
    square = ImageOps.fit(image.convert("RGB"), (SIZE, SIZE), Image.LANCZOS)
    square.save(IMAGES / f"{scene_id}.jpg", "JPEG", quality=QUALITY, optimize=True)


def adopt_hand_made(ids):
    """Bring hand-added pictures to the site's size and format."""
    for path in sorted(IMAGES.iterdir()):
        if path.suffix.lower() not in HAND_MADE or path.stem not in ids:
            continue
        with Image.open(path) as image:
            if path.suffix == ".jpg" and image.size == (SIZE, SIZE):
                continue
            image.load()
            save(image, path.stem)
        if path.suffix != ".jpg":
            path.unlink()
        print(f"{path.stem}：已把你放的圖轉成網站用的尺寸")


def draw(account, token, prompt):
    """Returns (jpeg bytes, None) or (None, error message)."""
    request = urllib.request.Request(
        f"https://api.cloudflare.com/client/v4/accounts/{account}/ai/run/{MODEL}",
        data=json.dumps({"prompt": f"{prompt}, {STYLE}", "steps": STEPS}).encode(),
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            body = json.load(response)
    except urllib.error.HTTPError as error:
        body = json.loads(error.read() or b"{}")
    except (urllib.error.URLError, TimeoutError) as error:
        return None, f"network: {error}"
    image = (body.get("result") or {}).get("image")
    if image:
        return base64.b64decode(image), None
    errors = body.get("errors") or [{"message": "no image in the reply"}]
    return None, "; ".join(str(e.get("message", e)) for e in errors)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--limit", type=int, help="draw at most this many new pictures")
    parser.add_argument("--redo", nargs="+", metavar="ID", help="draw these scenes again even if they have a picture")
    args = parser.parse_args()

    scenes = read_scenes()
    ids = {s["id"] for s in scenes}
    unknown = set(args.redo or []) - ids
    if unknown:
        sys.exit(f"data/scenes.tsv 裡沒有這些編號：{' '.join(sorted(unknown))}")
    IMAGES.mkdir(exist_ok=True)
    adopt_hand_made(ids)

    redo = set(args.redo or [])
    todo = [s for s in scenes if s["id"] in redo or not (IMAGES / f"{s['id']}.jpg").exists()]
    if args.limit is not None:
        todo = todo[: args.limit]

    drawn, filtered, failures = 0, [], 0
    if todo:
        account, token = credentials()
    for scene in todo:
        jpeg, error = draw(account, token, scene["prompt"])
        if jpeg:
            with Image.open(io.BytesIO(jpeg)) as image:
                save(image, scene["id"])
            drawn += 1
            failures = 0
            print(f"{scene['id']}：完成")
        elif "NSFW" in error:
            filtered.append(scene["id"])
            print(f"{scene['id']}：被內容過濾擋下")
        elif QUOTA_USED_UP in error:
            print("今天的免費額度用完了，明天早上 8 點（台灣時間）重置後再跑一次就會接著生。")
            break
        else:
            failures += 1
            print(f"{scene['id']}：失敗（{error}）")
            if failures >= GIVE_UP_AFTER:
                print("連續失敗好幾次，先停下來。")
                break

    ready = sorted(p.stem for p in IMAGES.glob("*.jpg") if p.stem in ids)
    (IMAGES / "index.json").write_text(json.dumps(ready) + "\n")

    print(f"\n這次新生了 {drawn} 張，{len(scenes)} 句裡有 {len(ready)} 句已經有圖。")
    if filtered:
        print(
            "被內容過濾擋下的編號：" + " ".join(filtered)
            + "\n請改寫 data/scenes.tsv 裡這幾句的畫面描述，再跑一次。"
        )


if __name__ == "__main__":
    main()
