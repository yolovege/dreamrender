# dreamrender

打開就一直播的網頁：每 6 秒一句毫無意義、但合文法的中文句子，配一張用 AI 預先畫好的圖，
看起來像 90 年代家庭錄影帶裡的一場夢。

純靜態網頁，觀眾打開時不呼叫任何 AI 服務。圖是事先用 Cloudflare Workers AI 的 FLUX.1 [schnell] 生好的。

## 在本機看

```bash
npm start   # 等同 python3 -m http.server 8000
```

然後打開 <http://localhost:8000>。

## 加新的句子和圖

所有句子都在 `data/scenes.tsv`，一行一句，三欄用 Tab 分開：

```
編號	中文字幕	英文畫面描述
501	洗衣機今天決定改當旋轉木馬。	a washing machine in a laundromat at night spinning like a tiny carousel with horses inside
```

1. **加句子**：在檔案最後加一行。編號接著最後一個往下編。字幕 8 到 45 個字，結尾是「。」「？」「！」其中之一。
   英文畫面描述要寫成具體的畫面，不是逐字翻譯；不想自己寫可以請 Claude 幫忙。
2. **配圖**，二選一：
   - **讓 AI 畫**：跑 `npm run render`。它只會畫還沒有圖的句子。
   - **用自己的圖**：把圖存成 `images/<編號>.jpg`（也可以是 `.png`、`.webp`，任何尺寸），再跑 `npm run render`。
     它會把圖裁成正方形、縮成網站用的大小，不會另外叫 AI 畫。
3. **檢查**：跑 `npm test`，確認欄位、編號、字數都沒寫錯。
4. **上線**：commit 並 push 到 `main`，網站約一分鐘後更新。

只有已經有圖的句子會播出來，所以可以先加句子、之後再補圖。

### 重畫不滿意的圖

```bash
npm run render -- --redo 042 317
```

每次畫出來都不一樣。也可以先改 `data/scenes.tsv` 裡那句的畫面描述再重畫。

### 被內容過濾擋下

偶爾會有句子被 Cloudflare 的內容過濾誤擋（例如「生氣的水餃」）。腳本最後會列出被擋的編號，
改寫那幾句的畫面描述，換掉可能被誤會的字，再跑一次。

### 免費額度

Cloudflare 的免費額度每天約可畫 100 張，台灣時間早上 8 點重置。額度用完腳本會自己停，
隔天再跑同一個指令就會接著畫。

## 第一次設定

- Python 3 和 Pillow：`pip install pillow`
- Cloudflare 金鑰：在 Cloudflare 後台的 Workers AI 頁面點 **Use REST API**，建立 API token 並記下 Account ID，
  存成 `~/.config/dreamrender/cloudflare.env`（不要放進這個 repo）：

  ```
  CF_ACCOUNT_ID=你的帳號ID
  CF_API_TOKEN=你的token
  ```

## 測試

```bash
npm install                      # 只裝冒煙測試用的 Playwright
npx playwright install chromium  # 第一次才需要
npm test                         # 資料檔、洗牌、做舊處理
npm run smoke                    # 用無頭瀏覽器實際播 20 多秒，截圖存到 smoke-out/
```

## 檔案

| 檔案 | 做什麼 |
|---|---|
| `data/scenes.tsv` | 所有句子：編號、中文字幕、英文畫面描述 |
| `images/<編號>.jpg` | 每句的圖，384×384 |
| `images/index.json` | 哪些句子已經有圖（`npm run render` 會自動更新） |
| `scripts/render_images.py` | 補畫缺的圖、轉換手動放的圖 |
| `src/slideshow.js` | 播放：溶接、推近、字幕 |
| `src/lofi.js` | 做舊：每色 6 階加網點 |
| `src/deck.js` | 洗牌順序：每句播過一輪才重洗 |
| `src/scenes.js` | 讀 `data/scenes.tsv` |

設計文件在 `docs/superpowers/specs/2026-11-13-dream-slideshow-design.md`。
最早的 3D 版本保留在 git 標記 `v1-3d-road`。
