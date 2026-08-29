// fetch_stats.js
// 抓取 PTT e-coupon 板指定頁面，統計本週（週一至週日）作者篇數與文章ID，輸出 stats.json

const https = require('https');
const fs = require('fs');

// ===== 可調參數 =====
const FETCH_LATEST_PAGE = true;   // 抓取最新頁
const START_PAGE = 3999;          // 從此頁開始向後抓
const MAX_PAGES = 50;             // 最多向後抓幾頁
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

function parsePage(html, seenArticleIds, authorData) {
    let hasInRange = false;

    const rEntRegex = /<div class="r-ent">([\s\S]*?)<\/div>\s*<\/div>/g;
    let rEntMatch;
    while ((rEntMatch = rEntRegex.exec(html)) !== null) {
        const block = rEntMatch[1];

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

        if (!authorData[authorText]) {
            authorData[authorText] = { count: 0, articleIds: [] };
        }
        authorData[authorText].count += 1;
        authorData[authorText].articleIds.push(articleId);
    }

    return { hasInRange };
}

async function main() {
    const seenArticleIds = new Set();
    const authorData = {};
    let scannedPages = 0;

    if (FETCH_LATEST_PAGE) {
        console.log('抓取最新頁...');
        try {
            const html = await fetchPage(BASE_URL + 'index.html');
            parsePage(html, seenArticleIds, authorData);
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
            const { hasInRange } = parsePage(html, seenArticleIds, authorData);
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
        stats: authorData
    };

    fs.writeFileSync('stats.json', JSON.stringify(output, null, 2));
    console.log('stats.json 已更新。');
    console.log(`統計區間：${dateRange.start} ~ ${dateRange.end}`);
    console.log(`總作者數：${Object.keys(authorData).length}`);
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

main().catch(console.error);
