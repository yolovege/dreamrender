# dreamrender

打開就一直播的網頁：鏡頭在粗糙的低畫質 3D 世界裡永遠往前飄，霧裡不斷長出毫無意義的東西，
底下配一句合文法但毫無意義的字幕。沒有結尾，也幾乎不會重複。

純靜態網頁，所有運算都在瀏覽器裡，不需要後端，執行時不呼叫任何 API。

## 在本機看

```bash
npm start          # 等同 python3 -m http.server 8000
```

然後打開 <http://localhost:8000>。按 `F` 顯示或隱藏幀率。

需要連得到網路：three.js（固定 0.187.0）是從 jsdelivr 載入的。

## 測試

```bash
npm install                      # 只裝冒煙測試用的 Playwright
npx playwright install chromium  # 第一次才需要
npm test                         # 純函式：亂數、字幕、路的生成
npm run smoke                    # 用無頭瀏覽器實際打開頁面跑約 50 秒，截圖存到 smoke-out/
```

冒煙測試量到的幀率是用處理器模擬顯示卡的結果，只能當下限。

## 程式怎麼分

| 檔案 | 做什麼 |
|---|---|
| `src/rng.js` | 可重現的亂數 |
| `src/words.js` | 詞庫：表情符號、名詞、動詞、地點、句型 |
| `src/captions-written.js` | 500 句預寫字幕，一行一句 |
| `src/captions.js` | 隨機組句，並和預寫字幕混著發 |
| `src/road.js` | 決定每一段路上有什麼（純資料，不碰 three.js） |
| `src/world.js` | 把路的資料變成 three.js 物件，隨鏡頭生成與回收 |
| `src/lofi.js` | 低畫質：低解析度、頂點抖動、色階與網點 |
| `src/main.js` | 啟動、主迴圈、鏡頭搖晃、字幕 |

想加字幕：往 `src/captions-written.js` 加行，並把 `tests/captions.test.js` 裡的句數改掉。
想加物件：往 `src/words.js` 的 `EMOJI` 加表情符號（只能用單一碼位的）。

設計文件在 `docs/superpowers/specs/2026-11-13-endless-road-design.md`。
