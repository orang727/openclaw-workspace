const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'database.db');

let db = null;

// 初始化数据库
async function initDB() {
    const SQL = await initSqlJs();
    
    // 如果数据库文件存在，加载它
    if (fs.existsSync(DB_PATH)) {
        const fileBuffer = fs.readFileSync(DB_PATH);
        db = new SQL.Database(fileBuffer);
        console.log('✅ 数据库加载成功');
    } else {
        db = new SQL.Database();
        console.log('✅ 数据库创建成功');
    }
    
    // 创建表
    createTables();
    
    return db;
}

// 创建表结构
function createTables() {
    // 城市表
    db.run(`
        CREATE TABLE IF NOT EXISTS cities (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            city_name TEXT NOT NULL,
            city_id TEXT NOT NULL UNIQUE,
            created_at TEXT DEFAULT (datetime('now'))
        )
    `);
    
    // 插入默认城市数据
    try {
        db.run(`INSERT OR IGNORE INTO cities (city_name, city_id) VALUES ('南昌', '360100')`);
    } catch (e) {}
    
    // 跟单任务表 - track_id为唯一主键，用于去重
    db.run(`
        CREATE TABLE IF NOT EXISTS tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            track_id TEXT NOT NULL UNIQUE,
            track_content_id TEXT,
            task_type TEXT DEFAULT '申请挂起',
            city TEXT,
            city_id TEXT,
            create_time TEXT NOT NULL,
            intent_content TEXT,
            confidence TEXT,
            status TEXT DEFAULT 'pending',
            exec_status TEXT DEFAULT '等待中',
            exec_action TEXT,
            exec_result TEXT,
            complete_time TEXT,
            mode TEXT DEFAULT 'manual',
            date TEXT,
            reason_name TEXT,
            track_type_name TEXT,
            track_level_name TEXT,
            work_id TEXT,
            promoter TEXT,
            operate_remark TEXT,
            created_at TEXT DEFAULT (datetime('now'))
        )
    `);
    
    // 执行日志表
    db.run(`
        CREATE TABLE IF NOT EXISTS task_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id TEXT NOT NULL,
            log_content TEXT,
            log_level TEXT DEFAULT 'INFO',
            create_time TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (task_id) REFERENCES tasks(task_id)
        )
    `);
    
    // 每日统计表（用于数据监控）
    db.run(`
        CREATE TABLE IF NOT EXISTS daily_stats (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL UNIQUE,
            processed_count INTEGER DEFAULT 0,
            processing_count INTEGER DEFAULT 0,
            error_rate REAL DEFAULT 0,
            manual_rate REAL DEFAULT 0,
            updated_at TEXT DEFAULT (datetime('now'))
        )
    `);
    
    // 创建索引
    db.run('CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)');
    db.run('CREATE INDEX IF NOT EXISTS idx_tasks_date ON tasks(date)');
    db.run('CREATE INDEX IF NOT EXISTS idx_task_logs_task_id ON task_logs(task_id)');
    
    saveDB();
    console.log('✅ 数据表创建完成');
}

// 保存数据库到文件
function saveDB() {
    if (!db) return;
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
}

// 获取数据库实例
function getDB() {
    return db;
}

// 插入任务 - 使用INSERT OR REPLACE基于track_id去重
function insertTask(task) {
    const stmt = db.prepare(`
        INSERT OR REPLACE INTO tasks (track_id, track_content_id, task_type, city, city_id, create_time, intent_content, confidence, status, exec_status, complete_time, mode, date, reason_name, track_type_name, track_level_name, work_id, promoter, operate_remark)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run([
        task.track_id, 
        task.track_content_id || '',
        task.task_type || '申请挂起', 
        task.city || '',
        task.city_id || '',
        task.create_time, 
        task.intent_content || '',
        task.confidence || '',
        task.status, 
        task.exec_status || '等待中', 
        task.complete_time || '',
        task.mode || 'manual', 
        task.date || '',
        task.reason_name || '',
        task.track_type_name || '',
        task.track_level_name || '',
        task.work_id || '',
        task.promoter || '',
        task.operate_remark || ''
    ]);
    stmt.free();
    saveDB();
    return db.exec('SELECT last_insert_rowid() as id')[0].values[0][0];
}

// 插入日志
function insertLog(taskId, logContent, logLevel = 'INFO') {
    const stmt = db.prepare(`
        INSERT INTO task_logs (task_id, log_content, log_level)
        VALUES (?, ?, ?)
    `);
    stmt.run([taskId, logContent, logLevel]);
    stmt.free();
    // 定期保存，不用每次都保存
}

// 保存日志（批量）
function saveLogs() {
    saveDB();
}

// 查询城市列表
function getCities() {
    const stmt = db.prepare('SELECT * FROM cities ORDER BY city_name');
    const results = [];
    while (stmt.step()) {
        results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
}

// 查询任务列表
function getTasks(filters = {}) {
    let sql = 'SELECT * FROM tasks WHERE 1=1';
    const params = [];
    
    if (filters.date) {
        sql += ' AND date = ?';
        params.push(filters.date);
    }
    if (filters.taskType) {
        sql += ' AND task_type = ?';
        params.push(filters.taskType);
    }
    if (filters.city) {
        sql += ' AND city = ?';
        params.push(filters.city);
    }
    if (filters.taskId) {
        sql += ' AND task_id LIKE ?';
        params.push('%' + filters.taskId + '%');
    }
    if (filters.status && filters.status !== 'all') {
        sql += ' AND status = ?';
        params.push(filters.status);
    }
    
    sql += ' ORDER BY create_time DESC';
    
    const stmt = db.prepare(sql);
    stmt.bind(params);
    
    const results = [];
    while (stmt.step()) {
        results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
}

// 查询单个任务
function getTaskById(trackId) {
    const stmt = db.prepare('SELECT * FROM tasks WHERE track_id = ?');
    stmt.bind([trackId]);
    let result = null;
    if (stmt.step()) {
        result = stmt.getAsObject();
    }
    stmt.free();
    return result;
}

// 查询任务日志
function getTaskLogs(taskId) {
    const stmt = db.prepare('SELECT * FROM task_logs WHERE task_id = ? ORDER BY create_time ASC');
    stmt.bind([taskId]);
    
    const results = [];
    while (stmt.step()) {
        results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
}

// 更新任务状态
function updateTaskStatus(trackId, status, execStatus, execAction = null, execResult = null, intentContent = null) {
    let sql = 'UPDATE tasks SET status = ?, exec_status = ?';
    const params = [status, execStatus];

    if (execAction !== null) {
        sql += ', exec_action = ?';
        params.push(execAction);
    }
    if (execResult !== null) {
        sql += ', exec_result = ?';
        params.push(execResult);
    }
    if (intentContent !== null) {
        sql += ', intent_content = ?';
        params.push(intentContent);
    }

    sql += ' WHERE track_id = ?';
    params.push(trackId);

    const stmt = db.prepare(sql);
    stmt.run(params);
    stmt.free();
    saveDB();
}

// 获取日期统计数据
function getDailyStats(date) {
    const stmt = db.prepare('SELECT * FROM daily_stats WHERE date = ?');
    stmt.bind([date]);
    let result = null;
    if (stmt.step()) {
        result = stmt.getAsObject();
    }
    stmt.free();
    return result;
}

// 更新每日统计
function updateDailyStats(date, stats) {
    const stmt = db.prepare(`
        INSERT OR REPLACE INTO daily_stats (date, processed_count, processing_count, error_rate, manual_rate)
        VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run([date, stats.processed_count, stats.processing_count, stats.error_rate, stats.manual_rate]);
    stmt.free();
    saveDB();
}

// 计算每日统计
function calcDailyStats(date) {
    const tasks = getTasks({ date });
    
    const total = tasks.length;
    const completed = tasks.filter(t => t.status === 'completed').length;
    const processing = tasks.filter(t => t.status === 'processing').length;
    const error = tasks.filter(t => t.status === 'error').length;
    const manual = tasks.filter(t => t.status === 'manual').length;
    
    const errorRate = total > 0 ? (error / total * 100).toFixed(1) : 0;
    const manualRate = total > 0 ? (manual / total * 100).toFixed(1) : 0;
    
    return {
        date,
        processed_count: completed,
        processing_count: processing,
        error_rate: parseFloat(errorRate),
        manual_rate: parseFloat(manualRate)
    };
}

// 关闭数据库
function closeDB() {
    if (db) {
        saveDB();
        db.close();
        db = null;
    }
}

module.exports = {
    initDB,
    getDB,
    saveDB,
    insertTask,
    insertLog,
    saveLogs,
    getTasks,
    getTaskById,
    getTaskLogs,
    updateTaskStatus,
    getDailyStats,
    updateDailyStats,
    calcDailyStats,
    getCities,
    closeDB
};
