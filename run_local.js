// run_local.js - 本機執行爬蟲 + 自動上傳至 GitHub
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const STATS_FILE = 'stats.json';
const STATE_FILE = 'state.json';
const EXPORT_DIR = 'export';

function log(msg) {
    const time = new Date().toLocaleString('zh-TW', { hour12: false });
    console.log(`[${time}] ${msg}`);
}

function run(cmd, options = {}) {
    try {
        return execSync(cmd, { encoding: 'utf8', stdio: options.silent ? 'pipe' : 'inherit', ...options });
    } catch (err) {
        if (options.ignoreError) {
            log(`⚠️ 指令失敗（已忽略）：${cmd}`);
            return null;
        }
        throw err;
    }
}

function hasChanges() {
    try {
        const result = execSync('git status --porcelain stats.json state.json export/', { encoding: 'utf8' });
        return result.trim().length > 0;
    } catch {
        return false;
    }
}

async function main() {
    log('=== 開始本機爬蟲執行 ===');

    // 1. 確認在 git 倉庫中
    if (!fs.existsSync('.git')) {
        log('❌ 錯誤：目前目錄不是 git 倉庫，請在專案根目錄執行此腳本。');
        process.exit(1);
    }

    // 2. 執行爬蟲
    log('▶ 執行 fetch_stats.js ...');
    try {
        run('node fetch_stats.js');
        log('✅ 爬蟲執行完成');
    } catch (err) {
        log('❌ 爬蟲執行失敗，中止上傳');
        process.exit(1);
    }

    // 3. 檢查是否有變更
    if (!hasChanges()) {
        log('ℹ️ 沒有新的變更，無需提交。');
        return;
    }

    // 4. 提交並推送
    log('▶ 提交並推送變更 ...');
    try {
        run('git add stats.json state.json export/', { silent: true });
        const timestamp = new Date().toLocaleString('zh-TW', { hour12: false });
        run(`git commit -m "🤖 自動更新統計資料（${timestamp}）"`, { silent: true });
        run('git push');
        log('✅ 已成功推送到 GitHub');
    } catch (err) {
        log('❌ 推送失敗，請檢查網路或 git 認證設定');
        console.error(err.message);
        process.exit(1);
    }

    log('=== 全部完成 ===');
}

main().catch(err => {
    console.error('未預期的錯誤：', err);
    process.exit(1);
});