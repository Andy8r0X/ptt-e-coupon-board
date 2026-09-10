// fetch_stats.js
const https = require('https');
const fs = require('fs');
const path = require('path');

// ===== 可調參數 =====
const INITIAL_START_PAGE = 3892;   // 當 state.json 不存在時的起始頁碼
const MAX_PAGES_TO_FETCH = 50;     // 每次執行最多抓取頁數
const EMPTY_PAGE_THRESHOLD = 3;    // 連續 N 頁無新文章即停止
const DELAY_MS = 800;              // 請求間隔（毫秒）
const START_DATE = '8/29';         // 統計起始日期（包含），格式 M/D
// ===================

const BASE_URL = 'https://www.ptt.cc/bbs/e-coupon/';
const STATE_FILE = 'state.json';
const STATS_FILE = 'stats.json';
const EXPORT_DIR = 'export';

// 將日期 M/D 轉為數字 MMDD 以便比較
function dateToNum(dateStr) {
    const parts = dateStr.trim().split('/');
    if (parts.length !== 2) return 0;
    const month = parseInt(parts[0], 10);
    const day = parseInt(parts[1], 10);
    return month * 100 + day;
}

const START_DATE_NUM = dateToNum(START_DATE);

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
 * 解析單頁文章，回傳新文章列表
 */
function parsePage(html, knownIds, authorStats, pageLabel, startDateNum) {
    const newArticles = [];
    const parts = html.split('<div class="r-ent">');
    for (let i = 1; i < parts.length; i++) {
        const block = parts[i];

        const dateMatch = block.match(/<div class="date">(.*?)<\/div>/);
        if (!dateMatch) continue;
        const dateText = dateMatch[1].trim();
        if (!dateText) continue;

        const dateNum = dateToNum(dateText);
        if (dateNum < startDateNum) continue;

        let authorText = '';
        const authorMatch = block.match(/<div class="author">(.*?)<\/div>/);
        if (authorMatch) authorText = authorMatch[1].trim();

        const titleMatch = block.match(/<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
        if (!titleMatch) continue;
        const href = titleMatch[1];
        const titleHtml = titleMatch[2];

        const idMatch = href.match(/\/(M\.\d+\.A\.\w+)\.html$/);
        if (!idMatch) continue;
        const articleId = idMatch[1];

        if (knownIds.has(articleId)) continue;

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

        if (!authorStats[finalAuthor]) {
            authorStats[finalAuthor] = {
                count: 0,
                normalCount: 0,
                deletedCount: 0,
                articleIds: [],
                deletedIds: []
            };
        }

        authorStats[finalAuthor].count += 1;
        authorStats[finalAuthor].articleIds.push(articleId);
        if (isDeleted) {
            authorStats[finalAuthor].deletedCount += 1;
            authorStats[finalAuthor].deletedIds.push(articleId);
        } else {
            authorStats[finalAuthor].normalCount += 1;
        }

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
 * 讀取現有的 stats.json
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
                        articleIds: Array.isArray(info.articleIds) ? info.articleIds : [],
                        deletedIds: Array.isArray(info.deletedIds) ? info.deletedIds : []
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
 * 合併新的統計到現有統計（含去重）
 */
function mergeStats(existing, newStats) {
    for (const [author, info] of Object.entries(newStats)) {
        if (!existing[author]) {
            existing[author] = {
                count: 0,
                normalCount: 0,
                deletedCount: 0,
                articleIds: [],
                deletedIds: []
            };
        }

        // 合併 articleIds 並去重
        const idSet = new Set(existing[author].articleIds);
        for (const id of info.articleIds) {
            idSet.add(id);
        }
        existing[author].articleIds = Array.from(idSet);

        // 合併 deletedIds 並去重
        const delSet = new Set(existing[author].deletedIds || []);
        for (const id of (info.deletedIds || [])) {
            delSet.add(id);
        }
        existing[author].deletedIds = Array.from(delSet);

        // 根據去重後的數量重新計算
        existing[author].count = existing[author].articleIds.length;
        existing[author].deletedCount = existing[author].deletedIds.length;
        existing[author].normalCount = existing[author].count - existing[author].deletedCount;
    }
}

/**
 * 修復 stats.json：對每個作者的 articleIds 與 deletedIds 去重，並重新計算 count
 */
function repairStats() {
    if (!fs.existsSync(STATS_FILE)) return;
    try {
        const raw = fs.readFileSync(STATS_FILE, 'utf8');
        const data = JSON.parse(raw);
        let fixed = false;
        for (const [author, info] of Object.entries(data.stats)) {
            if (!Array.isArray(info.articleIds)) continue;

            const unique = [...new Set(info.articleIds)];
            const deletedSet = new Set(Array.isArray(info.deletedIds) ? info.deletedIds : []);
            const validDeleted = unique.filter(id => deletedSet.has(id));

            const needFix = unique.length !== info.articleIds.length ||
                             validDeleted.length !== (info.deletedIds || []).length ||
                             !Array.isArray(info.deletedIds);

            if (needFix) {
                info.articleIds = unique;
                info.deletedIds = validDeleted;
                info.count = unique.length;
                info.deletedCount = validDeleted.length;
                info.normalCount = info.count - info.deletedCount;
                fixed = true;
                console.log(`🔧 修復作者 ${author}：${info.count} 篇（刪除 ${info.deletedCount}）`);
            }
        }
        if (fixed) {
            data.totalArticles = Object.values(data.stats).reduce((sum, i) => sum + i.count, 0);
            fs.writeFileSync(STATS_FILE, JSON.stringify(data, null, 2));
            console.log('✅ stats.json 已修復完成');
        }
    } catch (e) {
        console.warn('修復 stats.json 失敗:', e.message);
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

    // ✅ 先修復歷史資料
    repairStats();

    console.log(`統計起始日期：${START_DATE} (包含)`);

    const state = loadState();
    const knownIds = state.knownIds;
    let lastScannedPage = state.lastScannedPage;

    const authorStats = loadExistingStats();
    console.log(`已載入 ${Object.keys(authorStats).length} 位作者的歷史統計`);

    let startPage;
    if (lastScannedPage !== null && lastScannedPage !== undefined) {
        startPage = lastScannedPage + 1;
        console.log(`從上次中斷點繼續，起始頁碼：${startPage}`);
    } else {
        startPage = INITIAL_START_PAGE;
        console.log(`首次執行，使用初始頁碼：${startPage}`);
    }

    const endPage = startPage + MAX_PAGES_TO_FETCH - 1;
    console.log(`本次將抓取頁碼範圍：${startPage} ~ ${endPage}（共 ${endPage - startPage + 1} 頁）`);

    let newArticleCount = 0;
    let emptyPageCount = 0;

    for (let page = startPage; page <= endPage; page++) {
        const url = BASE_URL + `index${page}.html`;
        console.log(`抓取第 ${page} 頁...`);
        try {
            const html = await fetchPage(url);
            const newIds = parsePage(html, knownIds, authorStats, `第${page}頁`, START_DATE_NUM);

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

            lastScannedPage = page;
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
