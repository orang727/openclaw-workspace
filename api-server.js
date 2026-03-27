const http = require('http');
const url = require('url');
const db = require('./db');
const https = require('https');

const PORT = 3001;

// 外部系统 API 配置
const EXTERNAL_API = {
    test: {
        baseUrl: 'https://test3-track.xiujiadian.com',
        ak: 'aikm_5b5f60ccf5c9457f83461d58'
    },
    prod: {
        baseUrl: 'https://ais.xiujiadian.com',
        path: '/zmn-track-admin/amis/track/list',
        ak: 'aikm_0e3de5bf7f5f4d09ab20ad97'
    }
};

// 启动数据库
async function startServer() {
    await db.initDB();
    
    const server = http.createServer(async (req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        
        if (req.method === 'OPTIONS') {
            res.writeHead(200);
            res.end();
            return;
        }
        
        const parsedUrl = url.parse(req.url, true);
        const pathname = parsedUrl.pathname;
        
        // 设置响应类型
        res.setHeader('Content-Type', 'application/json');
        
        try {
            // 获取任务列表
            if (pathname === '/api/tasks' && req.method === 'GET') {
                const { date, taskId, status, city, taskType } = parsedUrl.query;
                const tasks = db.getTasks({ date, taskId, status, city, taskType });
                res.writeHead(200);
                res.end(JSON.stringify({ code: 0, data: tasks }));
                return;
            }
            
            // 获取单个任务详情
            if (pathname.startsWith('/api/task/') && req.method === 'GET') {
                const trackId = pathname.split('/').pop();
                const task = db.getTaskById(trackId);
                const logs = db.getTaskLogs(trackId);
                res.writeHead(200);
                res.end(JSON.stringify({ code: 0, data: { task, logs } }));
                return;
            }
            
            // 获取数据监控统计
            if (pathname === '/api/stats' && req.method === 'GET') {
                const { date } = parsedUrl.query;
                let stats = db.getDailyStats(date);
                
                // 如果没有统计数据，重新计算
                if (!stats) {
                    stats = db.calcDailyStats(date);
                    db.updateDailyStats(date, stats);
                }
                
                res.writeHead(200);
                res.end(JSON.stringify({ code: 0, data: stats }));
                return;
            }
            
            // 更新任务状态
            if (pathname === '/api/task/status' && req.method === 'POST') {
                let body = '';
                req.on('data', chunk => body += chunk);
                req.on('end', async () => {
                    const { trackId, status, execStatus } = JSON.parse(body);
                    db.updateTaskStatus(trackId, status, execStatus);

                    // 如果状态变为执行中，触发工作流执行
                    if (status === 'processing') {
                        const task = db.getTaskById(trackId);
                        if (task) {
                            // 异步调用 workflow server 执行
                            callWorkflowServer(trackId, task).catch(err => {
                                console.error('工作流执行失败:', err);
                            });
                        }
                    }

                    res.writeHead(200);
                    res.end(JSON.stringify({ code: 0, message: '更新成功' }));
                });
                return;
            }

            // 执行工作流端点
            if (pathname === '/api/execute' && req.method === 'POST') {
                let body = '';
                req.on('data', chunk => body += chunk);
                req.on('end', async () => {
                    const { trackId } = JSON.parse(body);
                    const task = db.getTaskById(trackId);
                    if (!task) {
                        res.writeHead(200);
                        res.end(JSON.stringify({ code: 1, message: '任务不存在' }));
                        return;
                    }

                    // 先更新状态为处理中
                    db.updateTaskStatus(trackId, 'processing', '执行中');

                    try {
                        await callWorkflowServer(trackId, task);
                        res.writeHead(200);
                        res.end(JSON.stringify({ code: 0, message: '执行成功' }));
                    } catch (err) {
                        res.writeHead(200);
                        res.end(JSON.stringify({ code: 1, message: err.message }));
                    }
                });
                return;
            }
            
            // 插入日志
            if (pathname === '/api/task/log' && req.method === 'POST') {
                let body = '';
                req.on('data', chunk => body += chunk);
                req.on('end', () => {
                    const { taskId, content, level } = JSON.parse(body);
                    db.insertLog(taskId, content, level);
                    res.writeHead(200);
                    res.end(JSON.stringify({ code: 0, message: '日志添加成功' }));
                });
                return;
            }
            
            // 保存日志（批量）
            if (pathname === '/api/logs/save' && req.method === 'POST') {
                db.saveLogs();
                res.writeHead(200);
                res.end(JSON.stringify({ code: 0, message: '保存成功' }));
                return;
            }
            
            // 查询数据 - 调用外部系统 API
            if (pathname === '/api/query' && req.method === 'POST') {
                let body = '';
                req.on('data', chunk => body += chunk);
                req.on('end', async () => {
                    try {
                        const params = JSON.parse(body);
                        const { env, cityId, trackContentIdList, trackStatusListStr, code, trackTypeList, trackLevelList, startTime, endTime, pageSize, pageIndex } = params;
                        const apiEnv = env || 'test';
                        console.log('===== 查询请求 =====');
                        console.log('env:', apiEnv, '| cityId:', cityId, '| trackContentIdList:', trackContentIdList);
                        
                        // 格式化时间范围 - 带时分秒
                        const startDate = startTime.substring(0, 10);
                        const endDate = endTime.substring(0, 10);
                        const timeRange = `${startDate} 00:00:00,${endDate} 23:59:59`;
                        console.log('查询参数 - timeRange:', timeRange);
                        
                        // 构建请求体
                        const requestBody = {
                            trackContentIdList: trackContentIdList,
                            trackStatusListStr: trackStatusListStr,
                            createTime: timeRange,
                            pageIndex: pageIndex || 1,
                            pageSize: pageSize || 10
                        };
                        console.log('请求体:', JSON.stringify(requestBody));
                        
                        // 可选参数
                        if (code) requestBody.code = code;
                        if (trackTypeList) requestBody.trackTypeList = trackTypeList;
                        if (trackLevelList) requestBody.trackLevelList = trackLevelList;
                        // 新增城市ID列表参数（SKILL V2新增）
                        if (cityId) {
                            // 前端传的单个cityId转为数组格式
                            requestBody.cityIdList = [parseInt(cityId)];
                        }
                        
                        // 调用外部 API
                        const apiResult = await callExternalApi(requestBody, apiEnv);
                        
                        if (apiResult.success) {
                            res.writeHead(200);
                            res.end(JSON.stringify({ 
                                code: 0, 
                                data: { 
                                    items: apiResult.data,
                                    total: apiResult.total
                                } 
                            }));
                        } else {
                            res.writeHead(200);
                            res.end(JSON.stringify({ code: 500, message: apiResult.error }));
                        }
                    } catch (e) {
                        res.writeHead(200);
                        res.end(JSON.stringify({ code: 500, message: e.message }));
                    }
                });
                return;
            }
            
            // 数据同步 - 保存到本地数据库
            if (pathname === '/api/sync' && req.method === 'POST') {
                let body = '';
                req.on('data', chunk => body += chunk);
                req.on('end', async () => {
                    try {
                        const params = JSON.parse(body);
                        const { data, cityId, trackContentIdList } = params;
                        
                        console.log('同步参数 - data长度:', data ? data.length : 0);
                        
                        console.log('===== 同步请求 =====');
                        console.log('data长度:', data ? data.length : 0);
                        console.log('cityId:', cityId);
                        console.log('trackContentIdList:', trackContentIdList);
                        
                        if (!data || !Array.isArray(data)) {
                            res.writeHead(200);
                            res.end(JSON.stringify({ code: 400, message: '无效数据' }));
                            return;
                        }
                        
                        // 保存到本地数据库
                        let count = 0;
                        for (const item of data) {
                            try {
                                // 跳过无效数据
                                if (!item.trackWorkId) {
                                    console.log('[同步] 跳过无效数据，缺少trackWorkId:', JSON.stringify(item).substring(0, 200));
                                    continue;
                                }

                                // 解析日期格式 "03-25 12:55" 转换为 "2026-03-25"
                                let dateStr = '';
                                if (item.createTime && item.createTime.includes('-')) {
                                    const parts = item.createTime.split(' ');
                                    if (parts.length >= 1) {
                                        dateStr = '2026-' + parts[0]; // "2026-03-25"
                                    }
                                }

                                // 映射字段
                                const task = {
                                    track_id: String(item.trackWorkId),
                                    track_content_id: String(trackContentIdList ? trackContentIdList[0] : '1191'),
                                    task_type: '申请挂起',
                                    task_id: String(item.trackWorkId),
                                    city: cityId || '南昌',
                                    city_id: String(item.cityId || cityId || '南昌'),
                                    create_time: item.createTime,
                                    intent_content: item.intentContent || item.intentionContent || '',
                                    confidence: item.confidence || item.confidenceLevel || '',
                                    status: mapStatus(item.statusName),
                                    exec_status: item.statusName || '待处理',
                                    complete_time: '',
                                    mode: 'manual',
                                    date: dateStr,
                                    reason_name: item.reasonName || '',
                                    track_type_name: item.trackTypeName || '',
                                    track_level_name: item.trackLevelName || '',
                                    work_id: String(item.workId || ''),
                                    promoter: item.promoter || '',
                                    operate_remark: item.operateRemark || ''
                                };
                                db.insertTask(task);
                                count++;
                            } catch (e) {
                                console.error('[同步] 插入失败:', e.message, '数据:', JSON.stringify(item).substring(0, 200));
                            }
                        }
                        
                        res.writeHead(200);
                        res.end(JSON.stringify({ code: 0, message: '同步成功', data: { count } }));
                    } catch (e) {
                        res.writeHead(200);
                        res.end(JSON.stringify({ code: 500, message: e.message }));
                    }
                });
                return;
            }
            
            // 获取城市列表
            if (pathname === '/api/cities' && req.method === 'GET') {
                // 硬编码返回常用城市列表，避免数据库编码问题
                const cities = [
                    {city_name: '北京', city_id: '110000'},
                    {city_name: '上海', city_id: '310000'},
                    {city_name: '广州', city_id: '440100'},
                    {city_name: '深圳', city_id: '440300'},
                    {city_name: '杭州', city_id: '330100'},
                    {city_name: '成都', city_id: '510100'},
                    {city_name: '武汉', city_id: '420100'},
                    {city_name: '南京', city_id: '320100'},
                    {city_name: '西安', city_id: '610100'},
                    {city_name: '重庆', city_id: '500000'},
                    {city_name: '南昌', city_id: '360100'},
                    {city_name: '天津', city_id: '120000'},
                    {city_name: '苏州', city_id: '320500'},
                    {city_name: '郑州', city_id: '410100'},
                    {city_name: '长沙', city_id: '430100'},
                    {city_name: '沈阳', city_id: '210100'},
                    {city_name: '青岛', city_id: '370200'},
                    {city_name: '厦门', city_id: '350200'},
                    {city_name: '福州', city_id: '350100'},
                    {city_name: '东莞', city_id: '441900'}
                ];
                res.writeHead(200);
                res.end(JSON.stringify({ code: 0, data: cities }));
                return;
            }

            // ==================== 批量执行API ====================

            // 预览待处理任务数量
            if (pathname === '/api/batch/preview' && req.method === 'GET') {
                handleBatchPreview(res);
                return;
            }

            // 开始批量执行
            if (pathname === '/api/batch/start' && req.method === 'POST') {
                let body = '';
                req.on('data', chunk => body += chunk);
                req.on('end', () => {
                    const params = body ? JSON.parse(body) : {};
                    handleBatchStart(res, params.taskIds);
                });
                return;
            }

            // 获取批次状态
            if (pathname === '/api/batch/status' && req.method === 'GET') {
                handleBatchStatus(res);
                return;
            }

            // 暂停批量执行
            if (pathname === '/api/batch/pause' && req.method === 'POST') {
                handleBatchPause(res);
                return;
            }

            // 恢复批量执行
            if (pathname === '/api/batch/resume' && req.method === 'POST') {
                handleBatchResume(res);
                return;
            }

            // 停止批量执行
            if (pathname === '/api/batch/stop' && req.method === 'POST') {
                handleBatchStop(res);
                return;
            }

            // 404
            res.writeHead(404);
            res.end(JSON.stringify({ code: 404, message: 'Not Found' }));
            
        } catch (err) {
            console.error(err);
            res.writeHead(500);
            res.end(JSON.stringify({ code: 500, message: err.message }));
        }
    });
    
    server.listen(PORT, () => {
        console.log(`🚀 API 服务已启动: http://localhost:${PORT}`);
    });
}

// 调用外部跟单系统 API
function callExternalApi(requestBody, env = 'test') {
    const apiConfig = EXTERNAL_API[env] || EXTERNAL_API.test;
    return new Promise((resolve) => {
        const data = JSON.stringify(requestBody);
        
        // 生产环境使用配置的path，测试环境使用默认path
        const apiPath = apiConfig.path || '/amis/track/list';
        
        const options = {
            hostname: apiConfig.baseUrl.replace(/^https?:\/\//, ''),
            path: apiPath,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Authorization': 'Bearer ' + apiConfig.ak
            }
        };
        
        console.log('外部API请求 - env:', env, '| hostname:', options.hostname, '| path:', options.path);
        
        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                console.log('外部API响应 - env:', env, '| status:', res.statusCode, '| body长度:', body.length);
                console.log('外部API响应内容:', body.substring(0, 200));
                try {
                    const result = JSON.parse(body);
                    if (result.status === 0 && result.data) {
                        resolve({
                            success: true,
                            data: result.data.items || [],
                            total: result.data.total || 0
                        });
                    } else {
                        resolve({
                            success: false,
                            error: result.msg || '接口返回失败'
                        });
                    }
                } catch (e) {
                    resolve({
                        success: false,
                        error: '解析响应失败: ' + e.message
                    });
                }
            });
        });
        
        req.on('error', (e) => {
            resolve({
                success: false,
                error: e.message
            });
        });
        
        req.write(data);
        req.end();
    });
}

// 映射外部状态到本地状态
function mapStatus(statusName) {
    if (!statusName) return 'pending';
    if (statusName.includes('待处理')) return 'pending';
    if (statusName.includes('处理中')) return 'processing';
    if (statusName.includes('完结') || statusName.includes('完成') || statusName.includes('已完成')) return 'completed';
    return 'pending';
}

// 调用 workflow server 执行工作流
function formatDate(d) {
    return d.getFullYear() + '-' + 
        String(d.getMonth()+1).padStart(2,'0') + '-' + 
        String(d.getDate()).padStart(2,'0') + ' ' + 
        String(d.getHours()).padStart(2,'0') + ':' + 
        String(d.getMinutes()).padStart(2,'0') + ':' + 
        String(d.getSeconds()).padStart(2,'0');
}

async function callWorkflowServer(trackId, task) {
    return new Promise((resolve, reject) => {
        const postData = JSON.stringify({
            trackWorkId: trackId,
            workId: task.work_id || '',
            env: 'prod',
            taskItemId: task.track_content_id || '1202'
        });

        const options = {
            hostname: 'localhost',
            port: 3000,
            path: '/execute',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        console.log('===== 开始执行工作流 =====');
        console.log('trackId:', trackId, '| workId:', task.work_id);

        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                console.log('工作流响应:', body.substring(0, 1000));
                try {
                    const result = JSON.parse(body);
                    // 保存工作流日志到数据库
                    if (result.logs && result.logs.length > 0) {
                        result.logs.forEach(log => {
                            const level = log.category === 'ERROR' ? 'error' :
                                         log.category === 'WARN' ? 'warn' : 'info';
                            db.insertLog(trackId, `[${log.timestamp}] ${log.category}: ${log.message}`, level);
                        });
                    }
                    // 保存步骤结果，生成完整执行动作序列
                    let lastStepName = '';
                    let execActionSteps = '';
                    if (result.steps) {
                        const stepParts = [];
                        result.steps.forEach(step => {
                            const stepLog = `Step ${step.step}: ${step.name} [${step.status}]`;
                            db.insertLog(trackId, stepLog, step.status === 'failed' ? 'error' : 'info');
                            lastStepName = step.name;
                            stepParts.push(stepLog);
                        });
                        execActionSteps = stepParts.join('→');
                    }

                    // 获取最后一条日志作为执行结果
                    const logs = db.getTaskLogs(trackId);
                    const lastLog = logs.length > 0 ? logs[logs.length - 1].log_content : '';

                    // 从 steps 中提取 Skill2 的结果
                    let intentContent = result.intent || '';  // intent_name (意图分类)
                    let intentCategory = '';
                    if (result.steps) {
                        const skill2Step = result.steps.find(s => s.name && s.name.includes('Skill2'));
                        if (skill2Step && skill2Step.result) {
                            intentContent = skill2Step.result.intent_name || intentContent;
                            intentCategory = skill2Step.result.category || '';
                        }
                    }

                    if (result.success) {
                        db.insertLog(trackId, `[${formatDate(new Date())}] 执行成功: ${intentContent || '完成'}`, 'info');
                        db.updateTaskStatus(trackId, 'completed', '已完成', execActionSteps, '', intentContent, intentCategory);
                        resolve(result);
                    } else {
                        db.insertLog(trackId, `[${formatDate(new Date())}] 执行失败: ${result.fail_reason || '未知错误'}`, 'error');
                        db.updateTaskStatus(trackId, 'error', '执行失败', execActionSteps, '', intentContent, intentCategory);
                        reject(new Error(result.fail_reason || '执行失败'));
                    }
                } catch (e) {
                    db.insertLog(trackId, `[${formatDate(new Date())}] 响应解析失败: ${e.message}`, 'error');
                    reject(e);
                }
            });
        });

        req.on('error', (e) => {
            console.error('工作流请求失败:', e);
            db.insertLog(trackId, `[${formatDate(new Date())}] 连接失败: ${e.message}`, 'error');
            db.updateTaskStatus(trackId, 'error', '连接失败', '', `连接失败: ${e.message}`);
            reject(e);
        });

        req.write(postData);
        req.end();
    });
}

// ==================== 批量自动执行 ====================

// 配置参数
const BATCH_CONFIG = {
    batchSize: 100,           // 每批数量
    batchInterval: 10000,     // 批次间隔（毫秒）
    taskTimeout: 1200000,     // 单任务超时（20分钟）
    maxRetries: 2             // 失败重试次数
};

// 全局批量执行状态
let batchState = {
    isRunning: false,
    isPaused: false,
    shouldStop: false,
    currentBatchId: null,
    completedCount: 0,
    failedCount: 0,
    currentTaskIndex: 0,
    totalCount: 0,
    taskQueue: [],
    intervalId: null
};

// 生成批次ID
function generateBatchId() {
    return `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// 包装函数：获取任务信息并调用工作流
async function executeWorkflow(trackId, task) {
    // 如果没有传入 task，从数据库获取
    if (!task) {
        task = db.getTaskById(trackId);
    }
    return callWorkflowServer(trackId, task);
}

// 执行单个任务（带重试）
async function executeTaskWithRetry(trackId, retries = 0) {
    return new Promise((resolve, reject) => {
        // 设置超时
        const timeout = setTimeout(() => {
            reject(new Error('任务执行超时'));
        }, BATCH_CONFIG.taskTimeout);

        executeWorkflow(trackId)
            .then(result => {
                clearTimeout(timeout);
                resolve(result);
            })
            .catch(error => {
                clearTimeout(timeout);
                if (retries < BATCH_CONFIG.maxRetries) {
                    console.log(`[批量执行] 任务 ${trackId} 失败，${retries + 1}/${BATCH_CONFIG.maxRetries} 次重试...`);
                    db.insertLog(trackId, `[批量执行] 重试 ${retries + 1}/${BATCH_CONFIG.maxRetries}: ${error.message}`, 'warn');
                    // 等待3秒后重试
                    setTimeout(() => {
                        executeTaskWithRetry(trackId, retries + 1).then(resolve).catch(reject);
                    }, 3000);
                } else {
                    reject(error);
                }
            });
    });
}

// 批量执行主循环
async function runBatchExecution() {
    while (!batchState.shouldStop) {
        // 检查是否暂停
        if (batchState.isPaused) {
            await sleep(1000);
            continue;
        }

        // 检查是否还有待执行任务
        if (batchState.currentTaskIndex >= batchState.taskQueue.length) {
            // 所有任务执行完成
            batchState.isRunning = false;
            batchState.shouldStop = true;
            db.updateBatchStatus(batchState.currentBatchId, 'completed');
            console.log(`[批量执行] 批次 ${batchState.currentBatchId} 执行完成！成功: ${batchState.completedCount}, 失败: ${batchState.failedCount}`);
            break;
        }

        // 取出一个任务
        const trackId = batchState.taskQueue[batchState.currentTaskIndex];
        batchState.currentTaskIndex++;

        // 更新任务状态为处理中
        db.updateTaskStatus(trackId, 'processing', '处理中');
        db.insertLog(trackId, `[批量执行] 开始执行 (第${batchState.currentTaskIndex}/${batchState.totalCount}批)`, 'info');

        try {
            await executeTaskWithRetry(trackId);
            batchState.completedCount++;
            console.log(`[批量执行] ✅ ${trackId} (${batchState.currentTaskIndex}/${batchState.totalCount})`);
        } catch (error) {
            batchState.failedCount++;
            console.log(`[批量执行] ❌ ${trackId} (${batchState.currentTaskIndex}/${batchState.totalCount}): ${error.message}`);
        }

        // 更新批次进度
        db.updateBatchProgress(
            batchState.currentBatchId,
            batchState.currentTaskIndex,
            batchState.completedCount,
            batchState.failedCount
        );

        // 更新剩余任务列表
        const remainingTasks = batchState.taskQueue.slice(batchState.currentTaskIndex);
        db.updateBatchTaskIds(batchState.currentBatchId, remainingTasks);

        // 批次间隔
        if (batchState.currentTaskIndex % BATCH_CONFIG.batchSize === 0) {
            console.log(`[批量执行] 已完成 ${batchState.currentTaskIndex}/${batchState.totalCount}，等待 ${BATCH_CONFIG.batchInterval / 1000}秒...`);
            await sleep(BATCH_CONFIG.batchInterval);
        }
    }

    batchState.isRunning = false;
    batchState.shouldStop = false;
}

// 辅助函数：睡眠
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// API: 获取待处理任务数量
function handleBatchPreview(res) {
    const pendingTasks = db.getTasks({ status: 'pending' });
    const totalCount = pendingTasks.length;
    // 按发起时间正序
    const sortedTasks = pendingTasks.sort((a, b) => {
        const timeA = new Date('2026-' + a.create_time);
        const timeB = new Date('2026-' + b.create_time);
        return timeA - timeB;
    });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
        code: 0,
        data: {
            total_count: totalCount,
            batch_count: Math.ceil(totalCount / BATCH_CONFIG.batchSize),
            estimated_time: `${Math.round(totalCount * 20 / 60)} 分钟`,
            first_batch_preview: sortedTasks.slice(0, 5).map(t => ({
                track_id: t.track_id,
                create_time: t.create_time
            }))
        }
    }));
}

// API: 开始批量执行
function handleBatchStart(res, specifiedTaskIds = null) {
    // 检查是否已有批次在运行
    const activeBatch = db.getActiveBatch();
    if (activeBatch) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            code: 400,
            message: '已有批次在执行中，请先停止或等待完成'
        }));
        return;
    }

    let taskIds;

    if (specifiedTaskIds && specifiedTaskIds.length > 0) {
        // 使用指定的任务ID列表
        taskIds = specifiedTaskIds;
        console.log(`[批量执行] 使用指定任务列表，共 ${taskIds.length} 个`);
    } else {
        // 获取所有待处理任务
        const pendingTasks = db.getTasks({ status: 'pending' });
        if (pendingTasks.length === 0) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                code: 400,
                message: '没有待处理的任务'
            }));
            return;
        }

        // 按发起时间正序
        pendingTasks.sort((a, b) => {
            const timeA = new Date('2026-' + a.create_time);
            const timeB = new Date('2026-' + b.create_time);
            return timeA - timeB;
        });

        taskIds = pendingTasks.map(t => t.track_id);
    }

    // 生成批次ID
    const batchId = generateBatchId();

    // 创建批次记录
    db.createBatch(batchId, taskIds);

    // 初始化批量执行状态
    batchState = {
        isRunning: true,
        isPaused: false,
        shouldStop: false,
        currentBatchId: batchId,
        completedCount: 0,
        failedCount: 0,
        currentTaskIndex: 0,
        totalCount: taskIds.length,
        taskQueue: taskIds
    };

    console.log(`[批量执行] 批次 ${batchId} 开始，共 ${taskIds.length} 个任务`);

    // 启动后台执行
    runBatchExecution().catch(err => {
        console.error('[批量执行] 执行出错:', err);
        batchState.isRunning = false;
        db.updateBatchStatus(batchId, 'stopped');
    });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
        code: 0,
        data: {
            batch_id: batchId,
            total_count: taskIds.length,
            message: '批量执行已开始'
        }
    }));
}

// API: 获取批次状态
function handleBatchStatus(res) {
    const activeBatch = db.getActiveBatch();

    if (!activeBatch) {
        // 检查最近完成的批次
        const stmt = db.getDB().prepare(`
            SELECT * FROM batch_progress
            WHERE status IN ('completed', 'stopped')
            ORDER BY finished_at DESC LIMIT 1
        `);
        let lastBatch = null;
        if (stmt.step()) {
            lastBatch = stmt.getAsObject();
            if (lastBatch.task_ids) {
                try {
                    lastBatch.task_ids = JSON.parse(lastBatch.task_ids);
                } catch (e) {
                    lastBatch.task_ids = [];
                }
            }
        }
        stmt.free();

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            code: 0,
            data: {
                is_running: false,
                last_batch: lastBatch
            }
        }));
        return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
        code: 0,
        data: {
            is_running: true,
            is_paused: batchState.isPaused,
            batch_id: activeBatch.batch_id,
            total_count: activeBatch.total_count,
            completed_count: batchState.completedCount,
            failed_count: batchState.failedCount,
            current_index: batchState.currentTaskIndex,
            current_task_id: batchState.taskQueue[batchState.currentTaskIndex] || null,
            status: activeBatch.status,
            progress_percent: activeBatch.total_count > 0
                ? ((batchState.currentTaskIndex / activeBatch.total_count) * 100).toFixed(1)
                : 0
        }
    }));
}

// API: 暂停批量执行
function handleBatchPause(res) {
    const activeBatch = db.getActiveBatch();
    if (!activeBatch) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            code: 400,
            message: '没有正在执行的批次'
        }));
        return;
    }

    batchState.isPaused = true;
    db.updateBatchStatus(activeBatch.batch_id, 'paused');
    console.log(`[批量执行] 批次 ${activeBatch.batch_id} 已暂停`);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
        code: 0,
        message: '已暂停'
    }));
}

// API: 恢复批量执行
function handleBatchResume(res) {
    const activeBatch = db.getActiveBatch();
    if (!activeBatch) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            code: 400,
            message: '没有正在执行的批次'
        }));
        return;
    }

    if (activeBatch.status !== 'paused') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            code: 400,
            message: '当前批次未处于暂停状态'
        }));
        return;
    }

    batchState.isPaused = false;
    db.updateBatchStatus(activeBatch.batch_id, 'running');
    console.log(`[批量执行] 批次 ${activeBatch.batch_id} 已恢复`);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
        code: 0,
        message: '已恢复'
    }));
}

// API: 停止批量执行
function handleBatchStop(res) {
    const activeBatch = db.getActiveBatch();
    if (!activeBatch) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            code: 400,
            message: '没有正在执行的批次'
        }));
        return;
    }

    batchState.shouldStop = true;
    batchState.isPaused = false;
    db.updateBatchStatus(activeBatch.batch_id, 'stopped');
    console.log(`[批量执行] 批次 ${activeBatch.batch_id} 已停止`);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
        code: 0,
        message: '已停止',
        data: {
            completed_count: batchState.completedCount,
            failed_count: batchState.failedCount
        }
    }));
}

startServer().catch(console.error);
