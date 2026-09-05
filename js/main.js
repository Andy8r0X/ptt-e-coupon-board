// js/main.js - 完整安全版本，內建 7 天內超過 1 篇偵測 + 公告折疊功能
// 永久排除的作者名單
const EXCLUDED_AUTHORS = ['jasome', 'lintsungyi', 'andy199113'];

let statsData = null;

// ----- 輔助函數：從文章 ID 解析時間戳（秒）-----
function getTimestampFromId(articleId) {
    const match = articleId.match(/M\.(\d+)\./);
    return match ? parseInt(match[1], 10) : 0;
}

// ----- 計算某作者在最近 N 個自然日內的文章數量 -----
function countRecentDays(articleIds, days = 7) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - (days - 1));

    let count = 0;
    for (const id of articleIds) {
        const ts = getTimestampFromId(id);
        if (ts === 0) continue;
        const articleDate = new Date(ts * 1000);
        const articleDay = new Date(articleDate.getFullYear(), articleDate.getMonth(), articleDate.getDate());
        if (articleDay >= startDate && articleDay <= today) {
            count++;
        }
    }
    return count;
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

// ----- 載入公告名單（含折疊功能）-----
fetch('announcement.json')
    .then(res => {
        if (!res.ok) throw new Error(`無法載入公告 (${res.status})`);
        return res.json();
    })
    .then(data => {
        const container = document.getElementById('announcement-content');
        const countBadge = document.getElementById('announcement-count');
        container.innerHTML = '';

        if (data.lines && data.lines.length > 0) {
            // 顯示人數
            countBadge.textContent = `${data.lines.length} 人`;

            // 填入名單
            data.lines.forEach(line => {
                const p = document.createElement('div');
                p.textContent = line;
                p.className = 'line';
                container.appendChild(p);
            });

            if (data.updatedAt) {
                const meta = document.createElement('div');
                meta.textContent = `（更新時間：${data.updatedAt}）`;
                meta.className = 'announcement-meta';
                container.appendChild(meta);
            }

            // 預設展開狀態：從 localStorage 讀取偏好
            const isOpen = localStorage.getItem('announcementOpen') === 'true';
            if (isOpen) {
                container.classList.add('open');
                document.getElementById('toggle-arrow').classList.add('open');
                document.getElementById('toggle-label').textContent = '收合';
                document.getElementById('toggle-announcement').setAttribute('aria-expanded', 'true');
            }
        } else {
            container.textContent = '（目前無公告名單）';
            countBadge.textContent = '0 人';
        }
    })
    .catch(() => {
        document.getElementById('announcement-content').textContent = '（公告名單尚未建立）';
        document.getElementById('announcement-count').textContent = '0 人';
    });

// ----- 折疊開關事件（需等 DOM 載入完成）-----
document.addEventListener('DOMContentLoaded', function() {
    const toggleBtn = document.getElementById('toggle-announcement');
    const content = document.getElementById('announcement-content');
    const arrow = document.getElementById('toggle-arrow');
    const label = document.getElementById('toggle-label');

    if (toggleBtn) {
        toggleBtn.addEventListener('click', function() {
            const isOpen = content.classList.toggle('open');
            arrow.classList.toggle('open', isOpen);
            label.textContent = isOpen ? '收合' : '展開';
            this.setAttribute('aria-expanded', isOpen);
            // 儲存偏好
            localStorage.setItem('announcementOpen', isOpen);
        });
    }
});

// ----- 主渲染函數 -----
function render(data) {
    const info = document.getElementById('info');
    const table = document.getElementById('stats-table');
    const tbody = document.getElementById('stats-body');
    const toolbar = document.getElementById('toolbar');
    const highlightBox = document.getElementById('highlight');
    const highlightContent = document.getElementById('highlight-content');

    const filteredStats = getFilteredStats(data);
    const entries = Object.entries(filteredStats).sort((a, b) => a[0].localeCompare(b[0]));

    info.textContent = `統計區間：${data.dateRange.start} ~ ${data.dateRange.end} | 掃描頁數：${data.scannedPages} | 更新時間：${new Date(data.generatedAt).toLocaleString()}`;

    tbody.innerHTML = '';
    highlightContent.innerHTML = '';

    if (entries.length === 0) {
        info.textContent += '（無資料）';
        table.style.display = 'none';
        toolbar.style.display = 'none';
        highlightBox.style.display = 'none';
        return;
    }

    table.style.display = 'table';
    toolbar.style.display = 'block';

    for (const [author, infoObj] of entries) {
        const row = document.createElement('tr');
        if (infoObj.count > 2) row.classList.add('high-count');

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
            infoObj.articleIds.forEach(id => {
                const span = document.createElement('span');
                span.textContent = id;
                tdIds.appendChild(span);
            });
        }
        row.appendChild(tdIds);
        tbody.appendChild(row);
    }

    // 高亮「最近 7 個自然日內超過 1 篇」的作者
    const highlightAuthors = entries.filter(([, infoObj]) => {
        return countRecentDays(infoObj.articleIds, 7) > 1;
    });

    if (highlightAuthors.length > 0) {
        highlightBox.style.display = 'block';
        const container = document.createElement('div');
        highlightAuthors.forEach(([author, infoObj]) => {
            const recent = countRecentDays(infoObj.articleIds, 7);
            const item = document.createElement('div');
            let text = `${author}：7天內 ${recent} 篇（總 ${infoObj.count} 篇）`;
            if (infoObj.deletedCount > 0) text += `，刪除 ${infoObj.deletedCount} 篇`;
            item.textContent = text;
            item.style.fontWeight = 'bold';
            item.style.marginBottom = '4px';
            container.appendChild(item);
        });
        highlightContent.appendChild(container);
    } else {
        highlightBox.style.display = 'none';
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
