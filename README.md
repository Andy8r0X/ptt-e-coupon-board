# PTT e-coupon 板作者發文統計

這個專案自動抓取 PTT 的 e-coupon 板文章列表，統計 **2026/08/29 以後** 每位作者的發文篇數，包含正常文章與被刪除的文章（從標題提取原作者 ID），並以網頁呈現，方便查看、重點標示與匯出。

## 功能特點

- ✅ 自動抓取指定頁碼範圍（預設從 index3932 開始，往後翻頁直到連續 5 頁無符合文章）
- ✅ 統計起始日期可自訂（目前設定為 8/29）
- ✅ 區分正常發文與被刪除文章，顯示刪除篇數
- ✅ 文章 ID 去重，避免重複計算
- ✅ 每天自動更新（GitHub Actions），也可手動觸發
- ✅ 前端網頁顯示統計表格、超過 1 篇的重點框
- ✅ 可匯出 CSV 或 XLS 檔案

## 如何運作

1. **GitHub Actions** 每天定時執行 `fetch_stats.js` 腳本
2. 腳本抓取 PTT e-coupon 板的指定頁面，解析文章列表
3. 統計結果輸出為 `stats.json`（同時保留歷史檔於 `export/` 資料夾）
4. **GitHub Pages** 載入 `index.html`，讀取 `stats.json` 顯示統計結果

## 檔案結構

## 檔案結構
.

├── .github/workflows/update_stats.yml # GitHub Actions 自動化設定

├── fetch_stats.js # 抓取與統計腳本

├── index.html # 前端顯示頁面

├── stats.json # 最新統計結果（供前端讀取）

└── export/ # 歷史統計檔案（時間戳 JSON）


## 使用方式

### 查看統計結果
直接開啟 GitHub Pages 網址：
`https://Andy8r0X.github.io/ptt-e-coupon-board/`

### 手動更新
1. 前往 repository 的 **Actions** 分頁
2. 點選 **Update PTT Stats** workflow
3. 點擊 **Run workflow** 按鈕
4. 等待執行完成，重新整理網頁即可

## 自訂設定

所有可調參數位於 `fetch_stats.js` 頂部：

| 參數 | 說明 | 預設值 |
|------|------|--------|
| `START_PAGE` | 起始抓取的頁碼（indexXXXX.html） | `3932` |
| `MAX_PAGES` | 最多向後翻頁數（安全上限） | `100` |
| `EMPTY_PAGE_THRESHOLD` | 連續 N 頁無符合文章才停止 | `5` |
| `MAIN_START_DATE` | 統計起始日期（包含當天） | `'8/29'` |
| `DELAY_MS` | 每次請求延遲（毫秒） | `800` |

修改後提交變更，下次 workflow 執行即會生效。

## 常見問題

**Q：為什麼統計結果沒有顯示某些作者？**  
可能原因：文章不在設定的抓取頁碼範圍內、日期早於統計起始日、或文章已被刪除且標題中無法辨識原作者。請檢查 Actions 日誌中的警告訊息，或手動確認文章所在頁碼並調整 `START_PAGE`。

**Q：如何修改更新頻率？**  
編輯 `.github/workflows/update_stats.yml` 中的 `cron` 表達式。例如每小時更新改為 `'0 * * * *'`。注意 PTT 對頻繁請求較敏感，建議不要低於 1 小時。

**Q：GitHub Pages 顯示「載入失敗」？**  
請先確認 `stats.json` 已由 workflow 成功產生（repository 根目錄有此檔案）。若無，請手動執行一次 workflow。

**Q：如何更改統計起始日期？**  
編輯 `fetch_stats.js` 中的 `MAIN_START_DATE` 變數，格式為 `'M/D'`（例如 `'8/29'`）。

## 授權

本專案僅供個人學習與分析使用，請勿用於商業用途或頻繁抓取造成 PTT 伺服器負擔。
