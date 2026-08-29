// fetch_stats.js
// 抓取 PTT e-coupon 板，統計本週（週一至週日）作者篇數，輸出 stats.json 與 export/日期.json

const https = require('https');
const fs = require('fs');
const path = require('path');

// ===== 可調參數 =====
const FETCH_LATEST_PAGE = true;
const START_PAGE = 3999;
const MAX_PAGES = 200;
const DELAY_MS = 800;
// ===================

const BASE_URL = 'https://www.ptt.cc/bbs/e-coupon/';

function getDateStr(date) {
    return `${date.getMonth() + 1}/${date.getDate()}`;
}

function getWeekRange() {
    const today = new Date();
    const day = today.getDay();
    const diffToMonday = (day + 6) % 7;
    const monday = new Date(today);
    monday.setDate(today.getDate() - diffToMonday);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return { start: getDateStr(monday), end: getDateStr(sunday) };
}

const dateRange = getWeekRange();

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

function parsePage(html, seenArticleIds, authorCountMap, pageLabel) {
    let hasInRange = false;
    let articlesFound = 0;

    const parts = html.split('<div class="r-ent">');
    for (let i = 1; i < parts.length; i++) {
        const block = parts[i];
        articlesFound++;

        const dateMatch = block.match(/<div class="date">(.*?)<\/div>/);
        if (!dateMatch) continue;
        const dateText = dateMatch[1].trim();

        if (dateText < dateRange.start || dateText > dateRange.end) continue;
        hasInRange = true;

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
        if (seenArticleIds.has(articleId)) continue;
        seenArticleIds.add(articleId);

        if (!authorText || authorText === '-') {
            const originalAuthorMatch = titleHtml.match(/&lt;([^&]+)&gt;/);
            if (originalAuthorMatch) authorText = originalAuthorMatch[1].trim();
        }

        if (!authorText || authorText === '-') continue;

        // 只統計篇數，不記錄文章 ID
        authorCountMap[authorText] = (authorCountMap[authorText] || 0) + 1;
    }

    console.log(`[${pageLabel}] 解析到 ${articlesFound} 篇文章，本週範圍內：${hasInRange ? '是' : '否'}`);
    return { hasInRange };
}

async function main() {
    const seenArticleIds = new Set();
    const authorCountMap = {};
    let scannedPages = 0;

    if (FETCH_LATEST_PAGE) {
        console.log('抓取最新頁 index.html...');
        try {
            const html = await fetchPage(BASE_URL + 'index.html');
            parsePage(html, seenArticleIds, authorCountMap, '最新頁');
            scannedPages++;
        } catch (err) {
            console.error('最新頁抓取失敗:', err);
        }
        await sleep(DELAY_MS);
    }

    for (let page = START_PAGE; page < START_PAGE + MAX_PAGES; page++) {
        const url = BASE_URL + `index${page}.html`;
        console.log(`抓取第 ${page} 頁（${url}）...`);
        try {
            const html = await fetchPage(url);
            const { hasInRange } = parsePage(html, seenArticleIds, authorCountMap, `第${page}頁`);
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
        stats: authorCountMap  // 直接是 { author: count }
    };

    // 寫入 stats.json（網頁讀取）
    fs.writeFileSync('stats.json', JSON.stringify(output, null, 2));

    // 寫入 export/YYYY-MM-DD.json（存檔）
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const exportDir = 'export';
    if (!fs.existsSync(exportDir)) {
        fs.mkdirSync(exportDir);
    }
    const exportPath = path.join(exportDir, `${yyyy}-${mm}-${dd}.json`);
    fs.writeFileSync(exportPath, JSON.stringify(output, null, 2));

    console.log('stats.json 已更新。');
    console.log(`已存檔至 ${exportPath}`);
    console.log(`統計區間：${dateRange.start} ~ ${dateRange.end}`);
    console.log(`總作者數：${Object.keys(authorCountMap).length}`);
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

main().catch(console.error);
