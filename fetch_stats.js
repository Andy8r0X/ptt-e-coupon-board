// fetch_stats.js
const https = require('https');
const fs = require('fs');
const path = require('path');

// ===== 可調參數 =====
const INITIAL_START_PAGE = 3932;   // 當 state.json 不存在時的起始頁碼
const MAX_PAGES_TO_FETCH = 50;     // 每次執行最多抓取頁數
const EMPTY_PAGE_THRESHOLD = 3;    // 連續 N 頁無新文章即停止
const DELAY_MS = 800;              // 請求間隔（毫秒）
const START_DATE = '8/29';         // 統計起始日期（與前端相容）
// ===================

const BASE_URL = 'https://www.ptt.cc/bbs/e-coupon/';
const STATE_FILE = 'state.json';
const STATS_FILE = 'stats.json';
const EXPORT_DIR = 'export';

/**
 * 取得今日日期字串 (MM/DD)
 */
function getTodayStr() {
    const now = new Date();
    return `${now.getMonth() + 1}/${now.getDate()}`;
}

/**
 * 抓取單一頁面 HTML，若 404 則拋出錯誤
 */
function fetchPage(url) {
    return new Promise((resolve, reject) => {
        const options = {
            headers: {
                'Cookie': 'over18=1',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
            }
        };
        https.get(url, options, (res) => {
            if (res.statusCode === 404) {
                reject(new Error(`404 Not Found: ${url}`));
                return;
            }
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        }).on('error', reject);
    });
}

/**
 * 從標題中提取原始作者（用於已刪除文章）
 */
function extractOriginalAuthor(titleHtml) {
    let match = titleHtml.match(/&lt;([^&]+)&gt;/);
    if (match) return match[1].trim();
    match = titleHtml.match(/<([^>]+)>/);
    if (match) {
        const id = match[1].trim();
        if (id && id !== '/') return id;
    }
    return null;
}

/**
 * 解析單頁文章，回傳新文章列表（僅包含未見過的）
 */
function parsePage(html, knownIds, authorStats, pageLabel) {
    const newArticles = [];
    const parts = html.split('<div class="r-ent">');
    for (let i = 1; i < parts.length; i++) {
        const block = parts[i];

        // 取得作者
        let authorText = '';
        const authorMatch = block.match(/<div class="author">(.*?)<\/div>/);
        if (authorMatch) authorText = authorMatch[1].trim();

        // 取得標題與連結
        const titleMatch = block.match(/<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
        if (!titleMatch) continue;
        const href = titleMatch[1];
        const titleHtml = titleMatch[2];

        // 提取文章 ID
        const idMatch = href.match(/\/(M\.\d+\.A\.\w+)\.html$/);
        if (!idMatch) continue;
        const articleId = idMatch[1];

        // 若已看過則跳過
        if (knownIds.has(articleId)) continue;

        // 判斷是否為已刪除文章（作者為 '-'）
        let isDeleted = false;
        let finalAuthor = authorText;

        if (!finalAuthor || finalAuthor === '-') {
            isDeleted = true;
            const extracted = extractOriginalAuthor(titleHtml);
            if (extracted) {
                finalAuthor = extracted;
                console.log(`[${pageLabel}] 從標題提取作者：${finalAuthor}（文章 ${articleId}）`);
            } else {
                finalAuthor = '[未知]';
                console.warn(`[${pageLabel}] 無法提取作者，文章 ID: ${articleId}，標題: ${titleHtml}`);
            }
        }

        // 初始化作者統計
        if (!authorStats[finalAuthor]) {
            authorStats[finalAuthor] = {
                count: 0,
                normalCount: 0,
                deletedCount: 0,
                articleIds: []
            };
        }

        // 更新統計
        authorStats[finalAuthor].count += 1;
        authorStats[finalAuthor].articleIds.push(articleId);
        if (isDeleted) {
            authorStats[finalAuthor].deletedCount += 1;
        } else {
            authorStats[finalAuthor].normalCount += 1;
        }

        // 記錄新文章
        newArticles.push(articleId);
        knownIds.add(articleId);
    }

    console.log(`[${pageLabel}] 解析完成，新文章數：${newArticles.length}`);
    return newArticles;
}

/**
 * 讀取或初始化狀態
 */
function loadState() {
    if (fs.existsSync(STATE_FILE)) {
        try {
            const raw = fs.readFileSync(STATE_FILE, 'utf8');
            const state = JSON.parse(raw);
            state.knownIds = new Set(state.knownIds || []);
            return state;
        } catch (e) {
            console.warn('讀取狀態檔失敗，將重新初始化', e);
        }
    }
    return {
        lastScannedPage: null,
        knownIds: new Set()
    };
}

/**
 * 保存狀態
 */
function saveState(state) {
    const toSave = {
        lastScannedPage: state.lastScannedPage,
        knownIds: Array.from(state.knownIds)
    };
    fs.writeFileSync(STATE_FILE, JSON.stringify(toSave, null, 2));
}

/**
 * 讀取現有的 stats.json（如果存在），合併到記憶體中的 authorStats
 */
function loadExistingStats() {
    if (fs.existsSync(STATS_FILE)) {
        try {
            const raw = fs.readFileSync(STATS_FILE, 'utf8');
            const data = JSON.parse(raw);
            if (data.stats) {
                const stats = {};
                for (const [author, info] of Object.entries(data.stats)) {
                    stats[author] = {
                        count: info.count || 0,
                        normalCount: info.normalCount || 0,
                        deletedCount: info.deletedCount || 0,
                        articleIds: info.articleIds || []
                    };
                }
                return stats;
            }
        } catch (e) {
            console.warn('讀取 stats.json 失敗，將從頭統計', e);
        }
    }
    return {};
}

/**
 * 合併新的統計到現有統計（已修復重複 ID 問題）
 */
function mergeStats(existing, newStats) {
    for (const [author, info] of Object.entries(newStats)) {
        if (!existing[author]) {
            existing[author] = {
                count: 0,
                normalCount: 0,
                deletedCount: 0,
                articleIds: []
            };
        }
        existing[author].count += info.count;
        existing[author].normalCount += info.normalCount;
        existing[author].deletedCount += info.deletedCount;

        // 使用 Set 合併文章 ID 以確保不重複
        const idSet = new Set(existing[author].articleIds);
        for (const id of info.articleIds) {
            idSet.add(id);
        }
        existing[author].articleIds = Array.from(idSet);
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 主程式
 */
async function main() {
    console.log('=== PTT e-coupon 統計爬蟲 (增量版) ===');

    // 1. 載入狀態
    const state = loadState();
    const knownIds = state.knownIds;
    let lastScannedPage = state.lastScannedPage;

    // 2. 載入現有統計
    const authorStats = loadExistingStats();
    console.log(`已載入 ${Object.keys(authorStats).length} 位作者的歷史統計`);

    // 3. 決定起始頁碼
    let startPage;
    if (lastScannedPage !== null && lastScannedPage !== undefined) {
        startPage = lastScannedPage + 1;
        console.log(`從上次中斷點繼續，起始頁碼：${startPage}`);
    } else {
        startPage = INITIAL_START_PAGE;
        console.log(`首次執行，使用初始頁碼：${startPage}`);
    }

    // 4. 設定最大抓取範圍（不依賴最新頁）
    const endPage = startPage + MAX_PAGES_TO_FETCH - 1;
    console.log(`本次將抓取頁碼範圍：${startPage} ~ ${endPage}（共 ${endPage - startPage + 1} 頁）`);

    let newArticleCount = 0;
    let emptyPageCount = 0;   // 連續無新文章的頁數

    for (let page = startPage; page <= endPage; page++) {
        const url = BASE_URL + `index${page}.html`;
        console.log(`抓取第 ${page} 頁...`);
        try {
            const html = await fetchPage(url);
            const newIds = parsePage(html, knownIds, authorStats, `第${page}頁`);

            if (newIds.length > 0) {
                newArticleCount += newIds.length;
                emptyPageCount = 0;
            } else {
                emptyPageCount++;
                if (emptyPageCount >= EMPTY_PAGE_THRESHOLD) {
                    console.log(`連續 ${EMPTY_PAGE_THRESHOLD} 頁無新文章，停止抓取。`);
                    lastScannedPage = page;
                    break;
                }
            }

            // 更新最後掃描頁碼
            lastScannedPage = page;

            // 每處理完一頁保存狀態
            saveState({ lastScannedPage, knownIds });
            console.log(`狀態已保存，目前共 ${knownIds.size} 篇已知文章`);

            await sleep(DELAY_MS);
        } catch (err) {
            if (err.message.includes('404')) {
                console.log(`第 ${page} 頁不存在 (404)，可能已達最新頁，停止抓取。`);
                lastScannedPage = page - 1;
                saveState({ lastScannedPage, knownIds });
                break;
            } else {
                console.error(`第 ${page} 頁抓取失敗:`, err.message);
                break;
            }
        }
    }

    // 5. 生成最終統計輸出（包含 dateRange 以相容前端）
    const now = new Date();
    const timestamp = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}-${String(now.getHours()).padStart(2,'0')}-${String(now.getMinutes()).padStart(2,'0')}-${String(now.getSeconds()).padStart(2,'0')}`;

    const totalAuthors = Object.keys(authorStats).length;
    console.log(`本次新增 ${newArticleCount} 篇文章，總作者數：${totalAuthors}`);

    const output = {
        generatedAt: now.toISOString(),
        mode: 'incremental',
        dateRange: { start: START_DATE, end: getTodayStr() },
        scannedPages: lastScannedPage ? (lastScannedPage - startPage + 1) : 0,
        totalArticles: knownIds.size,
        stats: authorStats
    };
    fs.writeFileSync(STATS_FILE, JSON.stringify(output, null, 2));

    if (!fs.existsSync(EXPORT_DIR)) {
        fs.mkdirSync(EXPORT_DIR, { recursive: true });
    }
    fs.writeFileSync(path.join(EXPORT_DIR, `${timestamp}.json`), JSON.stringify(output, null, 2));

    console.log(`✅ 更新完成，stats.json 與 export 歷史已產生。`);
    console.log(`最新掃描頁碼：${lastScannedPage}`);
}

main().catch(console.error);
