// js/main.js - 3小時內連續發文偵測 + 日曆 + 文章ID收合
const EXCLUDED_AUTHORS = ['jasome', 'lintsungyi', 'andy199113'];

const MAX_ID_DISPLAY = 10;  // 文章 ID 超過此數量時收合

let statsData = null;
let calendarDateCounts = {};   // { "YYYY-MM-DD": count }
let calendarUniqueIds = new Set();
let calYear = null;
let calMonth = null;

// ----- 從文章 ID 解析時間戳（秒）-----
function getTimestampFromId(articleId) {
    const match = articleId.match(/M\.(\d+)\./);
    return match ? parseInt(match[1], 10) : 0;
}

// ----- 格式化時間戳為可讀字串 -----
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

// ----- 取得日期 key（YYYY-MM-DD）-----
function getDateKey(ts) {
    if (!ts) return null;
    const d = new Date(ts * 1000);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// ----- 偵測 3 小時內連續發文 -----
function findRapidPosts(articleIds, deletedIds, hours = 3) {
    const deletedSet = new Set(deletedIds || []);
    const validIds = articleIds.filter(id => !deletedSet.has(id));

    const posts = validIds
        .map(id => ({ id, ts: getTimestampFromId(id) }))
        .filter(p => p.ts > 0)
        .sort((a, b) => a.ts - b.ts);

    const threshold = hours * 3600;
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

// ----- 建立日曆資料（從所有作者的文章）-----
function buildCalendarData(data) {
    calendarDateCounts = {};
    calendarUniqueIds = new Set();

    for (const [author, info] of Object.entries(data.stats)) {
        if (EXCLUDED_AUTHORS.includes(author)) continue;
        const ids = info.articleIds || [];
        for (const id of ids) {
            calendarUniqueIds.add(id);
            const ts = getTimestampFromId(id);
            const key = getDateKey(ts);
            if (!key) continue;
            calendarDateCounts[key] = (calendarDateCounts[key] || 0) + 1;
        }
    }

    // 預設顯示最新月份
    const keys = Object.keys(calendarDateCounts).sort();
    if (keys.length > 0) {
        const latest = keys[keys.length - 1];
        const [y, m] = latest.split('-').map(Number);
        calYear = y;
        calMonth = m - 1;
    } else {
        const now = new Date();
        calYear = now.getFullYear();
        calMonth = now.getMonth();
    }
}

// ----- 取得某月的統計資訊 -----
function getMonthStats(year, month) {
    const prefix = `${year}-${String(month + 1).padStart(2, '0')}`;
    let total = 0;
    const uniqueArticleIds = new Set();
    const uniqueAuthors = new Set();

    if (statsData) {
        for (const [author, info] of Object.entries(statsData.stats)) {
            if (EXCLUDED_AUTHORS.includes(author)) continue;
            const ids = info.articleIds || [];
            for (const id of ids) {
                const ts = getTimestampFromId(id);
                const key = getDateKey(ts);
                if (key && key.startsWith(prefix)) {
                    total++;
                    uniqueArticleIds.add(id);
                    uniqueAuthors.add(author);
                }
            }
        }
    }

    return {
        total,
        uniqueArticleCount: uniqueArticleIds.size,
        uniqueAuthorCount: uniqueAuthors.size
    };
}

// ----- 依數量取得顏色等級 -----
function getCountLevel(count) {
    if (count === 0) return '';
    if (count <= 3) return 'count-lv1';
    if (count <= 8) return 'count-lv2';
    if (count <= 15) return 'count-lv3';
    return 'count-lv4';
}

// ----- 渲染日曆 -----
function renderCalendar() {
    const container = document.getElementById('calendar-content');
    container.innerHTML = '';

    const { total, uniqueArticleCount, uniqueAuthorCount } = getMonthStats(calYear, calMonth);

    // 頂部導航列
    const header = document.createElement('div');
    header.className = 'calendar-header';

    const prevBtn = document.createElement('button');
    prevBtn.className = 'cal-nav-btn';
    prevBtn.textContent = '◀';
    prevBtn.onclick = () => {
        calMonth--;
        if (calMonth < 0) { calMonth = 11; calYear--; }
        renderCalendar();
    };

    const title = document.createElement('div');
    title.className = 'cal-title';
    title.innerHTML = `${calYear}年${calMonth + 1}月
        <span class="cal-total">(總計 ${total} 篇)</span>
        <span class="cal-uniq">不重複作者：${uniqueAuthorCount} 人 ｜ 不重複文章 ID：${uniqueArticleCount} 個</span>`;

    const nextBtn = document.createElement('button');
    nextBtn.className = 'cal-nav-btn';
    nextBtn.textContent = '▶';
    nextBtn.onclick = () => {
        calMonth++;
        if (calMonth > 11) { calMonth = 0; calYear++; }
        renderCalendar();
    };

    header.appendChild(prevBtn);
    header.appendChild(title);
    header.appendChild(nextBtn);
    container.appendChild(header);

    // 星期標題
    const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
    const grid = document.createElement('div');
    grid.className = 'calendar-grid';

    weekdays.forEach(w => {
        const cell = document.createElement('div');
        cell.className = 'calendar-weekday';
        cell.textContent = w;
        grid.appendChild(cell);
    });

    // 計算首日與天數
    const firstDay = new Date(calYear, calMonth, 1).getDay();
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();

    // 空白格
    for (let i = 0; i < firstDay; i++) {
        const empty = document.createElement('div');
        empty.className = 'calendar-cell empty';
        grid.appendChild(empty);
    }

    // 日期格
    for (let day = 1; day <= daysInMonth; day++) {
        const cell = document.createElement('div');
        cell.className = 'calendar-cell';

        const dateKey = `${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
        const count = calendarDateCounts[dateKey] || 0;

        if (count > 0) {
            cell.classList.add('has-articles');
            cell.classList.add(getCountLevel(count));
        }

        const dayNum = document.createElement('div');
        dayNum.className = 'calendar-day';
        dayNum.textContent = day;
        cell.appendChild(dayNum);

        if (count > 0) {
            const countEl = document.createElement('div');
            countEl.className = 'calendar-count';
            countEl.textContent = count;
            cell.appendChild(countEl);
        }

        cell.title = `${dateKey}：${count} 篇`;
        grid.appendChild(cell);
    }

    container.appendChild(grid);
}

// ----- 載入 stats.json -----
fetch('stats.json')
    .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
    })
    .then(data => {
        statsData = data;
        buildCalendarData(data);
        render(data);
        renderCalendar();
    })
    .catch(err => {
        document.getElementById('info').textContent = '載入失敗：' + err.message;
    });

// ----- 建立單一文章 ID 元素 -----
function createIdItem(id, deletedSet) {
    const el = document.createElement('div');
    el.className = 'id-item';
    el.textContent = id;
    if (deletedSet.has(id)) {
        el.classList.add('deleted');
        el.title = '此文章已被刪除';
    }
    return el;
}

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

    for (const [author, infoObj] of entries) {
        const row = document.createElement('tr');

        // 作者
        const tdAuthor = document.createElement('td');
        tdAuthor.textContent = author;
        row.appendChild(tdAuthor);

        // 篇數
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

        // 文章 ID（垂直排列 + 收合）
        const tdIds = document.createElement('td');
        tdIds.className = 'article-list';

        const ids = infoObj.articleIds || [];
        const deletedSet = new Set(infoObj.deletedIds || []);

        if (ids.length <= MAX_ID_DISPLAY) {
            ids.forEach(id => tdIds.appendChild(createIdItem(id, deletedSet)));
        } else {
            const visibleBox = document.createElement('div');
            ids.slice(0, MAX_ID_DISPLAY).forEach(id => visibleBox.appendChild(createIdItem(id, deletedSet)));
            tdIds.appendChild(visibleBox);

            const hiddenBox = document.createElement('div');
            hiddenBox.style.display = 'none';
            ids.slice(MAX_ID_DISPLAY).forEach(id => hiddenBox.appendChild(createIdItem(id, deletedSet)));
            tdIds.appendChild(hiddenBox);

            const remaining = ids.length - MAX_ID_DISPLAY;
            const toggle = document.createElement('button');
            toggle.className = 'id-toggle';
            toggle.textContent = `展開剩餘 ${remaining} 個`;
            toggle.onclick = () => {
                const isHidden = hiddenBox.style.display === 'none';
                hiddenBox.style.display = isHidden ? 'block' : 'none';
                toggle.textContent = isHidden ? '收合' : `展開剩餘 ${remaining} 個`;
            };
            tdIds.appendChild(toggle);
        }

        row.appendChild(tdIds);
        tbody.appendChild(row);
    }

    // ----- 3 小時內連續發文 -----
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
