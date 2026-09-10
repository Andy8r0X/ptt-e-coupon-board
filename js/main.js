// js/main.js - 3小時內連續發文偵測版
const EXCLUDED_AUTHORS = ['jasome', 'lintsungyi', 'andy199113'];

let statsData = null;

// ----- 從文章 ID 解析時間戳（秒）-----
function getTimestampFromId(articleId) {
    const match = articleId.match(/M\.(\d+)\./);
    return match ? parseInt(match[1], 10) : 0;
}

// ----- 格式化時間戳為可讀字串（YYYY-MM-DD HH:MM）-----
function formatTimestamp(ts) {
    if (!ts) return '';
    const d = new Date(ts * 1000);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${y}-${m}-${day} ${h}:${min}`;
}

// ----- 偵測 3 小時內連續發文 -----
// 回傳：{ hasRapid: bool, groups: [{ first: {id, ts}, second: {id, ts}, diffMin: number }] }
function findRapidPosts(articleIds, deletedIds, hours = 3) {
    const deletedSet = new Set(deletedIds || []);
    const validIds = articleIds.filter(id => !deletedSet.has(id));

    const posts = validIds
        .map(id => ({ id, ts: getTimestampFromId(id) }))
        .filter(p => p.ts > 0)
        .sort((a, b) => a.ts - b.ts);

    const threshold = hours * 3600; // 3 小時 = 10800 秒
    const groups = [];

    for (let i = 1; i < posts.length; i++) {
        const diff = posts[i].ts - posts[i - 1].ts;
        if (diff <= threshold) {
            groups.push({
                first: posts[i - 1],
                second: posts[i],
                diffMin: Math.round(diff / 60)
            });
        }
    }
    return { hasRapid: groups.length > 0, groups };
}

// ----- 過濾掉排除名單 -----
function getFilteredStats(data) {
    const filtered = {};
    for (const [author, info] of Object.entries(data.stats)) {
        if (!EXCLUDED_AUTHORS.includes(author)) {
            filtered[author] = info;
        }
    }
    return filtered;
}

// ----- 載入 stats.json -----
fetch('stats.json')
    .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
    })
    .then(data => {
        statsData = data;
        render(data);
    })
    .catch(err => {
        document.getElementById('info').textContent = '載入失敗：' + err.message;
    });

// ----- 主渲染函數 -----
function render(data) {
    const info = document.getElementById('info');
    const table = document.getElementById('stats-table');
    const tbody = document.getElementById('stats-body');
    const toolbar = document.getElementById('toolbar');
    const rapidBox = document.getElementById('rapid');
    const rapidContent = document.getElementById('rapid-content');

    const filteredStats = getFilteredStats(data);
    const entries = Object.entries(filteredStats).sort((a, b) => a[0].localeCompare(b[0]));

    info.textContent = `統計區間：${data.dateRange.start} ~ ${data.dateRange.end} | 掃描頁數：${data.scannedPages} | 更新時間：${new Date(data.generatedAt).toLocaleString()}`;

    tbody.innerHTML = '';
    rapidContent.innerHTML = '';

    if (entries.length === 0) {
        info.textContent += '（無資料）';
        table.style.display = 'none';
        toolbar.style.display = 'none';
        rapidBox.style.display = 'none';
        return;
    }

    table.style.display = 'table';
    toolbar.style.display = 'block';

    // 填入表格
    for (const [author, infoObj] of entries) {
        const row = document.createElement('tr');

        const tdAuthor = document.createElement('td');
        tdAuthor.textContent = author;
        row.appendChild(tdAuthor);

        const tdCount = document.createElement('td');
        let countText = `${infoObj.count}`;
        if (infoObj.deletedCount > 0) {
            tdCount.appendChild(document.createTextNode(countText + ' '));
            const badge = document.createElement('span');
            badge.className = 'deleted-badge';
            badge.textContent = `(刪除${infoObj.deletedCount})`;
            tdCount.appendChild(badge);
        } else {
            tdCount.textContent = countText;
        }
        row.appendChild(tdCount);

        const tdIds = document.createElement('td');
        tdIds.className = 'article-list';
        if (infoObj.articleIds && infoObj.articleIds.length > 0) {
            const deletedSet = new Set(infoObj.deletedIds || []);
            infoObj.articleIds.forEach(id => {
                const span = document.createElement('span');
                span.textContent = id;
                if (deletedSet.has(id)) {
                    span.style.textDecoration = 'line-through';
                    span.style.opacity = '0.45';
                    span.title = '此文章已被刪除';
                }
                tdIds.appendChild(span);
            });
        }
        row.appendChild(tdIds);
        tbody.appendChild(row);
    }

    // ----- 偵測 3 小時內連續發文 -----
    const rapidAuthors = [];
    for (const [author, infoObj] of entries) {
        const result = findRapidPosts(infoObj.articleIds, infoObj.deletedIds, 3);
        if (result.hasRapid) {
            rapidAuthors.push({ author, groups: result.groups });
        }
    }

    if (rapidAuthors.length > 0) {
        rapidBox.style.display = 'block';
        rapidAuthors.forEach(({ author, groups }) => {
            groups.forEach(g => {
                const item = document.createElement('div');
                item.className = 'rapid-item';

                const authorSpan = document.createElement('span');
                authorSpan.className = 'author';
                authorSpan.textContent = author;
                item.appendChild(authorSpan);

                const timeSpan = document.createElement('span');
                timeSpan.className = 'time';
                timeSpan.textContent = `｜${formatTimestamp(g.first.ts)} → ${formatTimestamp(g.second.ts)}`;
                item.appendChild(timeSpan);

                const diffSpan = document.createElement('span');
                diffSpan.className = 'diff';
                diffSpan.textContent = `（間隔 ${g.diffMin} 分鐘）`;
                item.appendChild(diffSpan);

                rapidContent.appendChild(item);
            });
        });
    } else {
        rapidBox.style.display = 'none';
    }
}

// ----- 匯出 CSV -----
document.getElementById('export-csv').addEventListener('click', () => {
    if (!statsData) return;
    const filteredStats = getFilteredStats(statsData);
    const rows = [['作者', '總篇數', '正常篇數', '刪除篇數', '文章ID']];
    for (const [author, infoObj] of Object.entries(filteredStats).sort((a, b) => a[0].localeCompare(b[0]))) {
        rows.push([author, infoObj.count, infoObj.normalCount, infoObj.deletedCount, infoObj.articleIds.join(' ')]);
    }
    const csvContent = rows.map(row => row.join(',')).join('\n');
    downloadFile(csvContent, 'ecoupon_stats.csv', 'text/csv;charset=utf-8;');
});

// ----- 匯出 XLS -----
document.getElementById('export-xls').addEventListener('click', () => {
    if (!statsData) return;
    const filteredStats = getFilteredStats(statsData);
    let html = '<table border="1"><tr><th>作者</th><th>總篇數</th><th>正常篇數</th><th>刪除篇數</th><th>文章ID</th></tr>';
    for (const [author, infoObj] of Object.entries(filteredStats).sort((a, b) => a[0].localeCompare(b[0]))) {
        html += `<tr><td>${author}</td><td>${infoObj.count}</td><td>${infoObj.normalCount}</td><td>${infoObj.deletedCount}</td><td>${infoObj.articleIds.join('<br>')}</td></tr>`;
    }
    html += '</table>';
    const blob = new Blob([html], { type: 'application/vnd.ms-excel' });
    downloadBlob(blob, 'ecoupon_stats.xls');
});

// ----- 通用下載函數 -----
function downloadFile(content, filename, mime) {
    const blob = new Blob([content], { type: mime });
    downloadBlob(blob, filename);
}
function downloadBlob(blob, filename) {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
}
