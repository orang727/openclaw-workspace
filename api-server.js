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
                                console.error('插入失败:', e.message);
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
                    // 保存步骤结果
                    if (result.steps) {
                        result.steps.forEach(step => {
                            const stepLog = `Step ${step.step}: ${step.name} [${step.status}]`;
                            db.insertLog(trackId, stepLog, step.status === 'failed' ? 'error' : 'info');
                        });
                    }

                    if (result.success) {
                        db.insertLog(trackId, `[${formatDate(new Date())}] 执行成功: ${result.intent || '完成'}`, 'info');
                        db.updateTaskStatus(trackId, 'completed', '已完成');
                        resolve(result);
                    } else {
                        db.insertLog(trackId, `[${formatDate(new Date())}] 执行失败: ${result.fail_reason || '未知错误'}`, 'error');
                        db.updateTaskStatus(trackId, 'error', '执行失败');
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
            db.updateTaskStatus(trackId, 'error', '连接失败');
            reject(e);
        });

        req.write(postData);
        req.end();
    });
}

startServer().catch(console.error);
