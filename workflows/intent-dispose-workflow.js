/**
 * 意图识别后处置工作流 (MVP)
 * 独立工作流，和hangqi-workflow无冲突
 * 用法: node intent-dispose-workflow.js <trackWorkId> [intentType] [taskItemId] [--sandbox]
 * 沙箱模式: node intent-dispose-workflow.js <trackWorkId> [intentType] [taskItemId] --sandbox
 */

const fs = require('fs');

// ==================== 配置 ====================
const GATEWAY_URL = 'http://localhost:18789';
const TOKEN = '64a4ffec94093067b0fb0927527cffdb3e4e51cd15a46083';
const SKILLS_DIR = 'C:/Users/admin/.openclaw/workspace/skills';

// ==================== 日志系统 ====================
const executionLogs = [];

function addLog(category, message, details = null) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    category,
    message,
    details
  };
  executionLogs.push(logEntry);
  
  const prefix = {
    info: 'ℹ️',
    success: '✅',
    error: '❌',
    warn: '⚠️',
    process: '🔄',
    request: '📤',
    response: '📥'
  }[category] || '📝';
  
  console.log(`${prefix} ${message}`);
  if (details) {
    console.log(`  详情: ${JSON.stringify(details, null, 2)}`);
  }
}

function printSummary(success, failAt, failReason, steps) {
  console.log('\n' + '='.repeat(60));
  console.log('📋 执行日志汇总');
  console.log('='.repeat(60));
  console.log(`▶ 任务ID: ${process.argv[2]}`);
  console.log(`▶ 执行结果: ${success ? '✅ 成功' : '❌ 失败'}`);
  if (!success) {
    console.log(`▶ 失败步骤: ${failAt}`);
    console.log(`▶ 失败原因: ${failReason}`);
  }
  
  console.log('\n📝 详细日志:');
  executionLogs.forEach((log, idx) => {
    const prefix = {
      info: 'ℹ️',
      success: '✅',
      error: '❌',
      warn: '⚠️',
      process: '🔄',
      request: '📤',
      response: '📥'
    }[log.category] || '📝';
    console.log(`  ${idx+1}. ${prefix} [${log.category.toUpperCase()}] ${log.message}`);
    if (log.details) {
      console.log(`      ${JSON.stringify(log.details)}`);
    }
  });

  console.log('\n📊 执行步骤:');
  steps.forEach(step => {
    const statusIcon = step.status === 'completed' ? '✅' : step.status === 'failed' ? '❌' : '🔄';
    console.log(`  ${statusIcon} Step ${step.step}: ${step.name} [${step.status}]`);
  });
  console.log('='.repeat(60) + '\n');
}

// ==================== 认证加载 ====================
async function loadAuthConfig(skillName) {
  const authPath = `${SKILLS_DIR}/${skillName}/.auth`;
  try {
    const authContent = fs.readFileSync(authPath, 'utf8');
    const authConfig = {};
    authContent.split('\n').forEach(line => {
      const idx = line.indexOf('=');
      if (idx > 0) authConfig[line.substring(0, idx).trim()] = line.substring(idx + 1).trim();
    });
    return authConfig;
  } catch (e) {
    addLog('error', `加载认证失败: ${authPath}`, { error: e.message });
    return null;
  }
}

// ==================== Skill0: 路由结果 ====================
// 路由映射表
const ROUTE_MAP = {
  'type1': '确认上门',
  'type2': '取消',
  'type3': '取消',
  'type4': '其他意图'
};

const INTENT_LABELS = {
  'type1': '确认上门',
  'type2': '用户询价',
  'type3': '取消',
  'type4': '其他意图'
};

async function skill0_routeResult(trackWorkId, intentType, taskItemId) {
  addLog('process', '开始执行 Skill0: 路由结果', { trackWorkId, intentType, taskItemId });

  // 参数校验
  if (!intentType) {
    throw new Error('缺少必填参数: intentType');
  }
  if (!ROUTE_MAP[intentType]) {
    throw new Error(`无效的intentType: ${intentType}，可选值: type1, type2, type3, type4`);
  }

  // 直接根据intentType做路由映射
  const routeResult = ROUTE_MAP[intentType];
  const intentLabel = INTENT_LABELS[intentType];

  // 仅查询工单号（后续处理需要）
  const authConfig = await loadAuthConfig('get-call-record');
  if (!authConfig) throw new Error('认证配置加载失败');

  const response = await fetch('https://test3-track.xiujiadian.com/amis/track/list', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + authConfig.AK
    },
    body: JSON.stringify({ trackWorkId })
  });

  const xmlText = await response.text();
  const workIdMatch = xmlText.match(/<workId>(\d+)<\/workId>/);
  const workId = workIdMatch ? workIdMatch[1] : null;

  addLog('info', `路由映射完成`, { intentType, intentLabel, routeResult, workId, taskItemId });

  const intentResult = {
    category: intentLabel,
    intent: routeResult === '确认上门' ? 'confirm_visit' : 
           routeResult === '取消' ? 'price_or_cancel' : 'other',
    confidence: 1.0
  };

  addLog('success', 'Skill0 完成', { 
    routeResult, 
    workId, 
    intent: intentResult.intent,
    intentType,
    taskItemId
  });

  return {
    trackWorkId,
    workId,
    routeResult,
    intentResult,
    intentType,
    taskItemId
  };
}

// ==================== Skill1: 跟单处理 ====================
async function skill1_handleTrack(trackWorkId, workId, intentResult) {
  addLog('process', '开始执行 Skill1: 跟单处理', { trackWorkId, workId, intent: intentResult.intent });

  const authConfig = await loadAuthConfig('handle-track-work');
  if (!authConfig) throw new Error('认证配置加载失败');

  const handleRemark = intentResult.category || 'AI自动处理';
  const body = {
    workId,
    trackWorkId,
    trackContentId: 1191,
    handleOptionList: [
      {
        optionId: 111,
        optionName: '挂起申请驳回',
        optionLevel: 0
      }
    ],
    handleJumpType: 0,
    handleRemark,
    isCompleteTrack: 2
  };

  addLog('request', '提交跟单处理', { url: 'https://test3-track.xiujiadian.com/amis/track/save/newHandle', body });
  const response = await fetch('https://test3-track.xiujiadian.com/amis/track/save/newHandle', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + authConfig.AK
    },
    body: JSON.stringify(body)
  });

  const xmlText = await response.text();
  addLog('response', '跟单处理响应', { xml: xmlText.substring(0, 500) });

  // 解析响应
  const statusMatch = xmlText.match(/<status>(\d+)<\/status>/);
  const msgMatch = xmlText.match(/<msg>([^<]*)<\/msg>/);
  const status = statusMatch ? statusMatch[1] : 'unknown';
  const msg = msgMatch ? msgMatch[1] : '未知响应';

  // status=100 表示跟单已完结，业务上不可再处理
  const isCompleted = status === '100';
  
  if (isCompleted) {
    addLog('warn', 'Skill1 警告: 跟单已完结，无法重复处理', { status, msg });
  } else if (status === '0') {
    addLog('success', 'Skill1 完成: 跟单处理成功', { status, msg });
  } else {
    addLog('error', 'Skill1 失败: ' + msg, { status });
  }

  return { success: !isCompleted, status, msg };
}

// ==================== Skill2: 工单改约 ====================
async function skill2_modifyDuty(trackWorkId, workId, intentResult) {
  addLog('process', '开始执行 Skill2: 工单改约', { trackWorkId, workId });

  // MVP规则：预约时间 = 当前日期+2天 09:00
  const now = new Date();
  now.setDate(now.getDate() + 2);
  now.setHours(9, 0, 0, 0);
  const appointmentTime = now.toISOString().replace('T', ' ').substring(0, 19);

  addLog('info', `改约规则: 预约时间 = ${appointmentTime}`);

  // 调用改约接口
  const authConfig = await loadAuthConfig('modify-duty-time');
  if (!authConfig) throw new Error('认证配置加载失败');

  const body = {
    servWorkId: workId,
    appointmentTime: appointmentTime,
    modifySource: 11
  };

  addLog('request', '提交工单改约', { url: 'https://test3-admin.xiujiadian.com/bfm-serv-work/serv/work/modifyAppointmentTime', body });

  // 调用真实改约接口
  const response = await fetch('https://test3-admin.xiujiadian.com/bfm-serv-work/serv/work/modifyAppointmentTime', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + authConfig.AK
    },
    body: JSON.stringify(body)
  });

  const resultText = await response.text();
  addLog('response', '改约响应', { result: resultText.substring(0, 500) });

  // 解析响应，检查是否成功
  let isSuccess = false;
  try {
    const data = JSON.parse(resultText);
    const status = data?.AMISResponseDTO?.status || data?.status;
    const msg = data?.AMISResponseDTO?.msg || data?.msg || data?.message;

    if (status == 0) {
      isSuccess = true;
      addLog('success', 'Skill2 完成: 工单已改约', { appointmentTime });
    } else {
      addLog('error', 'Skill2 失败: ' + msg, { response: data });
    }
  } catch (e) {
    if (resultText.includes('403') || resultText.includes('Forbidden')) {
      addLog('error', 'Skill2 失败: 权限不足', { response: resultText.substring(0, 200) });
    } else {
      addLog('error', 'Skill2 失败: ' + e.message, { response: resultText.substring(0, 200) });
    }
  }

  return { success: isSuccess, appointmentTime };
}

// ==================== Skill3: 工单取消 ====================
async function skill3_cancelWork(trackWorkId, workId, intentResult) {
  addLog('process', '开始执行 Skill3: 工单取消', { trackWorkId, workId });

  // MVP规则：取消原因固定为"用户不需要了"
  const cancelReason = '用户不需要了';
  addLog('info', `取消规则: 固定原因 "${cancelReason}"`);

  // 调用真实取消接口
  const authConfig = await loadAuthConfig('cancel-work');
  if (!authConfig) throw new Error('认证配置加载失败');

  const body = {
    servWorkId: workId,
    applySource: 11,
    reasonId: 217
  };

  addLog('request', '提交工单取消', { url: 'https://test3-admin.xiujiadian.com/bfm-serv-work/cancel/submitCancelApply', body });

  const response = await fetch('https://test3-admin.xiujiadian.com/bfm-serv-work/cancel/submitCancelApply', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + authConfig.AK
    },
    body: JSON.stringify(body)
  });

  const resultText = await response.text();
  addLog('response', '取消响应', { result: resultText.substring(0, 500) });

  // 解析响应
  let isSuccess = false;
  let msg = '未知响应';
  let status = 'unknown';
  try {
    const data = JSON.parse(resultText);
    msg = data.msg || data.message || '未知';
    status = data.status;
    if (data.status === 0 || data.success === true) {
      isSuccess = true;
    }
  } catch (e) {
    msg = resultText.substring(0, 100);
    status = 'parse_error';
  }

  if (isSuccess) {
    addLog('success', 'Skill3 完成: 工单已取消', { cancelReason });
  } else {
    addLog('error', 'Skill3 失败: ' + msg, { status, response: resultText.substring(0, 200) });
  }

  return { success: isSuccess, cancelReason, status, msg };
}

// ==================== Skill4: 生成跟单任务 ====================
async function skill4_createTrackTask(trackWorkId, workId, intentResult, taskItemId) {
  addLog('process', '开始执行 Skill4: 生成跟单任务', { trackWorkId, workId, taskItemId });

  // 传入的taskItemId作为bizId
  const bizId = taskItemId;

  // 调用真实创建跟单接口
  const authConfig = await loadAuthConfig('create-track-task');
  if (!authConfig) throw new Error('认证配置加载失败');

  const body = {
    workId,
    sourceTrackId: trackWorkId,
    bizId: bizId,
    taskItemId: bizId,
    bizSource: 11,
    content: `自动生成：${intentResult.category || '其他意图'}`,
    level: 2
  };

  addLog('request', '生成新跟单任务', { url: 'https://test-ais.xiujiadian.com/ratel-api/biz-twd/trackTaskModifyRemoteService/addTrackTask', body });

  const response = await fetch('https://test-ais.xiujiadian.com/ratel-api/biz-twd/trackTaskModifyRemoteService/addTrackTask', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + authConfig.AK
    },
    body: JSON.stringify(body)
  });

  const resultText = await response.text();
  addLog('response', '创建跟单响应', { result: resultText.substring(0, 500) });

  // 解析响应
  let isSuccess = false;
  let newTrackId = null;
  try {
    const data = JSON.parse(resultText);
    if (data.status === 0 || data.success === true) {
      isSuccess = true;
      newTrackId = data.data || data.trackId || 'T' + Date.now();
    } else {
      addLog('error', 'Skill4 失败: ' + (data.message || data.msg || '创建跟单失败'), { response: data });
    }
  } catch (e) {
    addLog('error', 'Skill4 失败: 响应解析失败', { response: resultText.substring(0, 200) });
  }

  if (isSuccess) {
    addLog('success', 'Skill4 完成: 新跟单已生成', { newTrackId });
  }

  return { success: isSuccess, newTrackId };
}

// ==================== 主流程 ====================
async function runWorkflow(trackWorkId, intentType, taskItemId, useSandbox = false) {
  addLog('info', `========== 意图识别后处置工作流开始 ==========`);
  addLog('info', `输入: trackWorkId=${trackWorkId}, intentType=${intentType}, taskItemId=${taskItemId}`);
  addLog('info', `沙箱模式: ${useSandbox ? '开启' : '关闭'}`);

  const steps = [];
  let currentStep = 0;
  let routeData = null;

  try {
    // Step 0: 路由结果
    currentStep++;
    steps.push({ step: currentStep, name: 'Skill0: 路由结果', status: 'running' });
    routeData = await skill0_routeResult(trackWorkId, intentType, taskItemId);
    steps[steps.length - 1] = { ...steps[steps.length - 1], status: 'completed', result: routeData };

    // Step 1: 跟单处理（所有分支公共节点）
    currentStep++;
    steps.push({ step: currentStep, name: 'Skill1: 跟单处理', status: 'running' });
    const handleResult = await skill1_handleTrack(trackWorkId, routeData.workId, routeData.intentResult);
    steps[steps.length - 1] = { ...steps[steps.length - 1], status: 'completed', result: handleResult };

    // 分支处理
    currentStep++;
    let branchResult = null;
    if (routeData.routeResult === '确认上门') {
      steps.push({ step: currentStep, name: 'Skill2: 工单改约', status: 'running' });
      branchResult = await skill2_modifyDuty(trackWorkId, routeData.workId, routeData.intentResult, routeData.taskItemId);
    } else if (routeData.routeResult === '取消') {
      steps.push({ step: currentStep, name: 'Skill3: 工单取消', status: 'running' });
      branchResult = await skill3_cancelWork(trackWorkId, routeData.workId, routeData.intentResult);
    } else {
      steps.push({ step: currentStep, name: 'Skill4: 生成跟单任务', status: 'running' });
      branchResult = await skill4_createTrackTask(trackWorkId, routeData.workId, routeData.intentResult, routeData.taskItemId);
    }
    steps[steps.length - 1] = { ...steps[steps.length - 1], status: 'completed', result: branchResult };

    // 执行成功（无论分支结果如何，整体流程完成）
    const overallSuccess = branchResult && branchResult.success !== false;
    printSummary(overallSuccess, null, null, steps);
    return {
      success: overallSuccess,
      routeResult: routeData.routeResult,
      workId: routeData.workId,
      intent: routeData.intentResult.intent,
      branchResult,
      steps
    };

  } catch (e) {
    // 执行失败
    const failAt = `Step ${currentStep}`;
    const failReason = e.message;
    printSummary(false, failAt, failReason, steps);
    return {
      success: false,
      fail_at: failAt,
      fail_reason: failReason,
      steps,
      error: e.stack
    };
  }
}

// ==================== 入口 ====================
// ==================== 入口 ====================
if (require.main === module) {
  // 解析参数
  const args = process.argv.slice(2);
  const sandboxIndex = args.indexOf('--sandbox');
  const useSandbox = sandboxIndex !== -1;

  // 移除 --sandbox 参数
  if (sandboxIndex !== -1) {
    args.splice(sandboxIndex, 1);
  }

  const trackWorkId = args[0];
  const intentType = args[1];
  const taskItemId = args[2];

  if (!trackWorkId) {
    console.log('用法: node intent-dispose-workflow.js <trackWorkId> [intentType] [taskItemId] [--sandbox]');
    console.log('示例: node intent-dispose-workflow.js 127325906441705088 type4 1202');
    console.log('intentType枚举: type1=确认上门, type2=用户询价, type3=取消, type4=其他意图');
    process.exit(1);
  }

  runWorkflow(trackWorkId, intentType, taskItemId).then(result => {
    console.log('========== 执行结果 ==========');
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.success ? 0 : 1);
  }).catch(e => {
    console.error('致命错误:', e);
    process.exit(1);
  });
}

module.exports = { runWorkflow };
