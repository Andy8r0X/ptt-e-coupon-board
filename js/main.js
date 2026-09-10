// js/main.js - 完整版本（任兩篇間隔 ≤ 7 天視為違規，排除已刪除文章）
// 永久排除的作者名單
const EXCLUDED_AUTHORS = ['jasome', 'lintsungyi', 'andy199113'];

let statsData = null;

// ----- 從文章 ID 解析時間戳（秒）-----
function getTimestampFromId(articleId) {
    const match = articleId.match(/M\.(\d+)\./);
    return match ? parseInt(match[1], 10) : 0;
}

// ----- 將時間戳轉為「年月日」的毫秒數（忽略時分秒）-----
function toDateOnly(ts) {
    if (!ts) return null;
    const d = new Date(ts * 1000);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

// ----- 判定：任兩篇未刪除文章，日期差 ≤ 7 天 → 違規 -----
function hasViolationWithin7Days(articleIds, deletedIds) {
    const deletedSet = new Set(deletedIds || []);
    const validIds = articleIds.filter(id => !deletedSet.has(id));

    const dates = validIds
        .map(id => toDateOnly(getTimestampFromId(id)))
        .filter(d => d !== null)
        .sort((a, b) => a - b);

    for (let i = 1; i < dates.length; i++) {
        const diffDays = (dates[i] - dates[i - 1]) / (1000 * 60 * 60 * 24);
        if (diffDays <= 7) return true;
    }
    return false;
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

// ----- 載入公告名單（三欄表格 + 折疊功能）-----
fetch('announcement.json')
    .then(res => {
        if (!res.ok) throw new Error(`無法載入公告 (${res.status})`);
        return res.json();
    })
    .then(data => {
        const container = document.getElementById('announcement-content');
        const countBadge = document.getElementById('announcement-count');
        container.innerHTML = '';

        if (data.entries && data.entries.length > 0) {
            countBadge.textContent = `${data.entries.length} 人`;

            const table = document.createElement('table');
            table.style.width = '100%';
            table.style.borderCollapse = 'collapse';
            table.style.fontSize = '0.9rem';

            const thead = document.createElement('thead');
            thead.innerHTML = `
                <tr>
                    <th style="text-align:left;padding:6px 8px;border-bottom:2px solid #e74c3c;font-weight:600;font-size:0.8rem;color:#c0392b;">使用者</th>
                    <th style="text-align:left;padding:6px 8px;border-bottom:2px solid #e74c3c;font-weight:600;font-size:0.8rem;color:#c0392b;">公告日期</th>
                    <th style="text-align:left;padding:6px 8px;border-bottom:2px solid #e74c3c;font-weight:600;font-size:0.8rem;color:#c0392b;">備註</th>
                </tr>
            `;
            table.appendChild(thead);

            const tbody = document.createElement('tbody');
            data.entries.forEach(entry => {
                const tr = document.createElement('tr');
                const note = entry.note || '';
                tr.innerHTML = `
                    <td style="padding:4px 8px;border-bottom:1px solid rgba(0,0,0,0.05);">${entry.name}</td>
                    <td style="padding:4px 8px;border-bottom:1px solid rgba(0,0,0,0.05);">${entry.date}</td>
                    <td style="padding:4px 8px;border-bottom:1px solid rgba(0,0,0,0.05);">${note}</td>
                `;
                tbody.appendChild(tr);
            });
            table.appendChild(tbody);
            container.appendChild(table);

            if (data.updatedAt) {
                const meta = document.createElement('div');
                meta.textContent = `（更新時間：${data.updatedAt}）`;
                meta.className = 'announcement-meta';
                container.appendChild(meta);
            }

            const isOpen = localStorage.getItem('announcementOpen') === 'true';
            if (isOpen) {
                container.classList.add('open');
                document.getElementById('toggle-arrow').classList.add('open');
                document.getElementById('toggle-label').textContent = '收合';
                document.getElementById('toggle-announcement').setAttribute('aria-expanded', 'true');
            }
        } else if (data.lines && data.lines.length > 0) {
            countBadge.textContent = `${data.lines.length} 人`;
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

// ----- 折疊開關事件 -----
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

    // ✅ 高亮「任兩篇未刪除文章間隔 ≤ 7 天」的作者
    const highlightAuthors = entries.filter(([, infoObj]) => {
        return hasViolationWithin7Days(infoObj.articleIds, infoObj.deletedIds);
    });

    if (highlightAuthors.length > 0) {
        highlightBox.style.display = 'block';
        const container = document.createElement('div');
        highlightAuthors.forEach(([author, infoObj]) => {
            const item = document.createElement('div');
            let text = `${author}：曾在 7 天內發超過 1 篇（總 ${infoObj.count} 篇`;
            if (infoObj.deletedCount > 0) text += `，已刪除 ${infoObj.deletedCount} 篇`;
            text += '）';
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
