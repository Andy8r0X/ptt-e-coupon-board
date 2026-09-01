// 永久排除的作者名單
const EXCLUDED_AUTHORS = ['jasome', 'lintsungyi', 'andy199113'];

let statsData = null;

// 過濾掉被排除的作者
function getFilteredStats(data) {
    const filtered = {};
    for (const [author, info] of Object.entries(data.stats)) {
        if (!EXCLUDED_AUTHORS.includes(author)) {
            filtered[author] = info;
        }
    }
    return filtered;
}

// 載入 stats.json
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

// 載入 announcement.json
fetch('announcement.json')
    .then(res => {
        if (!res.ok) throw new Error(`無法載入公告 (${res.status})`);
        return res.json();
    })
    .then(data => {
        const container = document.getElementById('announcement-content');
        if (data.lines && data.lines.length > 0) {
            container.innerHTML = data.lines.join('\n');
            // 若有更新時間可顯示
            if (data.updatedAt) {
                container.innerHTML += `\n（更新時間：${data.updatedAt}）`;
            }
        } else {
            container.textContent = '（目前無公告名單）';
        }
    })
    .catch(err => {
        document.getElementById('announcement-content').textContent = '（公告名單尚未建立）';
        console.warn('公告載入失敗:', err.message);
    });

function render(data) {
    const info = document.getElementById('info');
    const table = document.getElementById('stats-table');
    const tbody = document.getElementById('stats-body');
    const toolbar = document.getElementById('toolbar');
    const highlightBox = document.getElementById('highlight');
    const highlightContent = document.getElementById('highlight-content');

    const filteredStats = getFilteredStats(data);

    info.textContent = `統計區間：${data.dateRange.start} ~ ${data.dateRange.end} | 掃描頁數：${data.scannedPages} | 更新時間：${new Date(data.generatedAt).toLocaleString()}`;
    tbody.innerHTML = '';
    highlightContent.innerHTML = '';

    const entries = Object.entries(filteredStats).sort((a, b) => a[0].localeCompare(b[0]));
    if (entries.length === 0) {
        info.textContent += '（無資料）';
        table.style.display = 'none';
        toolbar.style.display = 'none';
        highlightBox.style.display = 'none';
    } else {
        table.style.display = 'table';
        toolbar.style.display = 'block';
        for (const [author, infoObj] of entries) {
            const row = document.createElement('tr');
            const idList = infoObj.articleIds.map(id => `<span>${id}</span>`).join('');
            let countDisplay = `${infoObj.count}`;
            if (infoObj.deletedCount > 0) {
                countDisplay += ` <span class="deleted-badge">(刪除${infoObj.deletedCount})</span>`;
            }
            if (infoObj.count > 2) {
                row.classList.add('high-count');
            }
            row.innerHTML = `<td>${author}</td><td>${countDisplay}</td><td class="article-list">${idList}</td>`;
            tbody.appendChild(row);
        }
        const highlightAuthors = entries.filter(([, infoObj]) => infoObj.count > 1);
        if (highlightAuthors.length > 0) {
            highlightBox.style.display = 'block';
            let html = '';
            for (const [author, infoObj] of highlightAuthors) {
                html += `<span style="font-weight:bold;">${author}</span>：${infoObj.count}篇`;
                if (infoObj.deletedCount > 0) html += `（刪除${infoObj.deletedCount}）`;
                html += '<br>';
            }
            highlightContent.innerHTML = html;
        } else {
            highlightBox.style.display = 'none';
        }
    }
}

// 匯出 CSV
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

// 匯出 XLS
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
