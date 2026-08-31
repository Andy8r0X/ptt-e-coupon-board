// fetch_stats.js
const https = require('https');
const fs = require('fs');
const path = require('path');

// ===== 可調參數 =====
const START_PAGE = 3932;          // 起始頁碼（index3932.html）
const MAX_PAGES = 100;            // 最多向後翻頁數（安全上限，可涵蓋至 index4031）
const EMPTY_PAGE_THRESHOLD = 5;   // 連續 N 頁無符合文章才停止
const MAIN_START_DATE = '8/29';   // 統計起始日期（包含）
const DELAY_MS = 800;             // 請求延遲毫秒
// ===================

const BASE_URL = 'https://www.ptt.cc/bbs/e-coupon/';

function getTodayStr() {
    const now = new Date();
    return `${now.getMonth() + 1}/${now.getDate()}`;
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

        // 只統計日期 >= MAIN_START_DATE 的文章
        if (dateText < MAIN_START_DATE) continue;
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

    console.log(`[${pageLabel}] 解析到 ${articlesFound} 篇文章，其中符合日期：${hasInRange ? '是' : '否'}`);
    return { hasInRange };
}

async function main() {
    const seenArticleIds = new Set();
    const authorData = {};
    let scannedPages = 0;
    let emptyCount = 0;

    const dateRange = { start: MAIN_START_DATE, end: getTodayStr() };

    for (let page = START_PAGE; page < START_PAGE + MAX_PAGES; page++) {
        const url = BASE_URL + `index${page}.html`;
        console.log(`抓取第 ${page} 頁（${url}）...`);
        try {
            const html = await fetchPage(url);
            const { hasInRange } = parsePage(html, seenArticleIds, authorData, `第${page}頁`);
            scannedPages++;
            if (hasInRange) {
                emptyCount = 0;
            } else {
                emptyCount++;
                if (emptyCount >= EMPTY_PAGE_THRESHOLD) {
                    console.log(`連續 ${EMPTY_PAGE_THRESHOLD} 頁無符合文章，停止翻頁。`);
                    break;
                }
            }
            await sleep(DELAY_MS);
        } catch (err) {
            console.error(`第 ${page} 頁抓取失敗:`, err);
            break;
        }
    }

    const now = new Date();
    const timestamp = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}-${String(now.getHours()).padStart(2,'0')}-${String(now.getMinutes()).padStart(2,'0')}-${String(now.getSeconds()).padStart(2,'0')}`;

    const output = {
        generatedAt: now.toISOString(),
        mode: 'range',
        dateRange: dateRange,
        scannedPages: scannedPages,
        stats: authorData
    };

    // 寫入 stats.json
    fs.writeFileSync('stats.json', JSON.stringify(output, null, 2));

    // 寫入 export 歷史
    const exportDir = path.join(__dirname, 'export');
    fs.mkdirSync(exportDir, { recursive: true });
    fs.writeFileSync(path.join(exportDir, `${timestamp}.json`), JSON.stringify(output, null, 2));

    console.log('stats.json 與 export 歷史已更新。');
    console.log(`統計區間：${dateRange.start} ~ ${dateRange.end}`);
    console.log(`總作者數：${Object.keys(authorData).length}`);
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

main().catch(console.error);
