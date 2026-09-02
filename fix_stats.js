// fix_stats.js
const fs = require('fs');

const STATS_FILE = 'stats.json';

if (!fs.existsSync(STATS_FILE)) {
    console.log('stats.json 不存在，無需修復');
    process.exit(0);
}

const raw = fs.readFileSync(STATS_FILE, 'utf8');
const data = JSON.parse(raw);

let fixedCount = 0;

for (const [author, info] of Object.entries(data.stats)) {
    const originalLength = info.articleIds.length;
    const uniqueIds = [...new Set(info.articleIds)];
    const uniqueLength = uniqueIds.length;

    if (originalLength !== uniqueLength) {
        // 重新計算 count
        const newCount = uniqueIds.length;
        // 注意：normalCount 和 deletedCount 無法從 ID 還原，
        // 但我們可以基於 uniqueIds 重新計算（需要重新解析文章，但這太複雜）
        // 最保險的方式是將 deletedCount 歸零，因為我們無法區分哪些是刪除的
        // 但為了保留 deletedCount 的資訊，我們只去重，保留既有 deletedCount
        // 但這可能導致 count 與 normalCount+deletedCount 不一致
        // 因此建議簡單做法：只去重，count 改為 uniqueLength
        info.articleIds = uniqueIds;
        info.count = uniqueLength;
        // 如果 normalCount + deletedCount 大於 count，則修正
        if (info.normalCount + info.deletedCount > info.count) {
            // 優先保留 normalCount，縮減 deletedCount
            const diff = (info.normalCount + info.deletedCount) - info.count;
            info.deletedCount = Math.max(0, info.deletedCount - diff);
        }
        fixedCount++;
        console.log(`✅ 修復 ${author}：${originalLength} -> ${uniqueLength} 篇`);
    }
}

if (fixedCount === 0) {
    console.log('✅ 所有資料皆無重複，無需修復');
} else {
    // 寫回檔案
    data.totalArticles = Object.values(data.stats).reduce((sum, info) => sum + info.count, 0);
    fs.writeFileSync(STATS_FILE, JSON.stringify(data, null, 2));
    console.log(`✅ 已修復 ${fixedCount} 位作者的重複 ID，並更新 stats.json`);
}
