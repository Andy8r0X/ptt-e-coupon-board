// fetch_stats.js
const https = require('https');
const fs = require('fs');
const path = require('path');

// ===== 可調參數 =====
const FETCH_LATEST_PAGE = true;
const START_PAGE = 3999;
const MAX_PAGES = 200;
const EXTRA_PAGES = [4007];        // 額外指定頁碼（可自行增減）
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

function extractOriginalAuthor(titleHtml) {
    // 方法1：匹配 &lt;ID&gt;
    let match = titleHtml.match(/&lt;([^&]+)&gt;/);
    if (match) return match[1].trim();
    // 方法2：匹配 <ID>（未轉義）
    match = titleHtml.match(/<([^>]+)>/);
    if (match) {
        const id = match[1].trim();
        if (id && id !== '/') return id;
    }
    return null;
}

function parsePage(html, seenArticleIds, authorData, pageLabel) {
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

    // 3. 抓取額外指定頁碼（避免遺漏）
    for (const page of EXTRA_PAGES) {
        if (page >= START_PAGE && page < START_PAGE + MAX_PAGES) continue; // 已抓過
        const url = BASE_URL + `index${page}.html`;
        console.log(`抓取額外頁 ${page}（${url}）...`);
        try {
            const html = await fetchPage(url);
            parsePage(html, seenArticleIds, authorData, `額外第${page}頁`);
            scannedPages++;
            await sleep(DELAY_MS);
        } catch (err) {
            console.error(`額外頁 ${page} 抓取失敗:`, err);
        }
    }

    const now = new Date();
    const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}-${String(now.getSeconds()).padStart(2, '0')}`;

    const output = {
        generatedAt: now.toISOString(),
        mode: 'week',
        dateRange: dateRange,
        scannedPages: scannedPages,
        stats: authorData
    };

    const exportDir = path.join(__dirname, 'export');
    fs.mkdirSync(exportDir, { recursive: true });
    const timestampFile = path.join(exportDir, `${timestamp}.json`);
    fs.writeFileSync(timestampFile, JSON.stringify(output, null, 2));

    fs.writeFileSync('stats.json', JSON.stringify(output, null, 2));

    console.log(`已輸出 ${timestampFile}`);
    console.log('stats.json 已更新。');
    console.log(`統計區間：${dateRange.start} ~ ${dateRange.end}`);
    console.log(`總作者數：${Object.keys(authorData).length}`);
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

main().catch(console.error);
