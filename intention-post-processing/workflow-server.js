/**
 * 测试用工作流模拟服务器
 * 模拟openClaw Gateway的技能调用接口，用于本地测试
 */

const http = require('http');

const PORT = 3001;

// 模拟技能处理逻辑
const skillHandlers = {
  'handle-track-work': (params) => {
    console.log(`[模拟Skill] 跟单处理: ${params.trackId}, 分类: ${params.category}`);
    return {
      success: true,
      trackId: params.trackId,
      message: '公共处理完成：已驳回挂起申请，完结挂起跟单记录'
    };
  },
  'modify-duty-time': (params) => {
    const appointmentDate = new Date();
    appointmentDate.setDate(appointmentDate.getDate() + 2);
    const appointmentTime = `${appointmentDate.getFullYear()}-${String(appointmentDate.getMonth() + 1).padStart(2, '0')}-${String(appointmentDate.getDate()).padStart(2, '0')} 09:00:00`;
    console.log(`[模拟Skill] 工单改约: ${params.trackId}, 预约时间: ${appointmentTime}`);
    return {
      success: true,
      trackId: params.trackId,
      appointmentTime,
      message: '工单改约完成'
    };
  },
  'cancel-work': (params) => {
    console.log(`[模拟Skill] 工单取消: ${params.trackId}, 原因: 用户不需要了`);
    return {
      success: true,
      trackId: params.trackId,
      cancelReason: '用户不需要了',
      message: '工单取消完成'
    };
  },
  'create-track-task': (params) => {
    const newTrackId = `TRACK-${Date.now()}`;
    console.log(`[模拟Skill] 生成跟单任务: ${params.trackId}, 新跟单ID: ${newTrackId}`);
    return {
      success: true,
      trackId: params.trackId,
      newTrackId,
      message: '新跟单任务生成完成'
    };
  }
};

// 路由Skill逻辑
const routeSkill = (params) => {
  const { trackId, intentionContent } = params;
  const categoryMap = {
    'type1': '确认上门',
    'type2': '用户询价',
    'type3': '取消',
    'type4': '其他意图'
  };
  const category = categoryMap[intentionContent] || '其他意图';
  return { trackId, category, intentionContent };
};

// 全流程工作流处理
async function runWorkflow(params) {
  const { trackId, intentionContent } = params;
  const logs = [];
  const addLog = (msg) => {
    console.log(msg);
    logs.push(msg);
  };

  addLog('='.repeat(80));
  addLog('🚀 意图后处理工作流启动');
  addLog('='.repeat(80));
  addLog('【全局入参】');
  addLog(`跟单ID: ${trackId}`);
  addLog(`意图识别内容: ${intentionContent}`);
  addLog('');

  try {
    // 1. 路由结果
    addLog('【节点1】Skill0: 路由结果');
    addLog(`输入: ${JSON.stringify({ trackId, intentionContent }, null, 2)}`);
    const routeResult = routeSkill({ trackId, intentionContent });
    addLog(`输出: ${JSON.stringify(routeResult, null, 2)}`);
    addLog('');

    // 2. 跟单处理
    addLog('【节点2】Skill1: 跟单处理 (handle-track-work)');
    const trackHandleInput = { trackId, intentionContent, category: routeResult.category };
    addLog(`输入: ${JSON.stringify(trackHandleInput, null, 2)}`);
    const trackHandleResult = skillHandlers['handle-track-work'](trackHandleInput);
    addLog(`输出: ${JSON.stringify(trackHandleResult, null, 2)}`);
    addLog('');

    // 3. 分支处理
    addLog(`【分支判断】路由分类: ${routeResult.category}`);
    let businessResult = null;
    switch (routeResult.category) {
      case '确认上门':
        addLog('【节点3】Skill2: 工单改约 (modify-duty-time)');
        const modifyInput = { trackId, intentionContent };
        addLog(`输入: ${JSON.stringify(modifyInput, null, 2)}`);
        businessResult = skillHandlers['modify-duty-time'](modifyInput);
        addLog(`输出: ${JSON.stringify(businessResult, null, 2)}`);
        break;
      
      case '用户询价':
      case '取消':
        addLog('【节点3】Skill3: 工单取消 (cancel-work)');
        const cancelInput = { trackId, intentionContent };
        addLog(`输入: ${JSON.stringify(cancelInput, null, 2)}`);
        businessResult = skillHandlers['cancel-work'](cancelInput);
        addLog(`输出: ${JSON.stringify(businessResult, null, 2)}`);
        break;
      
      case '其他意图':
        addLog('【节点3】Skill4: 生成跟单任务 (create-track-task)');
        const createInput = { trackId, intentionContent };
        addLog(`输入: ${JSON.stringify(createInput, null, 2)}`);
        businessResult = skillHandlers['create-track-task'](createInput);
        addLog(`输出: ${JSON.stringify(businessResult, null, 2)}`);
        break;
      
      default:
        throw new Error(`未知路由分类: ${routeResult.category}`);
    }
    addLog('');

    addLog('='.repeat(80));
    addLog('✅ 工作流执行完成');
    addLog('='.repeat(80));

    return {
      success: true,
      logs,
      result: {
        trackId,
        category: routeResult.category,
        routeResult,
        trackHandleResult,
        businessResult
      }
    };

  } catch (error) {
    addLog('');
    addLog('='.repeat(80));
    addLog(`❌ 工作流执行失败: ${error.message}`);
    addLog('='.repeat(80));
    return {
      success: false,
      logs,
      error: error.message
    };
  }
}

const server = http.createServer(async (req, res) => {
  // 设置CORS头
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // 1. 工作流统一调用接口
  if (req.method === 'POST' && req.url === '/api/workflow/intention-post-processing') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        const params = JSON.parse(body);
        console.log(`\n[收到工作流调用] 参数:`, JSON.stringify(params, null, 2));
        const result = await runWorkflow(params);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: '参数解析失败' }));
      }
    });
    return;
  }

  // 2. 单独技能调用路径 /api/skills/{skillName}/invoke
  const match = req.url.match(/^\/api\/skills\/([^\/]+)\/invoke$/);
  if (req.method === 'POST' && match) {
    const skillName = match[1];
    let body = '';

    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', () => {
      try {
        const params = JSON.parse(body);
        console.log(`\n[收到调用] 技能: ${skillName}, 参数:`, JSON.stringify(params, null, 2));

        if (skillHandlers[skillName]) {
          const result = skillHandlers[skillName](params);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
        } else {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: `技能 ${skillName} 不存在` }));
        }
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: '参数解析失败' }));
      }
    });
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

server.listen(PORT, () => {
  console.log(`🚀 模拟工作流服务器已启动，监听端口 ${PORT}`);
  console.log(`✅ 已加载模拟技能: ${Object.keys(skillHandlers).join(', ')}`);
  console.log(`👉 现在可以运行测试命令: node index.js '{\"trackId\":\"127325663565551233\",\"intentionContent\":\"type1\"}'`);
});
