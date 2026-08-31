// fetch_stats.js
const https = require('https');
const fs = require('fs');
const path = require('path');

// ===== 可調參數 =====
const FETCH_LATEST_PAGE = true;   // 抓取最新頁 index.html
const START_PAGE = 3932;          // 主要統計起始頁
const MAX_PAGES = 500;            // 最多向後翻頁數
const EMPTY_PAGE_THRESHOLD = 10;  // 連續 N 頁無符合文章則停止
const EXTRA_PAGES = [3954];       // 額外指定頁碼（可自行增減）
const DELAY_MS = 800;             // 請求延遲毫秒

// 主要統計日期範圍（從 2026/8/29 到今天）
const MAIN_START_DATE = '8/29';
const MAIN_END_DATE = getTodayStr();

// 上週統計（自動計算上週一至週日）
const lastWeek = getLastWeekRange();

// 上週統計起始頁（請依實際情況調整，頁碼越大越舊）
const LAST_WEEK_START_PAGE = 4000;
const LAST_WEEK_MAX_PAGES = 300;
const LAST_WEEK_EMPTY_THRESHOLD = 10;
// ===================

const BASE_URL = 'https://www.ptt.cc/bbs/e-coupon/';

function getTodayStr() {
    const now = new Date();
    return `${now.getMonth() + 1}/${now.getDate()}`;
}

function getLastWeekRange() {
    const today = new Date();
    const day = today.getDay();
    const diffToMonday = (day + 6) % 7;
    const thisMonday = new Date(today);
    thisMonday.setDate(today.getDate() - diffToMonday);
    const lastSunday = new Date(thisMonday);
    lastSunday.setDate(thisMonday.getDate() - 1);
    const lastMonday = new Date(lastSunday);
    lastMonday.setDate(lastSunday.getDate() - 6);
    return {
        start: `${lastMonday.getMonth() + 1}/${lastMonday.getDate()}`,
        end: `${lastSunday.getMonth() + 1}/${lastSunday.getDate()}`
    };
}

function fetchPage(url) {
    return new Promise((resolve, reject) => {
        const options = {
            headers: {
                'Cookie': 'over18=1',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
            }
        };
        https.get(url, options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        }).on('error', reject);
    });
}

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

function parsePage(html, seenArticleIds, authorData, dateRange, pageLabel) {
    let hasInRange = false;
    let articlesFound = 0;

    const parts = html.split('<div class="r-ent">');
    for (let i = 1; i < parts.length; i++) {
        const block = parts[i];
        articlesFound++;

        const dateMatch = block.match(/<div class="date">(.*?)<\/div>/);
        if (!dateMatch) continue;
        const dateText = dateMatch[1].trim();

        let authorText = '';
        const authorMatch = block.match(/<div class="author">(.*?)<\/div>/);
        if (authorMatch) authorText = authorMatch[1].trim();

        const titleMatch = block.match(/<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
        if (!titleMatch) continue;
        const href = titleMatch[1];
        const titleHtml = titleMatch[2];

        // 檢查日期是否在指定範圍內
        if (dateText < dateRange.start || dateText > dateRange.end) continue;
        hasInRange = true;

        const idMatch = href.match(/\/(M\.\d+\.A\.\w+)\.html$/);
        if (!idMatch) continue;
        const articleId = idMatch[1];
        if (seenArticleIds.has(articleId)) continue;
        seenArticleIds.add(articleId);

        let isDeleted = false;
        let finalAuthor = authorText;

        if (!finalAuthor || finalAuthor === '-') {
            const extracted = extractOriginalAuthor(titleHtml);
            if (extracted) {
                finalAuthor = extracted;
                isDeleted = true;
                console.log(`[${pageLabel}] 從標題提取作者：${finalAuthor}（文章 ${articleId}）`);
            } else {
                console.warn(`[${pageLabel}] 無法從標題提取作者，文章 ID: ${articleId}，標題: ${titleHtml}`);
                continue;
            }
        }

        if (!authorData[finalAuthor]) {
            authorData[finalAuthor] = {
                count: 0,
                normalCount: 0,
                deletedCount: 0,
                articleIds: []
            };
        }

        authorData[finalAuthor].count += 1;
        authorData[finalAuthor].articleIds.push(articleId);
        if (isDeleted) {
            authorData[finalAuthor].deletedCount += 1;
        } else {
            authorData[finalAuthor].normalCount += 1;
        }
    }

    console.log(`[${pageLabel}] 解析到 ${articlesFound} 篇文章，其中範圍內：${hasInRange ? '是' : '否'}`);
    return { hasInRange };
}

async function fetchRange(startPage, maxPages, emptyThreshold, dateRange, label) {
    const seenArticleIds = new Set();
    const authorData = {};
    let scannedPages = 0;
    let emptyCount = 0;

    for (let page = startPage; page < startPage + maxPages; page++) {
        const url = page === 1 ? BASE_URL + 'index.html' : BASE_URL + `index${page}.html`;
        console.log(`[${label}] 抓取第 ${page} 頁（${url}）...`);
        try {
            const html = await fetchPage(url);
            const { hasInRange } = parsePage(html, seenArticleIds, authorData, dateRange, `${label}第${page}頁`);
            scannedPages++;
            if (hasInRange) {
                emptyCount = 0;
            } else {
                emptyCount++;
                if (emptyCount >= emptyThreshold) {
                    console.log(`[${label}] 連續 ${emptyThreshold} 頁無符合文章，停止翻頁。`);
                    break;
                }
            }
            await sleep(DELAY_MS);
        } catch (err) {
            console.error(`[${label}] 第 ${page} 頁抓取失敗:`, err);
            break;
        }
    }
    return { authorData, scannedPages };
}

async function main() {
    // 主要統計
    console.log('=== 主要統計 ===');
    const mainDateRange = { start: MAIN_START_DATE, end: MAIN_END_DATE };
    const mainResult = await fetchRange(START_PAGE, MAX_PAGES, EMPTY_PAGE_THRESHOLD, mainDateRange, '主要');
    if (FETCH_LATEST_PAGE) {
        console.log('抓取最新頁 index.html...');
        try {
            const html = await fetchPage(BASE_URL + 'index.html');
            const seen = new Set(Object.keys(mainResult.authorData).flatMap(a => mainResult.authorData[a].articleIds));
            parsePage(html, seen, mainResult.authorData, mainDateRange, '最新頁');
            mainResult.scannedPages++;
        } catch (err) {
            console.error('最新頁抓取失敗:', err);
        }
        await sleep(DELAY_MS);
    }
    // 抓取額外頁
    for (const page of EXTRA_PAGES) {
        if (page >= START_PAGE && page < START_PAGE + MAX_PAGES) continue;
        console.log(`抓取額外頁 ${page}...`);
        try {
            const html = await fetchPage(BASE_URL + `index${page}.html`);
            const seen = new Set(Object.keys(mainResult.authorData).flatMap(a => mainResult.authorData[a].articleIds));
            parsePage(html, seen, mainResult.authorData, mainDateRange, `額外第${page}頁`);
            mainResult.scannedPages++;
            await sleep(DELAY_MS);
        } catch (err) {
            console.error(`額外頁 ${page} 抓取失敗:`, err);
        }
    }

    // 上週統計
    console.log('=== 上週統計 ===');
    const lastWeekDateRange = { start: lastWeek.start, end: lastWeek.end };
    const lastWeekResult = await fetchRange(LAST_WEEK_START_PAGE, LAST_WEEK_MAX_PAGES, LAST_WEEK_EMPTY_THRESHOLD, lastWeekDateRange, '上週');

    // 輸出主要統計
    const now = new Date();
    const timestamp = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}-${String(now.getHours()).padStart(2,'0')}-${String(now.getMinutes()).padStart(2,'0')}-${String(now.getSeconds()).padStart(2,'0')}`;
    const mainOutput = {
        generatedAt: now.toISOString(),
        mode: 'range',
        dateRange: mainDateRange,
        scannedPages: mainResult.scannedPages,
        stats: mainResult.authorData
    };
    fs.writeFileSync('stats.json', JSON.stringify(mainOutput, null, 2));

    // 輸出上週統計
    const lastWeekOutput = {
        generatedAt: now.toISOString(),
        mode: 'week',
        dateRange: lastWeekDateRange,
        scannedPages: lastWeekResult.scannedPages,
        stats: lastWeekResult.authorData
    };
    fs.writeFileSync('last_week.json', JSON.stringify(lastWeekOutput, null, 2));

    // 儲存歷史
    const exportDir = path.join(__dirname, 'export');
    fs.mkdirSync(exportDir, { recursive: true });
    fs.writeFileSync(path.join(exportDir, `${timestamp}.json`), JSON.stringify(mainOutput, null, 2));

    console.log('stats.json 與 last_week.json 已更新。');
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

main().catch(console.error);
