// fetch_stats.js
const https = require('https');
const fs = require('fs');

// ===== 可調參數 =====
const FETCH_LATEST_PAGE = true;   // 抓取最新頁
const START_PAGE = 3999;          // 從此頁開始向後抓
const MAX_PAGES = 50;             // 最多向後抓幾頁
const STAT_MODE = 'today';        // 'today' 或 'week'
const DELAY_MS = 800;             // 請求延遲
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

let dateRange;
if (STAT_MODE === 'today') {
    const todayStr = getDateStr(new Date());
    dateRange = { start: todayStr, end: todayStr };
} else {
    dateRange = getWeekRange();
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

function parsePage(html, seenArticleIds) {
    const authorCount = {};
    let hasInRange = false;
    const regex = /<div class="r-ent">[\s\S]*?<div class="date">(.*?)<\/div>[\s\S]*?<div class="author">(.*?)<\/div>[\s\S]*?<div class="title">[\s\S]*?<a href="([^"]+)"/g;
    let match;
    while ((match = regex.exec(html)) !== null) {
        const dateText = match[1].trim();
        const authorText = match[2].trim();
        const href = match[3];
        
        if (dateText >= dateRange.start && dateText <= dateRange.end) {
            hasInRange = true;
            const idMatch = href.match(/\/(M\.\d+\.A\.\w+)\.html$/);
            if (!idMatch) continue;
            const articleId = idMatch[1];
            if (seenArticleIds.has(articleId)) continue;
            seenArticleIds.add(articleId);
            
            if (authorText && authorText !== '-') {
                authorCount[authorText] = (authorCount[authorText] || 0) + 1;
            }
        }
    }
    return { authorCount, hasInRange };
}

async function main() {
    const seenArticleIds = new Set();
    const totalStats = {};
    let scannedPages = 0;

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
        mode: STAT_MODE,
        dateRange: dateRange,
        scannedPages: scannedPages,
        stats: totalStats
    };

    fs.writeFileSync('stats.json', JSON.stringify(output, null, 2));
    console.log('stats.json 已更新。');
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
