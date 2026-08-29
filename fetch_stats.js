// fetch_stats.js
// 抓取 PTT e-coupon 板，統計本週（週一至週日）作者篇數與文章ID，輸出 stats.json

const https = require('https');
const fs = require('fs');

// ===== 可調參數 =====
const FETCH_LATEST_PAGE = true;   // 是否抓取最新頁 index.html
const START_PAGE = 3999;          // 從此頁開始向後抓（頁碼增加）
const MAX_PAGES = 200;            // 從 START_PAGE 起最多抓幾頁（安全上限）
const DELAY_MS = 800;             // 請求延遲毫秒
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

function parsePage(html, seenArticleIds, authorData, pageLabel) {
    let hasInRange = false;
    let articlesFound = 0;  // 此頁解析到的文章總數

    // 以 <div class="r-ent"> 分割，每個片段代表一篇文章（第一個片段為頁面開頭，跳過）
    const parts = html.split('<div class="r-ent">');
    for (let i = 1; i < parts.length; i++) {
        const block = parts[i];
        articlesFound++;

        // 提取日期
        const dateMatch = block.match(/<div class="date">(.*?)<\/div>/);
        if (!dateMatch) continue;
        const dateText = dateMatch[1].trim();

        // 提取作者
        let authorText = '';
        const authorMatch = block.match(/<div class="author">(.*?)<\/div>/);
        if (authorMatch) authorText = authorMatch[1].trim();

        // 提取標題連結與標題文字
        const titleMatch = block.match(/<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
        if (!titleMatch) continue;
        const href = titleMatch[1];
        const titleHtml = titleMatch[2];

        // 判斷日期是否在本週範圍內
        if (dateText < dateRange.start || dateText > dateRange.end) {
            continue; // 不在範圍內，但仍可能此頁有更早的文章，不影響 hasInRange 判斷
        }
        hasInRange = true;

        // 取得文章唯一識別碼
        const idMatch = href.match(/\/(M\.\d+\.A\.\w+)\.html$/);
        if (!idMatch) continue;
        const articleId = idMatch[1];
        if (seenArticleIds.has(articleId)) continue;
        seenArticleIds.add(articleId);

        // 若作者欄位為 '-' 或空，嘗試從標題中提取 <原作者ID>
        if (!authorText || authorText === '-') {
            const originalAuthorMatch = titleHtml.match(/&lt;([^&]+)&gt;/);
            if (originalAuthorMatch) authorText = originalAuthorMatch[1].trim();
        }

        if (!authorText || authorText === '-') continue;

        // 記錄統計
        if (!authorData[authorText]) {
            authorData[authorText] = { count: 0, articleIds: [] };
        }
        authorData[authorText].count += 1;
        authorData[authorText].articleIds.push(articleId);
    }

    console.log(`[${pageLabel}] 解析到 ${articlesFound} 篇文章，其中本週範圍內：${hasInRange ? '是' : '否'}`);
    return { hasInRange };
}

async function main() {
    const seenArticleIds = new Set();
    const authorData = {};
    let scannedPages = 0;

    // 1. 抓取最新頁
    if (FETCH_LATEST_PAGE) {
        console.log('抓取最新頁 index.html...');
        try {
            const html = await fetchPage(BASE_URL + 'index.html');
            parsePage(html, seenArticleIds, authorData, '最新頁');
            scannedPages++;
        } catch (err) {
            console.error('最新頁抓取失敗:', err);
        }
        await sleep(DELAY_MS);
    }

    // 2. 從 START_PAGE 開始向後翻頁
    for (let page = START_PAGE; page < START_PAGE + MAX_PAGES; page++) {
        const url = BASE_URL + `index${page}.html`;
        console.log(`抓取第 ${page} 頁（${url}）...`);
        try {
            const html = await fetchPage(url);
            const { hasInRange } = parsePage(html, seenArticleIds, authorData, `第${page}頁`);
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
