#!/usr/bin/env node
/**
 * 挂起工作流 HTTP 服务
 *
 * 用法:
 *   node workflow-server.js [port]
 *
 * 示例:
 *   node workflow-server.js 3000
 */

const http = require('http');
const https = require('https');
const url = require('url');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ==================== 加载 hangqi-workflow ====================
const WORKFLOW_PATH = path.join(__dirname, 'hangqi-workflow.js');
let hangqiWorkflow = null;
try {
    hangqiWorkflow = require(WORKFLOW_PATH);
    console.log('✅ hangqi-workflow.js 模块加载成功');
} catch (e) {
    console.error('❌ hangqi-workflow.js 模块加载失败:', e.message);
}

// ==================== 数据库集成 ====================
const DB_PATH = path.join(__dirname, '..', 'database.db');
let db = null;
let dbReady = false;

// 初始化数据库
async function initDatabase() {
    try {
        const initSqlJs = require('sql.js');
        const SQL = await initSqlJs();
        
        if (fs.existsSync(DB_PATH)) {
            const fileBuffer = fs.readFileSync(DB_PATH);
            db = new SQL.Database(fileBuffer);
            console.log('✅ 数据库加载成功');
        } else {
            db = new SQL.Database();
            console.log('✅ 数据库创建成功');
        }
        
        // 确保表存在
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
        
        db.run(`
            CREATE TABLE IF NOT EXISTS task_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                task_id TEXT NOT NULL,
                log_content TEXT,
                log_level TEXT DEFAULT 'INFO',
                create_time TEXT DEFAULT (datetime('now')),
                FOREIGN KEY (task_id) REFERENCES tasks(track_id)
            )
        `);
        
        saveDatabase();
        dbReady = true;
        console.log('✅ 数据库表初始化完成');
    } catch (e) {
        console.error('❌ 数据库初始化失败:', e.message);
    }
}

function saveDatabase() {
    if (!db) return;
    try {
        const data = db.export();
        const buffer = Buffer.from(data);
        fs.writeFileSync(DB_PATH, buffer);
    } catch (e) {
        console.error('❌ 保存数据库失败:', e.message);
    }
}

// 更新任务状态
function updateTaskStatus(trackId, status, execStatus) {
    if (!db || !dbReady) return;
    try {
        // 先检查是否存在
        const checkStmt = db.prepare('SELECT id FROM tasks WHERE track_id = ?');
        checkStmt.bind([trackId]);
        const exists = checkStmt.step();
        checkStmt.free();
        
        if (exists) {
            // 更新现有记录
            const stmt = db.prepare(`
                UPDATE tasks SET status = ?, exec_status = ?, complete_time = datetime('now')
                WHERE track_id = ?
            `);
            stmt.run([status, execStatus, trackId]);
            stmt.free();
        } else {
            // 插入新记录（使用默认值）
            const now = new Date().toISOString().slice(0, 10);
            const stmt = db.prepare(`
                INSERT INTO tasks (track_id, status, exec_status, create_time, date)
                VALUES (?, ?, ?, datetime('now'), ?)
            `);
            stmt.run([trackId, status, execStatus, now]);
            stmt.free();
        }
        saveDatabase();
    } catch (e) {
        console.error('❌ 更新状态失败:', e.message);
    }
}

// 更新任务意图内容（Skill2返回的category）
function updateTaskIntent(trackId, intentName, intentContent, confidence) {
    if (!db || !dbReady) return;
    try {
        // 先检查是否存在
        const checkStmt = db.prepare('SELECT id FROM tasks WHERE track_id = ?');
        checkStmt.bind([trackId]);
        const exists = checkStmt.step();
        checkStmt.free();
        
        if (exists) {
            // 更新现有记录
            const stmt = db.prepare(`
                UPDATE tasks SET intent_content = ?, confidence = ?, status = 'processing', exec_status = '执行中'
                WHERE track_id = ?
            `);
            stmt.run([intentContent, confidence || '', trackId]);
            stmt.free();
        } else {
            // 插入新记录
            const now = new Date().toISOString().slice(0, 10);
            const stmt = db.prepare(`
                INSERT INTO tasks (track_id, status, exec_status, create_time, date, intent_content, confidence)
                VALUES (?, 'processing', '执行中', datetime('now'), ?, ?, ?)
            `);
            stmt.run([trackId, now, intentContent, confidence || '']);
            stmt.free();
        }
        saveDatabase();
    } catch (e) {
        console.error('❌ 更新意图失败:', e.message);
    }
}

// 插入日志
function insertTaskLog(trackId, logContent, logLevel = 'INFO') {
    if (!db || !dbReady) return;
    try {
        const stmt = db.prepare(`
            INSERT INTO task_logs (task_id, log_content, log_level)
            VALUES (?, ?, ?)
        `);
        stmt.run([trackId, logContent, logLevel]);
        stmt.free();
        // 定期保存，不用每次都保存
    } catch (e) {
        console.error('❌ 插入日志失败:', e.message);
    }
}

// 保存日志到数据库
function saveLogs() {
    if (!db || !dbReady) return;
    saveDatabase();
}

// 查询任务日志
function getTaskLogs(trackId) {
    if (!db || !dbReady) return [];
    try {
        const stmt = db.prepare('SELECT * FROM task_logs WHERE task_id = ? ORDER BY create_time ASC');
        stmt.bind([trackId]);
        const results = [];
        while (stmt.step()) {
            results.push(stmt.getAsObject());
        }
        stmt.free();
        return results;
    } catch (e) {
        console.error('❌ 查询日志失败:', e.message);
        return [];
    }
}

// 启动时初始化数据库
initDatabase();

// ==================== 沙箱 Session 管理 ====================
const SANDBOX = {
    sessions: new Map(),  // sessionId -> sessionInfo
    archiveDir: require('os').homedir() + '/.openclaw/workspace/workflows/archives',

    // 生成唯一沙箱 ID
    generateId() {
        return `sandbox-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    },

    // 创建新沙箱 Session
    async create(trackWorkId) {
        const sandboxId = this.generateId();
        const sessionFile = require('os').homedir() + `/.openclaw/agents/main/sessions/${sandboxId}.jsonl`;

        const sessionInfo = {
            sandboxId,
            trackWorkId,
            createdAt: new Date().toISOString(),
            status: 'created',
            sessionFile,
            history: []
        };

        // 创建 session 文件
        fs.writeFileSync(sessionFile, '', 'utf8');

        // 注册到 sessions.json
        await this.registerSession(sandboxId, sessionFile);

        this.sessions.set(sandboxId, sessionInfo);
        console.log(`[Sandbox] 创建新沙箱: ${sandboxId} (trackWorkId=${trackWorkId})`);
        return sandboxId;
    },

    // 注册 Session 到 sessions.json
    async registerSession(sandboxId, sessionFile) {
        const sessionsFile = require('os').homedir() + '/.openclaw/agents/main/sessions/sessions.json';
        try {
            const data = JSON.parse(fs.readFileSync(sessionsFile, 'utf8'));
            const key = `agent:main:${sandboxId}`;
            data[key] = {
                sessionId: sandboxId,
                updatedAt: Date.now(),
                systemSent: true,
                abortedLastRun: false,
                chatType: 'direct',
                deliveryContext: { channel: 'workflow-sandbox' },
                lastChannel: 'workflow-sandbox',
                origin: {
                    provider: 'workflow-sandbox',
                    surface: 'sandbox',
                    chatType: 'direct'
                },
                sessionFile: sessionFile,
                compactionCount: 0
            };
            fs.writeFileSync(sessionsFile, JSON.stringify(data, null, 2), 'utf8');
        } catch (e) {
            console.error(`[Sandbox] 注册 Session 失败: ${e.message}`);
        }
    },

    // 更新沙箱状态
    async update(sandboxId, updates) {
        const session = this.sessions.get(sandboxId);
        if (session) {
            Object.assign(session, updates);
        }
    },

    // 添加执行记录
    async addHistory(sandboxId, record) {
        const session = this.sessions.get(sandboxId);
        if (session) {
            session.history.push({
                ...record,
                timestamp: new Date().toISOString()
            });

            // 写入历史文件
            fs.appendFileSync(session.sessionFile, JSON.stringify(record) + '\n', 'utf8');
        }
    },

    // 存档执行结果
    async archive(sandboxId, result) {
        const session = this.sessions.get(sandboxId);
        if (!session) {
            console.log(`[Sandbox] 沙箱 ${sandboxId} 不存在，跳过存档`);
            return null;
        }

        // 确保存档目录存在
        const today = new Date().toISOString().split('T')[0];
        const archivePath = `${this.archiveDir}/${today}`;
        if (!fs.existsSync(archivePath)) {
            fs.mkdirSync(archivePath, { recursive: true });
        }

        const archiveFile = `${archivePath}/${sandboxId}.json`;
        const archiveData = {
            sandboxId,
            trackWorkId: session.trackWorkId,
            executedAt: session.createdAt,
            completedAt: new Date().toISOString(),
            duration: Date.now() - new Date(session.createdAt).getTime(),
            result,
            history: session.history,
            metadata: {
                version: '1.0.0',
                server: 'workflow-server'
            }
        };

        fs.writeFileSync(archiveFile, JSON.stringify(archiveData, null, 2), 'utf8');
        console.log(`[Sandbox] 存档完成: ${archiveFile}`);
        return archiveFile;
    },

    // 销毁沙箱 Session
    async destroy(sandboxId) {
        const session = this.sessions.get(sandboxId);
        if (!session) {
            console.log(`[Sandbox] 沙箱 ${sandboxId} 不存在`);
            return;
        }

        // 从 sessions.json 移除
        await this.unregisterSession(sandboxId);

        // 删除历史文件
        try {
            if (fs.existsSync(session.sessionFile)) {
                fs.unlinkSync(session.sessionFile);
            }
        } catch (e) {
            console.error(`[Sandbox] 删除 session 文件失败: ${e.message}`);
        }

        this.sessions.delete(sandboxId);
        console.log(`[Sandbox] 销毁沙箱: ${sandboxId}`);
    },

    // 从 sessions.json 移除
    async unregisterSession(sandboxId) {
        const sessionsFile = require('os').homedir() + '/.openclaw/agents/main/sessions/sessions.json';
        try {
            const data = JSON.parse(fs.readFileSync(sessionsFile, 'utf8'));
            const key = `agent:main:${sandboxId}`;
            if (data[key]) {
                delete data[key];
                fs.writeFileSync(sessionsFile, JSON.stringify(data, null, 2), 'utf8');
            }
        } catch (e) {
            console.error(`[Sandbox] 注销 Session 失败: ${e.message}`);
        }
    },

    // 获取沙箱列表
    list() {
        return Array.from(this.sessions.values());
    }
};

// ==================== 读取 AK Token ====================
function loadAuth() {
    const authPath = require('os').homedir() + '/.openclaw/workspace/.auth/xiujiadian';
    try {
        const content = require('fs').readFileSync(authPath, 'utf8');
        const config = {};
        content.split('\n').forEach(line => {
            const idx = line.indexOf('=');
            if (idx > 0) config[line.substring(0, idx).trim()] = line.substring(idx + 1).trim();
        });
        console.log('✅ 读取 .auth 文件成功:', JSON.stringify(config));
        return config;
    } catch (e) {
        console.error('读取 .auth 文件失败:', e.message);
        return null;
    }
}

// ==================== 配置 ====================
const CONFIG = {
    port: process.argv[2] || 3000,
    
    // AK Token（从 .auth 文件读取）
    _akToken: loadAuth(),
    get akToken() { return this._akToken?.AK || ''; },
    
    // API 端点
    endpoints: {
        trackList: 'https://test3-track.xiujiadian.com/amis/track/list',
        callRecord: 'https://test3-admin.xiujiadian.com/bfm-serv-work/serv/work/listCallRecord',
        intentAnalyze: 'https://test-ai.xiujiadian.com/zmn-ai-workflow/v1/961296a26366462b9fbef746ae4ea2cf/execute_flow',
        handleTrack: 'https://test3-track.xiujiadian.com/amis/track/save/newHandle',
        // 改约 API - 按 SKILL.md modify-duty-time 定义
        modifyTime: 'https://test-ais.xiujiadian.com/ratel-api/serv-work-general-agg/servWorkModifyDutyTimeRemoteService/modifyDutyTime',
        // 取消 API - 按 SKILL.md cancel-work 定义
        cancelWork: 'https://test-ais.xiujiadian.com/ratel-api/serv-work-general-agg/cancelApplyModifyRemoteService/submitCancelApply',
        // 创建跟单任务 API - 按 SKILL.md create-track-task 定义
        createFollowup: 'https://test-ais.xiujiadian.com/ratel-api/biz-twd/trackTaskModifyRemoteService/addTrackTask'
    },
    
    // 意图识别 Token
    intentToken: 'x76utyhsqdtirjcpp12sp9n2'
};

// ==================== 工具函数 ====================
// 当前正在执行的 trackId
let currentTrackId = null;

function setCurrentTrackId(trackId) {
    currentTrackId = trackId;
}

function log(message, type = 'info') {
    const now = new Date().toLocaleString('zh-CN');
    const colors = {
        info: '\x1b[36m',
        success: '\x1b[32m',
        warning: '\x1b[33m',
        error: '\x1b[31m',
        system: '\x1b[35m'
    };
    const reset = '\x1b[0m';
    console.log(`${colors[type]}[${now}] ${message}${reset}`);
    
    // 保存到数据库
    if (currentTrackId && dbReady) {
        try {
            insertTaskLog(currentTrackId, `[${type.toUpperCase()}] ${message}`, type);
        } catch (e) {
            console.error('保存日志失败:', e.message);
        }
    }
}

// 简单的 XML 转 JSON 解析器
function parseXML(xml) {
    const result = {};
    
    // 提取顶层标签
    const rootMatch = xml.match(/<([A-Za-z0-9_]+)>([\s\S]*)<\/\1>/);
    if (!rootMatch) return xml;
    
    const rootTag = rootMatch[1];
    result[rootTag] = {};
    
    // 提取子标签
    const content = rootMatch[2];
    const tagRegex = /<([A-Za-z0-9_]+)>([\s\S]*?)<\/\1>/g;
    let match;
    const tagCounts = {};
    
    // 先统计每个标签出现的次数
    while ((match = tagRegex.exec(content)) !== null) {
        const tagName = match[1];
        tagCounts[tagName] = (tagCounts[tagName] || 0) + 1;
    }
    
    // 重新解析，处理重复标签为数组
    tagRegex.lastIndex = 0;
    while ((match = tagRegex.exec(content)) !== null) {
        const tagName = match[1];
        const tagContent = match[2].trim();
        
        let parsedContent;
        if (tagContent.includes('<')) {
            parsedContent = parseXML(`<${tagName}>${tagContent}</${tagName}>`);
        } else {
            parsedContent = tagContent;
        }
        
        // 如果标签重复出现，转为数组
        if (tagCounts[tagName] > 1) {
            if (!result[rootTag][tagName]) {
                result[rootTag][tagName] = [];
            }
            result[rootTag][tagName].push(parsedContent);
        } else {
            result[rootTag][tagName] = parsedContent;
        }
    }
    
    return result;
}

function fetch(options, body = null) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(options.url);
        const protocol = urlObj.protocol === 'https:' ? https : http;
        
        const reqOptions = {
            hostname: urlObj.hostname,
            port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
            path: urlObj.pathname + urlObj.search,
            method: options.method || 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + CONFIG.akToken,
                ...options.headers
            }
        };
        
        const req = protocol.request(reqOptions, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    // 尝试 JSON 解析
                    if (data.trim().startsWith('{') || data.trim().startsWith('[')) {
                        resolve({
                            status: res.statusCode,
                            data: data ? JSON.parse(data) : null
                        });
                    } else {
                        // XML 响应，尝试解析为 JSON
                        const parsed = parseXML(data);
                        resolve({
                            status: res.statusCode,
                            data: parsed,
                            isXml: true
                        });
                    }
                } catch (e) {
                    resolve({
                        status: res.statusCode,
                        data: data,
                        raw: true
                    });
                }
            });
        });
        
        req.on('error', reject);
        
        if (body) {
            req.write(JSON.stringify(body));
        }
        
        req.end();
    });
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// 带重试的 fetch 函数
async function fetchWithRetry(options, body = null, retries = 3, delayMs = 1000) {
    let lastError;
    for (let i = 0; i < retries; i++) {
        try {
            const result = await fetch(options, body);
            // 如果是 401 或认证错误，尝试重试
            if (result.status === 401 || result.data?.error?.includes('Authentication')) {
                lastError = `HTTP 401 (尝试 ${i + 1}/${retries})`;
                log(`⚠️ 认证失败，${delayMs}ms 后重试... (${i + 1}/${retries})`, 'warning');
                await delay(delayMs);
                continue;
            }
            return result;
        } catch (e) {
            lastError = e.message;
            if (i < retries - 1) {
                log(`⚠️ 请求失败: ${e.message}，${delayMs}ms 后重试... (${i + 1}/${retries})`, 'warning');
                await delay(delayMs);
            }
        }
    }
    // 所有重试都失败，返回最后一次的错误
    log(`❌ 重试 ${retries} 次后仍然失败: ${lastError}`, 'error');
    return { status: 401, data: { error: lastError } };
}

// ==================== Skills ====================

async function skill1_getCallRecord(trackWorkId) {
    log(`═══════════════════════════════════════════════════════════`, 'info');
    log(`Skill1: 获取录音文本 - 输入: trackWorkId=${trackWorkId}`, 'info');

    // Step 1: 查询工单号
    log(`Skill1: Step1 查询工单号...`, 'info');
    const trackResult = await fetch({
        url: CONFIG.endpoints.trackList,
        method: 'POST'
    }, { trackWorkId });

    // 处理 XML 响应
    const status = trackResult.data?.AMISResponseDTO?.status || trackResult.data?.status;
    const msg = trackResult.data?.AMISResponseDTO?.msg || trackResult.data?.msg;
    const amisData = trackResult.data?.AMISResponseDTO;
    const innerData = amisData?.data?.data || amisData?.data;
    const itemsArray = innerData?.items;

    let items = [];
    if (Array.isArray(itemsArray)) {
        items = itemsArray;
    } else if (itemsArray?.items) {
        items = Array.isArray(itemsArray.items) ? itemsArray.items : [itemsArray.items];
    } else if (itemsArray) {
        items = [itemsArray];
    }

    log(`Skill1: 解析结果 - status=${status}, items 数量=${items?.length || 0}`, 'info');

    if (trackResult.status !== 200 || status != 0) {
        return {
            success: false,
            fail_reason: `查询工单失败：${msg || 'HTTP ' + trackResult.status}`
        };
    }

    if (!items || !items.length) {
        return {
            success: false,
            fail_reason: '未找到该跟单 ID 对应的工单',
            debug: { data: trackResult.data, items }
        };
    }

    const servWorkId = items[0].workId;
    log(`Skill1: 找到工单号 ${servWorkId}`, 'success');

    await delay(500);

    // Step 2: 查询通话记录获取 detectRecordId
    log(`Skill1: Step2 查询通话记录获取 detectRecordId...`, 'info');
    const callResult = await fetchWithRetry({
        url: `${CONFIG.endpoints.callRecord}?servWorkId=${servWorkId}`
    });

    log(`Skill1: 通话记录原始响应 = ${JSON.stringify(callResult.data).substring(0, 500)}`, 'info');
    const callStatus = callResult.data?.AMISResponseDTO?.status || callResult.data?.status;
    const callRecords = callResult.data?.AMISResponseDTO?.data || callResult.data?.data || [];
    const records = Array.isArray(callRecords) ? callRecords : (callRecords?.items || []);

    if (callResult.status !== 200 || callStatus != 0) {
        return {
            success: false,
            fail_reason: `查询通话记录失败：${callStatus || 'HTTP ' + callResult.status}`,
            servWorkId
        };
    }

    if (!records || records.length === 0) {
        return {
            success: false,
            fail_reason: '该工单暂无通话记录',
            servWorkId
        };
    }

    // 筛选规则：优先选有 detectRecordId 的记录
    const recordsWithDetectId = records.filter(r => r.detectRecordId);
    const selectedRecord = recordsWithDetectId.length > 0 ? recordsWithDetectId[0] : records[0];

    if (!selectedRecord.detectRecordId) {
        return {
            success: false,
            fail_reason: '该通话记录无 detectRecordId',
            servWorkId
        };
    }

    const detectRecordId = selectedRecord.detectRecordId;
    log(`Skill1: 获取到 detectRecordId=${detectRecordId}`, 'success');

    // Step 3: 获取语音转文字
    log(`Skill1: Step3 获取语音转文字...`, 'info');
    let voiceText = '';
    try {
        const voiceResult = await fetchWithRetry({
            url: `https://test3-admin.xiujiadian.com/bfm-mds/detectRecord/voiceRecord/content?detectRecordId=${detectRecordId}&pageIndex=1&pageSize=100`
        });

        const voiceData = voiceResult.data;
        if (voiceData?.status === 0 && voiceData?.data?.items) {
            // 拼接对话文本
            voiceText = voiceData.data.items.map(item => {
                const role = item.role === 1 ? '工程师' : '用户';
                return `${role}: ${item.text}`;
            }).join('\n');
            log(`Skill1: 获取语音转文字成功，共 ${voiceData.data.items.length} 条`, 'success');
        } else {
            log(`Skill1: 语音转文字接口返回异常`, 'warning');
            // 降级使用 remark 字段
            voiceText = selectedRecord.remark || '';
        }
    } catch (e) {
        log(`Skill1: 获取语音转文字异常: ${e.message}`, 'warning');
        voiceText = selectedRecord.remark || '';
    }

    log(`Skill1: 完成`, 'success');

    return {
        success: true,
        trackWorkId,
        servWorkId,
        detectRecordId,
        voiceText
    };
}

async function skill2_analyzeIntent(trackWorkId, servWorkId, recordingData) {
    log(`═══════════════════════════════════════════════════════════`, 'info');
    log(`Skill2: 识别意图 - 输入: trackWorkId=${trackWorkId}, servWorkId=${servWorkId}`, 'info');

    // recordingData 可能是：
    // 1. 字符串格式的纯文本（如 "工程师: xxx\n用户: yyy"）
    // 2. 或者包含 items 的结构化数据
    // 需要按 SKILL.md 格式构造 recording JSON 字符串

    let recordingJsonStr;
    if (typeof recordingData === 'string') {
        // 纯文本格式：转换为 items 数组
        // 格式: "工程师: xxx\n用户: yyy\n..."
        const lines = recordingData.split('\n').filter(line => line.trim());
        const items = lines.map((line, idx) => {
            const [role, ...textParts] = line.split(':');
            return {
                role: role.includes('工程师') ? '工程师' : '用户',
                text: textParts.join(':').trim()
            };
        });

        const recordingObj = {
            success: true,
            detect_record_id: '',
            total: items.length,
            fetched_count: items.length,
            page_count: 1,
            items: items
        };
        recordingJsonStr = JSON.stringify(recordingObj);
    } else {
        // 已经是对象或字符串化的 JSON
        recordingJsonStr = typeof recordingData === 'string' ? recordingData : JSON.stringify(recordingData);
    }

    log(`Skill2: recording 数据长度 = ${recordingJsonStr.length}`, 'info');

    const result = await fetch({
        url: CONFIG.endpoints.intentAnalyze,
        method: 'POST',
        headers: {
            'ak': `Bearer ${CONFIG.intentToken}`
        }
    }, {
        inputs: {
            recording: recordingJsonStr,
            dataMap: trackWorkId
        }
    });
    
    // 记录完整响应以便调试 token 用量
    log(`Skill2: API 完整响应 = ${JSON.stringify(result.data, null, 2)}`, 'info');
    
    if (result.status !== 200 || !result.data?.success) {
        return {
            status: 'interrupted',
            interrupt_reason: `意图识别失败：${result.data?.message || 'HTTP ' + result.status}`
        };
    }
    
    // 提取 token 用量（如果 API 返回）
    const tokenUsage = result.data.data?.usage || result.data.usage || null;
    if (tokenUsage) {
        log(`Skill2: Token 用量 = ${JSON.stringify(tokenUsage)}`, 'success');
    } else {
        log(`Skill2: ⚠️ API 未返回 token 用量信息`, 'warning');
    }
    
    const runResult = result.data.data?.run_result || '';
    let intentData;
    
    try {
        let jsonContent = runResult.trim();
        if (jsonContent.startsWith('```json')) {
            jsonContent = jsonContent.slice(7).trim();
        }
        if (jsonContent.endsWith('```')) {
            jsonContent = jsonContent.slice(0, -3).trim();
        }
        intentData = JSON.parse(jsonContent);
    } catch (e) {
        return {
            status: 'interrupted',
            interrupt_reason: `解析意图结果失败：${e.message}`
        };
    }
    
    const intention = intentData.intention || {};
    const category = intention.category || '';
    
    // 记录原始分类结果
    log(`Skill2: 原始分类 category = "${category}"`, 'info');
    log(`Skill2: 完整识别结果 = ${JSON.stringify(intentData)}`, 'info');
    
    let intent_name;
    if (category.includes('确认上门') || category.includes('同意上门')) {
        intent_name = '确认上门';
    } else if (category.includes('询价') || category.includes('价格')) {
        intent_name = '用户询价';
    } else {
        intent_name = '其他';
    }
    
    log(`Skill2: 识别到意图 "${intent_name}"`, 'success');
    
    return {
        status: 'success',
        intent_name,
        intent_result: intention.category || '',
        token_usage: tokenUsage,
        confidence: intention.confidence || '未知',
        confidence_score: intention.confidence_score || 0
    };
}

async function skill3_handleTrack(trackWorkId, servWorkId, intentName, intentResult) {
    log(`═══════════════════════════════════════════════════════════`, 'info');
    log(`Skill3: 处理跟单 - 输入: trackWorkId=${trackWorkId}, servWorkId=${servWorkId}, intent=${intentName}`, 'info');

    // 调用跟单处理 API
    log(`Skill3: 调用跟单处理 API...`, 'info');

    try {
        const handleResult = await fetchWithRetry({
            url: CONFIG.endpoints.handleTrack,
            method: 'POST'
        }, {
            workId: servWorkId,
            trackWorkId: trackWorkId,
            trackContentId: 1191,
            handleOptionList: [{ optionId: 111, optionName: '挂起申请驳回', optionLevel: 0 }],
            handleJumpType: 0,
            handleRemark: `${intentName}\n${intentResult}`,
            isCompleteTrack: 1
        });

        log(`Skill3: API 返回 = ${JSON.stringify(handleResult.data).substring(0, 500)}`, 'info');

        const handleStatus = handleResult.data?.AMISResponseDTO?.status || handleResult.data?.status;
        const handleMsg = handleResult.data?.AMISResponseDTO?.msg || handleResult.data?.msg;

        // 检查是否是"接口不存在"错误 - 阻断执行
        if (handleMsg?.includes('No endpoint') || handleMsg?.includes('不存在')) {
            log(`Skill3: ❌ 跟单处理接口不存在，阻断执行`, 'error');
            return {
                success: false,
                servWorkId: servWorkId,
                handle_remark: `${intentName}\n${intentResult}`,
                result: 'api_not_available',
                fail_reason: `接口不存在：${handleMsg}`
            };
        }

        if (handleResult.status !== 200 || handleStatus != 0) {
            log(`Skill3: ❌ 跟单处理失败: status=${handleStatus}, msg=${handleMsg}`, 'error');
            return {
                success: false,
                servWorkId: servWorkId,
                handle_remark: `${intentName}\n${intentResult}`,
                result: 'failed',
                fail_reason: `${handleMsg || 'HTTP ' + handleResult.status}`
            };
        }

        log(`Skill3: ✅ 跟单处理成功！`, 'success');
        return {
            success: true,
            servWorkId: servWorkId,
            handle_remark: `${intentName}\n${intentResult}`,
            api_response: handleResult.data
        };
    } catch (e) {
        log(`Skill3: ❌ 跟单处理异常: ${e.message}，阻断执行`, 'error');
        return {
            success: false,
            servWorkId: servWorkId,
            handle_remark: `${intentName}\n${intentResult}`,
            result: 'exception',
            reason: e.message
        };
    }
}

async function skill4_modifyTime(trackWorkId, servWorkId) {
    log(`═══════════════════════════════════════════════════════════`, 'info');
    log(`Skill4: 改约 - 输入: trackWorkId=${trackWorkId}, servWorkId=${servWorkId}`, 'info');

    try {
        // Step 1: 登录获取 sessionId
        log(`Skill4: Step1 登录获取 sessionId...`, 'info');

        const loginRes = await fetch({
            url: 'https://test3-mcc.xiujiadian.com/cas/login.action',
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                staffName: CONFIG.username,
                password: CONFIG.password
            }),
            redirect: 'manual'
        });

        log(`Skill4: 登录响应状态: ${loginRes.status}`);

        if (loginRes.status !== 200 && loginRes.status !== 302) {
            log(`Skill4: 登录失败，status=${loginRes.status}`, 'error');
            return { success: false, fail_reason: '登录失败' };
        }

        // 提取 cookies - 支持多种浏览器/Node.js 环境
        let allCookies = [];

        // 方法1: getSetCookie() (较新的标准方法)
        if (loginRes.headers.getSetCookie) {
            allCookies = loginRes.headers.getSetCookie();
        }

        // 方法2: 遍历 headers 获取 set-cookie (兼容性方案)
        if (allCookies.length === 0) {
            try {
                loginRes.headers.forEach((value, key) => {
                    if (key.toLowerCase() === 'set-cookie') {
                        allCookies.push(value);
                    }
                });
            } catch (e) {}
        }

        log(`Skill4: 获取到 ${allCookies.length} 个 cookie`);

        // 解析 cookie 查找 sessionId
        let sessionId = '';
        for (const cookie of allCookies) {
            log(`Skill4: Cookie: ${cookie.substring(0, 100)}...`, 'debug');
            if (cookie.includes('zmn.id=') || cookie.includes('session')) {
                const match = cookie.match(/(?:zmn\.id|session)[=:](\w+)/);
                if (match) {
                    sessionId = match[1];
                    break;
                }
            }
        }

        // 备用：尝试直接从 cookie 字符串匹配
        if (!sessionId && allCookies.length > 0) {
            const cookieStr = allCookies.join('; ');
            const sessionMatch = cookieStr.match(/zmn\.id=([^;]+)/);
            if (sessionMatch) {
                sessionId = sessionMatch[1];
            }
        }

        log(`Skill4: 解析到的 sessionId: ${sessionId ? sessionId.substring(0, 20) + '...' : '为空'}`);

        if (!sessionId) {
            log(`Skill4: 登录成功但未获取到sessionId`, 'error');
            return { success: false, fail_reason: '登录成功但未获取到sessionId' };
        }

        log(`Skill4: 获取 sessionId 成功`, 'success');

        // Step 2: 使用 sessionId + AK 调用获取人员信息接口
        log(`Skill4: Step2 获取人员信息...`, 'info');

        const staffRes = await fetch({
            url: 'https://test-ais.xiujiadian.com/ratel-api/base-mcc/mcStaffForeignListRemoteService/getLoginStaffBySessionId',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + CONFIG.intentToken
            },
            body: JSON.stringify({ sessionId })
        });

        const staffText = await staffRes.text();
        let staffInfo = { realName: '', deptName: '', deptId: 0, staffId: 0 };

        try {
            const staffData = JSON.parse(staffText);
            if (staffData.success === true && staffData.data) {
                staffInfo = staffData.data;
                log(`Skill4: 获取人员信息成功: ${staffInfo.realName}`, 'success');
            } else {
                log(`Skill4: 获取人员信息失败: ${JSON.stringify(staffData)}`, 'error');
                return { success: false, fail_reason: '获取人员信息失败' };
            }
        } catch (e) {
            // 尝试从 XML 提取
            const realName = staffText.match(/<realName>([^<]+)<\/realName>/);
            const deptName = staffText.match(/<deptName>([^<]+)<\/deptName>/);
            const deptId = staffText.match(/<deptId>([^<]+)<\/deptId>/);
            const staffIdMatch = staffText.match(/<staffId>([^<]+)<\/staffId>/);

            if (realName && staffIdMatch) {
                staffInfo = {
                    realName: realName[1],
                    deptName: deptName ? deptName[1] : '',
                    deptId: deptId ? parseInt(deptId[1]) : 0,
                    staffId: staffIdMatch ? parseInt(staffIdMatch[1]) : 0
                };
                log(`Skill4: 获取人员信息成功(XML解析): ${staffInfo.realName}`, 'success');
            } else {
                log(`Skill4: 无法解析人员信息响应`, 'error');
                return { success: false, fail_reason: '无法解析人员信息响应' };
            }
        }

        // Step 3: 修改预约时间
        log(`Skill4: Step3 修改预约时间...`, 'info');

        // 格式化时间函数
        function formatTime(date) {
            const y = date.getFullYear();
            const M = String(date.getMonth() + 1).padStart(2, '0');
            const d = String(date.getDate()).padStart(2, '0');
            const h = String(date.getHours()).padStart(2, '0');
            const m = String(date.getMinutes()).padStart(2, '0');
            const s = String(date.getSeconds()).padStart(2, '0');
            return `${y}-${M}-${d} ${h}:${m}:${s}`;
        }

        const now = new Date();
        const operateTime = formatTime(now);

        // 当天 +2 天后的 09:00
        const dutyDate = new Date(now);
        dutyDate.setDate(dutyDate.getDate() + 2);
        dutyDate.setHours(9, 0, 0, 0);
        const dutyTime = formatTime(dutyDate);

        const body = {
            operateTime,
            servWorkId,
            operator: staffInfo.realName,
            operatorDeptName: staffInfo.deptName,
            dutyTime,
            operatorDeptId: staffInfo.deptId,
            operatorId: String(staffInfo.staffId),
            operatorIdentity: 2
        };

        log(`Skill4: 请求体 = ${JSON.stringify(body)}`, 'info');

        const modifyResult = await fetch({
            url: CONFIG.endpoints.modifyTime,
            method: 'POST',
            headers: {
                'abtag': 'p0342'
            }
        }, body);

        log(`Skill4: API 返回 = ${JSON.stringify(modifyResult.data).substring(0, 500)}`, 'info');

        // 解析响应
        let success = false;
        let msg = '未知错误';

        try {
            const data = JSON.parse(modifyResult.data);
            success = data.success === true;
            msg = data.msg || '未知错误';
        } catch (e) {
            const statusMatch = String(modifyResult.data).match(/<status>(\d+)<\/status>/);
            const msgMatch = String(modifyResult.data).match(/<msg>([^<]*)<\/msg>/);
            success = statusMatch && statusMatch[1] === '200';
            msg = msgMatch ? msgMatch[1] : '未知错误';
        }

        if (success) {
            log(`Skill4: ✅ 修改预约时间成功！新时间=${dutyTime}`, 'success');
            return {
                success: true,
                new_appointment_time: dutyTime,
                operator: staffInfo.realName
            };
        } else {
            log(`Skill4: ❌ 修改预约时间失败: ${msg}`, 'error');
            return {
                success: false,
                fail_reason: msg
            };
        }
    } catch (e) {
        log(`Skill4: ❌ 执行异常: ${e.message}`, 'error');
        return {
            success: false,
            fail_reason: e.message
        };
    }
}

async function skill5_cancelWork(trackWorkId, servWorkId, cancelReason) {
    log(`═══════════════════════════════════════════════════════════`, 'info');
    log(`Skill5: 取消工单 - 输入: trackWorkId=${trackWorkId}, servWorkId=${servWorkId}, reason=${cancelReason}`, 'info');

    // 调用取消工单 API
    log(`Skill5: 调用取消工单 API...`, 'info');

    try {
        const cancelResult = await fetchWithRetry({
            url: CONFIG.endpoints.cancelWork,
            method: 'POST'
        }, {
            servWorkId: servWorkId,
            applySource: 11,
            reasonId: 217,
            cancelReason: cancelReason || '用户不需要服务'
        });

        log(`Skill5: API 返回 = ${JSON.stringify(cancelResult.data).substring(0, 500)}`, 'info');

        const cancelStatus = cancelResult.data?.AMISResponseDTO?.status || cancelResult.data?.status;
        const cancelMsg = cancelResult.data?.AMISResponseDTO?.msg || cancelResult.data?.msg || cancelResult.data?.message;

        // 检查是否是"接口不存在"错误 - 阻断执行
        if (cancelMsg?.includes('No endpoint') || cancelMsg?.includes('不存在')) {
            log(`Skill5: ❌ 取消工单接口不存在，阻断执行`, 'error');
            return {
                success: false,
                cancel_reason: cancelReason,
                result: 'api_not_available',
                fail_reason: `接口不存在：${cancelMsg}`
            };
        }

        // 检查是否是业务限制（如"请先联系工程师"）- 阻断执行
        if (cancelMsg?.includes('请先联系') || cancelMsg?.includes('联系工程师') || cancelMsg?.includes('联系用户')) {
            log(`Skill5: ❌ 业务限制：${cancelMsg}，阻断执行`, 'error');
            return {
                success: false,
                cancel_reason: cancelReason,
                result: 'blocked',
                fail_reason: cancelMsg
            };
        }

        if (cancelResult.status !== 200 || cancelStatus != 0) {
            log(`Skill5: ⚠️ 取消工单失败但继续: status=${cancelStatus}, msg=${cancelMsg}`, 'warning');
            return {
                success: true,
                cancel_reason: cancelReason,
                result: 'failed_but_continue',
                fail_reason: `${cancelMsg || 'HTTP ' + cancelResult.status}`
            };
        }

        log(`Skill5: ✅ 取消工单成功！工单ID=${servWorkId}`, 'success');
        return {
            success: true,
            cancel_reason: cancelReason,
            api_response: cancelResult.data
        };
    } catch (e) {
        log(`Skill5: ❌ 取消工单异常: ${e.message}，阻断执行`, 'error');
        return {
            success: false,
            cancel_reason: cancelReason,
            result: 'exception',
            reason: e.message
        };
    }
}

async function skill6_createFollowup(trackWorkId, servWorkId, intentName, intentResult, followupType, taskItemId = 1202) {
    log(`═══════════════════════════════════════════════════════════`, 'info');
    log(`Skill6: 生成跟单任务 - 输入: trackWorkId=${trackWorkId}, servWorkId=${servWorkId}, type=${followupType}, taskItemId=${taskItemId}`, 'info');

    try {
        // Step 1: 查询跟单详情获取完整数据
        log(`Skill6: Step1 查询跟单详情...`, 'info');
        const detailResult = await fetch({
            url: `https://test3-track.xiujiadian.com/amis/track/detail?trackWorkId=${trackWorkId}&workId=${servWorkId}`,
            method: 'GET'
        });

        const detailData = detailResult.data?.AMISResponseDTO || detailResult.data;
        const detailStatus = detailData?.status || detailResult.data?.status;

        let trackDetail = {
            trackWorkId: trackWorkId,
            workId: servWorkId,
            cityId: '',
            cityName: '',
            companyId: '',
            companyName: '',
            engineerId: '',
            engineerName: '',
            engineerPhone: ''
        };

        if (detailStatus === 0 || detailResult.status === 200) {
            // 从 XML 响应中提取详情
            const xmlStr = typeof detailResult.data === 'string' ? detailResult.data : JSON.stringify(detailResult.data);
            trackDetail = {
                trackWorkId: xmlStr.match(/<trackWorkId>([^<]+)<\/trackWorkId>/)?.[1] || trackWorkId,
                workId: xmlStr.match(/<workId>([^<]+)<\/workId>/)?.[1] || servWorkId,
                cityId: xmlStr.match(/<cityId>([^<]+)<\/cityId>/)?.[1] || '',
                cityName: xmlStr.match(/<cityName>([^<]+)<\/cityName>/)?.[1] || '',
                companyId: xmlStr.match(/<companyId>([^<]+)<\/companyId>/)?.[1] || '',
                companyName: xmlStr.match(/<companyName>([^<]+)<\/companyName>/)?.[1] || '',
                engineerId: xmlStr.match(/<engineerId>([^<]+)<\/engineerId>/)?.[1] || '',
                engineerName: xmlStr.match(/<engineerName>([^<]+)<\/engineerName>/)?.[1] || '',
                engineerPhone: xmlStr.match(/<engineerPhone>([^<]+)<\/engineerPhone>/)?.[1] || ''
            };
            log(`Skill6: 获取跟单详情成功: cityName=${trackDetail.cityName}, engineerName=${trackDetail.engineerName}`, 'info');
        } else {
            log(`Skill6: 获取跟单详情失败，使用默认值继续`, 'warning');
        }

        // Step 2: 构造创建跟单任务请求
        // 按 SKILL.md 强制规则:
        // - bizId = trackWorkId (跟单ID)
        // - bizSource = 40 (固定值)
        // - bizOrderType = 2 (固定值)
        // - bizOrderId = servWorkId (工单ID)
        const createBody = {
            taskItemId: taskItemId,
            bizId: parseInt(trackWorkId),           // 跟单ID
            bizSource: 40,                          // 固定值 40
            bizOrderType: 2,                        // 固定值 2
            bizOrderId: parseInt(servWorkId),       // 工单ID
            cityId: trackDetail.cityId ? parseInt(trackDetail.cityId) : 0,
            cityName: trackDetail.cityName,
            subCompanyId: trackDetail.companyId ? parseInt(trackDetail.companyId) : 0,
            subCompanyName: trackDetail.companyName,
            engineerId: trackDetail.engineerId ? parseInt(trackDetail.engineerId) : 0,
            engineerName: trackDetail.engineerName,
            userTelephone: trackDetail.engineerPhone,
            plat: 10
        };

        log(`Skill6: Step2 调用创建跟单任务 API...`, 'info');
        log(`Skill6: 请求参数: bizId=${createBody.bizId}, bizOrderId=${createBody.bizOrderId}, bizSource=${createBody.bizSource}`, 'info');

        const followupResult = await fetch({
            url: CONFIG.endpoints.createFollowup,
            method: 'POST'
        }, createBody);

        log(`Skill6: API 返回 = ${JSON.stringify(followupResult.data).substring(0, 500)}`, 'info');

        // 解析响应
        let success = false;
        let msg = '';
        let trackTaskId = null;

        if (typeof followupResult.data === 'object') {
            success = followupResult.data.success === true;
            msg = followupResult.data.msg || '';
            trackTaskId = followupResult.data.data;
        } else {
            // 尝试从 XML 或文本中提取
            const responseStr = String(followupResult.data);
            success = responseStr.includes('"success":true') || responseStr.includes('<success>true</success>');
            msg = responseStr.match(/<msg>([^<]+)<\/msg>/)?.[1] || responseStr.match(/"msg":"([^"]+)"/)?.[1] || '';
        }

        // 检查是否是"接口不存在"错误
        if (msg?.includes('No endpoint') || msg?.includes('不存在') || followupResult.status === 404) {
            log(`Skill6: ❌ 创建跟单接口不存在，阻断执行`, 'error');
            return {
                success: false,
                followup_task_type: followupType || '挂起跟单',
                result: 'api_not_available',
                reason: `接口不存在：${msg}`
            };
        }

        if (!success) {
            log(`Skill6: ❌ 创建跟单任务失败: msg=${msg}`, 'error');
            return {
                success: false,
                followup_task_type: followupType || '挂起跟单',
                result: 'failed',
                fail_reason: msg || '创建失败'
            };
        }

        log(`Skill6: ✅ 创建跟单任务成功！trackTaskId=${trackTaskId}`, 'success');
        return {
            success: true,
            followup_task_type: followupType || '挂起跟单',
            result: 'created',
            trackTaskId: trackTaskId,
            api_response: followupResult.data
        };
    } catch (e) {
        log(`Skill6: ❌ 创建跟单异常: ${e.message}，阻断执行`, 'error');
        return {
            success: false,
            followup_task_type: followupType || '挂起跟单',
            result: 'exception',
            reason: e.message
        };
    }
}

// ==================== 工作流主逻辑 ====================
// 使用 hangqi-workflow.js 的实现
async function runWorkflow(trackWorkId, taskItemId = '1202', env = 'test') {
    log('═══════════════════════════════════════════════════════════', 'system');
    log('🚀 挂起工作流 v9.0 开始执行 (hangqi-workflow)', 'system');
    log(`📋 跟单 ID: ${trackWorkId}`, 'system');

    // 如果 hangqi-workflow 可用，直接使用
    if (hangqiWorkflow && hangqiWorkflow.runWorkflow) {
        try {
            // 设置环境
            if (hangqiWorkflow.setGlobalEnv) {
                hangqiWorkflow.setGlobalEnv(env);
            }

            const result = await hangqiWorkflow.runWorkflow(trackWorkId, taskItemId, env);

            if (result.success) {
                log('✅ 工作流执行成功', 'system');
            } else {
                log(`❌ 工作流执行失败: ${result.fail_reason || '未知错误'}`, 'error');
            }

            return result;
        } catch (error) {
            log(`❌ 工作流异常: ${error.message}`, 'error');
            return {
                success: false,
                fail_at: 'hangqi-workflow',
                fail_reason: error.message,
                error: error.stack
            };
        }
    }

    // 如果加载失败，使用内置简化逻辑
    log('⚠️ hangqi-workflow.js 不可用，使用简化逻辑', 'warn');
    const steps = [];
    let currentStep = 0;

    try {
        // Step 1: 获取录音文本
        currentStep++;
        steps.push({ step: currentStep, name: 'Skill1: 获取录音文本', status: 'running' });
        const skill1Result = await skill1_getCallRecord(trackWorkId);

        if (!skill1Result.success) {
            steps[steps.length - 1] = { ...steps[steps.length - 1], status: 'failed', result: skill1Result };
            log(`❌ Skill1 失败：${skill1Result.fail_reason}`, 'error');
            return {
                success: false,
                fail_at: 'Skill1',
                fail_reason: skill1Result.fail_reason,
                steps
            };
        }

        steps[steps.length - 1] = { ...steps[steps.length - 1], status: 'completed', result: skill1Result };

        // Step 2: 识别意图
        currentStep++;
        steps.push({ step: currentStep, name: 'Skill2: 识别意图', status: 'running' });
        const skill2Result = await skill2_analyzeIntent(trackWorkId, skill1Result.servWorkId, skill1Result.voiceText);

        if (skill2Result.status === 'interrupted') {
            steps[steps.length - 1] = { ...steps[steps.length - 1], status: 'failed', result: skill2Result };
            log(`❌ Skill2 失败：${skill2Result.interrupt_reason}`, 'error');
            return {
                success: false,
                fail_at: 'Skill2',
                fail_reason: skill2Result.interrupt_reason,
                steps
            };
        }

        steps[steps.length - 1] = { ...steps[steps.length - 1], status: 'completed', result: skill2Result };

        const intentName = skill2Result.intent_name;
        log(`🎯 意图分类：${intentName}`, 'info');

        // Step 3: 根据意图执行
        if (intentName === '确认上门') {
            currentStep++;
            steps.push({ step: currentStep, name: 'Skill4: 改约', status: 'running' });
            const skill4Result = await skill4_modifyTime(trackWorkId, skill1Result.servWorkId);

            if (!skill4Result.success) {
                steps[steps.length - 1] = { ...steps[steps.length - 1], status: 'failed', result: skill4Result };
                log(`❌ Skill4 失败：${skill4Result.fail_reason}`, 'error');
            } else {
                steps[steps.length - 1] = { ...steps[steps.length - 1], status: 'completed', result: skill4Result };
            }

            return {
                success: skill4Result.success,
                intent: intentName,
                steps,
                final_result: skill4Result
            };
        } else if (intentName === '取消') {
            currentStep++;
            steps.push({ step: currentStep, name: 'Skill5: 取消工单', status: 'running' });
            const skill5Result = await skill5_cancelWork(trackWorkId, skill1Result.servWorkId);

            if (!skill5Result.success) {
                steps[steps.length - 1] = { ...steps[steps.length - 1], status: 'failed', result: skill5Result };
                log(`❌ Skill5 失败：${skill5Result.fail_reason}`, 'error');
            } else {
                steps[steps.length - 1] = { ...steps[steps.length - 1], status: 'completed', result: skill5Result };
            }

            return {
                success: skill5Result.success,
                intent: intentName,
                steps,
                final_result: skill5Result
            };
        } else {
            // 其他意图 - 创建跟单任务
            currentStep++;
            steps.push({ step: currentStep, name: 'Skill6: 生成跟单', status: 'running' });
            const skill6Result = await skill6_createFollowup(trackWorkId, skill1Result.servWorkId, '', '', '挂起跟单');

            if (!skill6Result.success) {
                steps[steps.length - 1] = { ...steps[steps.length - 1], status: 'failed', result: skill6Result };
                log(`❌ Skill6 失败：${skill6Result.fail_reason}`, 'error');
            } else {
                steps[steps.length - 1] = { ...steps[steps.length - 1], status: 'completed', result: skill6Result };
            }

            return {
                success: skill6Result.success,
                intent: intentName,
                steps,
                final_result: skill6Result
            };
        }

    } catch (error) {
        log(`❌ 工作流执行异常：${error.message}`, 'error');
        return {
            success: false,
            fail_at: `Step ${currentStep}`,
            fail_reason: error.message,
            steps,
            error: error.stack
        };
    }
}

// ==================== HTTP 服务器 ====================
const server = http.createServer(async (req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;
    
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }
    
    // 静态文件服务 - 提供 tasks.html
    if (pathname === '/tasks.html' && req.method === 'GET') {
        const fs = require('fs');
        const htmlPath = path.join(__dirname, '..', 'tasks.html');
        if (fs.existsSync(htmlPath)) {
            const content = fs.readFileSync(htmlPath, 'utf8');
            res.writeHead(200, { 'Content-Type': 'text/html;charset=utf-8' });
            res.end(content);
        } else {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not found');
        }
        return;
    }
    
    // 健康检查
    if (pathname === '/health' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
        return;
    }
    
    // 执行工作流
    if (pathname === '/execute' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const { trackWorkId, workId, env = 'test', taskItemId = '1202', useSandbox = true } = JSON.parse(body);

                if (!trackWorkId) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: '缺少 trackWorkId 参数' }));
                    return;
                }

                log(`📥 收到执行请求：trackWorkId=${trackWorkId}, env=${env}`, 'info');

                // 设置当前执行的 trackId 用于日志记录
                setCurrentTrackId(trackWorkId);

                // 更新数据库状态为执行中
                updateTaskStatus(trackWorkId, 'processing', '执行中');

                let sandboxId = null;
                let result;

                if (useSandbox) {
                    // ==================== 沙箱模式 ====================
                    // 1. 创建新沙箱
                    sandboxId = await SANDBOX.create(trackWorkId);
                    await SANDBOX.update(sandboxId, { status: 'executing' });

                    // 2. 添加启动记录
                    await SANDBOX.addHistory(sandboxId, {
                        type: 'workflow_start',
                        trackWorkId,
                        message: `开始执行工作流 ${sandboxId}`
                    });

                    try {
                        // 3. 执行工作流 - 传递环境参数
                        result = await runWorkflow(trackWorkId, taskItemId, env);

                        // 4. 添加完成记录
                        await SANDBOX.addHistory(sandboxId, {
                            type: 'workflow_complete',
                            trackWorkId,
                            success: result.success,
                            result: result
                        });

                        // 5. 存档
                        const archivePath = await SANDBOX.archive(sandboxId, result);
                        result.archivePath = archivePath;
                        result.sandboxId = sandboxId;

                        // 6. 更新状态并销毁沙箱
                        await SANDBOX.update(sandboxId, { status: 'completed' });

                    } catch (execError) {
                        // 执行异常处理
                        await SANDBOX.addHistory(sandboxId, {
                            type: 'workflow_error',
                            trackWorkId,
                            error: execError.message
                        });
                        await SANDBOX.archive(sandboxId, { error: execError.message });
                        throw execError;
                    } finally {
                        // 始终销毁沙箱
                        await SANDBOX.destroy(sandboxId);
                    }

                } else {
                    // ==================== 普通模式（无沙箱） ====================
                    result = await runWorkflow(trackWorkId);
                }

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(result));

                log(`📤 执行完成：success=${result.success}${sandboxId ? `, sandboxId=${sandboxId}` : ''}`, 'info');
                
                // 根据执行结果更新状态
                if (result.success) {
                    // 检查是否执行了 Skill6（创建跟单）
                    const steps = result.steps || [];
                    const skill6Steps = steps.filter(s => s.name && s.name.includes('Skill6'));
                    const hasSkill6 = skill6Steps.some(s => s.status === 'completed');
                    
                    if (hasSkill6) {
                        updateTaskStatus(trackWorkId, 'manual', '转人工');
                    } else {
                        updateTaskStatus(trackWorkId, 'completed', '已完成');
                    }
                } else {
                    updateTaskStatus(trackWorkId, 'error', '异常');
                }
                
                // 保存日志到数据库
                saveLogs();
                
                // 清除当前 trackId
                setCurrentTrackId(null);
                
            } catch (error) {
                console.error('❌ 执行异常:', error);
                
                // 更新状态为异常
                if (trackWorkId) {
                    updateTaskStatus(trackWorkId, 'error', '异常');
                    saveLogs();
                    setCurrentTrackId(null);
                }
                
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: error.message, stack: error.stack }));
            }
        });
        return;
    }

    // ==================== 沙箱管理接口 ====================

    // 沙箱列表
    if (pathname === '/sandbox/list' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            active: SANDBOX.list(),
            archiveDir: SANDBOX.archiveDir
        }));
        return;
    }

    // 查看存档
    if (pathname.startsWith('/archive/') && req.method === 'GET') {
        const archivePath = decodeURIComponent(pathname.split('/archive/')[1]);
        const fullPath = SANDBOX.archiveDir + '/' + archivePath;

        if (fs.existsSync(fullPath)) {
            const data = fs.readFileSync(fullPath, 'utf8');
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(data);
        } else {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Archive not found' }));
        }
        return;
    }

    // 存档列表
    if (pathname === '/archive/list' && req.method === 'GET') {
        const archives = [];
        if (fs.existsSync(SANDBOX.archiveDir)) {
            const dirs = fs.readdirSync(SANDBOX.archiveDir);
            for (const dir of dirs) {
                const dirPath = `${SANDBOX.archiveDir}/${dir}`;
                if (fs.statSync(dirPath).isDirectory()) {
                    const files = fs.readdirSync(dirPath);
                    for (const file of files) {
                        if (file.endsWith('.json')) {
                            const stats = fs.statSync(`${dirPath}/${file}`);
                            archives.push({
                                date: dir,
                                file,
                                path: `${dir}/${file}`,
                                size: stats.size,
                                modified: stats.mtime.toISOString()
                            });
                        }
                    }
                }
            }
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(archives.sort((a, b) => b.modified - a.modified)));
        return;
    }

    // 获取任务日志
    if (pathname === '/logs' && req.method === 'GET') {
        const urlParts = new URL(req.url, `http://${req.headers.host}`);
        const trackId = urlParts.searchParams.get('trackId');
        
        if (!trackId) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: '缺少 trackId 参数' }));
            return;
        }
        
        const logs = getTaskLogs(trackId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ trackId, logs }));
        return;
    }

    // 获取任务列表
    if (pathname === '/tasks' && req.method === 'GET') {
        const urlParts = new URL(req.url, `http://${req.headers.host}`);
        const status = urlParts.searchParams.get('status');
        const date = urlParts.searchParams.get('date');
        
        let sql = 'SELECT * FROM tasks WHERE 1=1';
        const params = [];
        
        if (status && status !== 'all') {
            sql += ' AND status = ?';
            params.push(status);
        }
        if (date) {
            sql += ' AND date = ?';
            params.push(date);
        }
        sql += ' ORDER BY create_time DESC';
        
        try {
            const stmt = db.prepare(sql);
            stmt.bind(params);
            const results = [];
            while (stmt.step()) {
                results.push(stmt.getAsObject());
            }
            stmt.free();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(results));
        } catch (e) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: e.message }));
        }
        return;
    }

    // 手动销毁沙箱
    if (pathname.startsWith('/sandbox/destroy/') && req.method === 'POST') {
        const sandboxId = pathname.split('/sandbox/destroy/')[1];
        await SANDBOX.destroy(sandboxId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, sandboxId }));
        return;
    }

    // 404
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not Found' }));
});

// ==================== 启动服务器 ====================
server.listen(CONFIG.port, () => {
    log('═══════════════════════════════════════════════════════════', 'system');
    log('🚀 挂起工作流 HTTP 服务已启动（沙箱模式）', 'system');
    log(`📍 监听端口：${CONFIG.port}`, 'info');
    log('📡 接口地址:', 'info');
    log(`   GET  /health - 健康检查`, 'info');
    log(`   POST /execute - 执行工作流（自动沙箱）`, 'info');
    log(`   GET  /sandbox/list - 查看活跃沙箱`, 'info');
    log(`   GET  /archive/list - 查看存档列表`, 'info');
    log(`   GET  /archive/{date}/{file} - 查看存档详情`, 'info');
    log(`   POST /sandbox/destroy/{id} - 手动销毁沙箱`, 'info');
    log('📝 执行示例:', 'info');
    log(`   # 沙箱模式（默认）`, 'info');
    log(`   curl -X POST http://localhost:${CONFIG.port}/execute \\`, 'info');
    log(`     -H "Content-Type: application/json" \\`, 'info');
    log(`     -d '{"trackWorkId": "1234567890"}'`, 'info');
    log(`   # 普通模式（无沙箱）`, 'info');
    log(`   curl -X POST http://localhost:${CONFIG.port}/execute \\`, 'info');
    log(`     -H "Content-Type: application/json" \\`, 'info');
    log(`     -d '{"trackWorkId": "1234567890", "useSandbox": false}'`, 'info');
    log('📦 存档目录:', 'info');
    log(`   ${SANDBOX.archiveDir}`, 'info');
    log('═══════════════════════════════════════════════════════════', 'system');
});
