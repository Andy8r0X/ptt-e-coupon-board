// fetch_stats.js
// 抓取 PTT e-coupon 板指定頁面，統計本週（週一至週日）作者篇數，輸出 stats.json

const https = require('https');
const fs = require('fs');

// ===== 可調參數 =====
const FETCH_LATEST_PAGE = true;   // 抓取最新頁
const START_PAGE = 3999;          // 從此頁開始向後抓
const MAX_PAGES = 50;             // 最多向後抓幾頁
const DELAY_MS = 800;             // 請求延遲
// ===================

const BASE_URL = 'https://www.ptt.cc/bbs/e-coupon/';

// 取得日期字串（M/D 不補零）
function getDateStr(date) {
    return `${date.getMonth() + 1}/${date.getDate()}`;
}

// 計算本週範圍（週一至週日）
function getWeekRange() {
    const today = new Date();
    const day = today.getDay(); // 0=週日, 1=週一, ..., 6=週六
    const diffToMonday = (day + 6) % 7;
    const monday = new Date(today);
    monday.setDate(today.getDate() - diffToMonday);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return { start: getDateStr(monday), end: getDateStr(sunday) };
}

const dateRange = getWeekRange(); // 本週範圍

// 發送 HTTPS GET 請求
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

// 從 HTML 中解析文章列表
function parsePage(html, seenArticleIds) {
    const authorCount = {};
    let hasInRange = false;

    // 正規表達式匹配每一篇 r-ent
    const rEntRegex = /<div class="r-ent">([\s\S]*?)<\/div>\s*<\/div>/g;
    let rEntMatch;
    while ((rEntMatch = rEntRegex.exec(html)) !== null) {
        const block = rEntMatch[1];

        // 提取日期
        const dateMatch = block.match(/<div class="date">(.*?)<\/div>/);
        if (!dateMatch) continue;
        const dateText = dateMatch[1].trim();

        // 判斷是否在本週範圍內
        if (dateText < dateRange.start || dateText > dateRange.end) {
            continue;
        }
        hasInRange = true;

        // 提取作者（可能為 '-'）
        let authorText = '';
        const authorMatch = block.match(/<div class="author">(.*?)<\/div>/);
        if (authorMatch) {
            authorText = authorMatch[1].trim();
        }

        // 提取標題連結與標題文字
        const titleMatch = block.match(/<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
        if (!titleMatch) continue;
        const href = titleMatch[1];
        const titleHtml = titleMatch[2];

        // 取得文章唯一識別碼
        const idMatch = href.match(/\/(M\.\d+\.A\.\w+)\.html$/);
        if (!idMatch) continue;
        const articleId = idMatch[1];
        if (seenArticleIds.has(articleId)) continue;
        seenArticleIds.add(articleId);

        // 如果作者欄位為 '-' 或空，嘗試從標題中提取 <原作者ID>
        if (!authorText || authorText === '-') {
            const originalAuthorMatch = titleHtml.match(/&lt;([^&]+)&gt;/);
            if (originalAuthorMatch) {
                authorText = originalAuthorMatch[1].trim();
            }
        }

        // 若仍然沒有作者資訊，跳過
        if (!authorText || authorText === '-') continue;

        // 統計作者
        authorCount[authorText] = (authorCount[authorText] || 0) + 1;
    }

    return { authorCount, hasInRange };
}

// 主流程
async function main() {
    const seenArticleIds = new Set();
    const totalStats = {};
    let scannedPages = 0;

    // 抓取最新頁
    if (FETCH_LATEST_PAGE) {
        console.log('抓取最新頁...');
        try {
            const html = await fetchPage(BASE_URL + 'index.html');
            const { authorCount } = parsePage(html, seenArticleIds);
            mergeStats(totalStats, authorCount);
            scannedPages++;
        } catch (err) {
            console.error('最新頁抓取失敗:', err);
        }
        await sleep(DELAY_MS);
    }

    // 向後翻頁
    for (let page = START_PAGE; page < START_PAGE + MAX_PAGES; page++) {
        const url = BASE_URL + `index${page}.html`;
        console.log(`抓取第 ${page} 頁...`);
        try {
            const html = await fetchPage(url);
            const { authorCount, hasInRange } = parsePage(html, seenArticleIds);
            mergeStats(totalStats, authorCount);
            scannedPages++;
            if (!hasInRange) {
                console.log('已超出日期範圍，停止翻頁。');
                break;
            }
            await sleep(DELAY_MS);
        } catch (err) {
            console.error(`第 ${page} 頁抓取失敗:`, err);
            break;
        }
    }

    const output = {
        generatedAt: new Date().toISOString(),
        mode: 'week',
        dateRange: dateRange,
        scannedPages: scannedPages,
        stats: totalStats
    };

    fs.writeFileSync('stats.json', JSON.stringify(output, null, 2));
    console.log('stats.json 已更新。');
    console.log(`統計區間：${dateRange.start} ~ ${dateRange.end}`);
}

function mergeStats(target, source) {
    for (const [author, count] of Object.entries(source)) {
        target[author] = (target[author] || 0) + count;
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

main().catch(console.error);
