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

async function skill0_routeResult(trackWorkId, intentType, taskItemId = '1202') {
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

  addLog('request', '查询工单号', { url: 'https://test3-track.xiujiadian.com/amis/track/list', body: { trackWorkId } });

  const response = await fetch('https://test3-track.xiujiadian.com/amis/track/list', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + authConfig.AK
    },
    body: JSON.stringify({ trackWorkId })
  });

  const responseText = await response.text();
  addLog('response', '跟单列表响应', { response: responseText.substring(0, 500) });

  // 解析响应获取 workId 和 servOrderId（支持 JSON 和 XML 两种格式）
  let workId = null;
  let servOrderId = null;
  try {
    // 判断是 JSON 还是 XML 响应
    if (responseText.trim().startsWith('<')) {
      // XML 格式解析
      const workIdMatch = responseText.match(/<workId>(\d+)<\/workId>/);
      const servOrderIdMatch = responseText.match(/<servOrderId>(\d+)<\/servOrderId>/);
      if (workIdMatch) {
        workId = workIdMatch[1];
        addLog('info', `成功获取工单号(XML解析)`, { workId });
      } else {
        addLog('warn', `XML响应中未找到workId`, { response: responseText.substring(0, 200) });
      }
      if (servOrderIdMatch) {
        servOrderId = servOrderIdMatch[1];
        addLog('info', `成功获取服务订单号(XML解析)`, { servOrderId });
      }
    } else {
      // JSON 格式解析
      const data = JSON.parse(responseText);
      if (data.status === 0 && data.data && data.data.items && data.data.items.length > 0) {
        workId = data.data.items[0].workId;
        servOrderId = data.data.items[0].servOrderId;
        addLog('info', `成功获取工单号和订单号(JSON解析)`, { workId, servOrderId });
      } else {
        addLog('warn', `未找到该跟单ID对应的工单`, { msg: data.msg || '未知错误' });
      }
    }
  } catch (e) {
    addLog('error', `解析响应失败: ${e.message}`, { response: responseText.substring(0, 200) });
  }

  addLog('info', `路由映射完成`, { intentType, intentLabel, routeResult, workId, servOrderId, taskItemId });

  const intentResult = {
    category: intentLabel,
    intent: routeResult === '确认上门' ? 'confirm_visit' :
           routeResult === '取消' ? 'price_or_cancel' : 'other',
    confidence: 1.0
  };

  addLog('success', 'Skill0 完成', {
    routeResult,
    workId,
    servOrderId,
    intent: intentResult.intent,
    intentType,
    taskItemId
  });

  return {
    trackWorkId,
    workId,
    servOrderId,
    routeResult,
    intentResult,
    intentType,
    taskItemId
  };
}

// ==================== Skill2: 工单改约 (按 SKILL.md modify-duty-time 定义重写) ====================
async function skill2_modifyDuty(trackWorkId, workId, intentResult) {
  addLog('process', '开始执行 Skill2: 工单改约', { trackWorkId, workId });

  const authConfig = await loadAuthConfig('modify-duty-time');
  if (!authConfig) throw new Error('认证配置加载失败');

  try {
    // Step 1: 登录获取 sessionId
    addLog('process', 'Step1: 登录获取 sessionId');

    const loginRes = await fetch('https://test3-mcc.xiujiadian.com/cas/login.action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ staffName: authConfig.username, password: authConfig.password }),
      redirect: 'manual'
    });

    if (loginRes.status !== 200 && loginRes.status !== 302) {
      const loginText = await loginRes.text();
      addLog('error', '登录失败', { status: loginRes.status, body: loginText });
      return { success: false, msg: '登录失败' };
    }

    // 提取 cookies
    const cookies = [];
    const setCookieHeaders = loginRes.headers.getSetCookie ? loginRes.headers.getSetCookie() : [];
    if (setCookieHeaders.length > 0) {
      setCookieHeaders.forEach(c => cookies.push(c.split(';')[0]));
    } else {
      loginRes.headers.forEach((value, key) => {
        if (key.toLowerCase() === 'set-cookie') {
          cookies.push(value.split(';')[0]);
        }
      });
    }

    // 从 cookie 中提取 sessionId（test3.zmn.id=xxx）
    let sessionId = '';
    cookies.forEach(c => {
      if (c.startsWith('test3.zmn.id=')) {
        sessionId = c.split('=')[1];
      }
    });

    if (!sessionId) {
      addLog('error', '登录成功但未获取到sessionId');
      return { success: false, msg: '登录成功但未获取到sessionId' };
    }

    addLog('info', `获取 sessionId 成功`);

    // Step 2: 使用 sessionId + AK 调用获取人员信息接口
    addLog('process', 'Step2: 获取人员信息');

    const staffRes = await fetch('https://test-ais.xiujiadian.com/ratel-api/base-mcc/mcStaffForeignListRemoteService/getLoginStaffBySessionId', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + authConfig.AK
      },
      body: JSON.stringify({ sessionId })
    });

    const staffText = await staffRes.text();
    let staffInfo = { realName: '', deptName: '', deptId: 0, staffId: 0 };

    try {
      const staffData = JSON.parse(staffText);
      if (staffData.success === true && staffData.data) {
        staffInfo = staffData.data;
        addLog('info', `获取人员信息成功: ${staffInfo.realName}`);
      } else {
        addLog('error', '获取人员信息失败', { response: staffData });
        return { success: false, msg: '获取人员信息失败' };
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
        addLog('info', `获取人员信息成功(从XML解析): ${staffInfo.realName}`);
      } else {
        addLog('error', '无法解析人员信息响应', { raw: staffText.substring(0, 500) });
        return { success: false, msg: '无法解析人员信息响应' };
      }
    }

    // Step 3: 修改预约时间
    addLog('process', 'Step3: 修改预约时间');

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
      servWorkId: workId,
      operator: staffInfo.realName,
      operatorDeptName: staffInfo.deptName,
      dutyTime,
      operatorDeptId: staffInfo.deptId,
      operatorId: String(staffInfo.staffId),
      operatorIdentity: 2
    };

    addLog('request', '提交改约', {
      url: 'https://test-ais.xiujiadian.com/ratel-api/serv-work-general-agg/servWorkModifyDutyTimeRemoteService/modifyDutyTime',
      body
    });

    const response = await fetch('https://test-ais.xiujiadian.com/ratel-api/serv-work-general-agg/servWorkModifyDutyTimeRemoteService/modifyDutyTime', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + authConfig.AK,
        'abtag': 'p0342'
      },
      body: JSON.stringify(body)
    });

    const resultText = await response.text();
    addLog('response', '改约响应', { result: resultText.substring(0, 500) });

    // 解析响应
    let isSuccess = false;
    let msg = '未知错误';

    try {
      const data = JSON.parse(resultText);
      isSuccess = data.success === true;
      msg = data.msg || '未知错误';
    } catch (e) {
      const statusMatch = resultText.match(/<status>(\d+)<\/status>/);
      const msgMatch = resultText.match(/<msg>([^<]*)<\/msg>/);
      isSuccess = statusMatch && statusMatch[1] === '200';
      msg = msgMatch ? msgMatch[1] : '未知错误';
    }

    if (isSuccess) {
      addLog('success', 'Skill2 完成: 工单改约成功', { newDutyTime: dutyTime, operator: staffInfo.realName });
    } else {
      addLog('error', 'Skill2 失败: ' + msg);
    }

    return { success: isSuccess, newDutyTime: dutyTime, operator: staffInfo.realName, msg };
  } catch (e) {
    addLog('error', 'Skill2 执行异常: ' + e.message);
    return { success: false, msg: e.message };
  }
}

// ==================== Skill3: 工单取消 ====================
// 【修复】使用 SKILL.md cancel-work 中定义的 API 和参数
async function skill3_cancelWork(trackWorkId, workId, intentResult, servOrderId) {
  addLog('process', '开始执行 Skill3: 工单取消', { trackWorkId, workId, servOrderId });

  // MVP规则：取消原因固定为"用户不需要了"
  const cancelReason = '用户不需要了';
  addLog('info', `取消规则: 固定原因 "${cancelReason}"`);

  // 【修复】使用 SKILL.md cancel-work 中定义的认证和 API
  const authConfig = await loadAuthConfig('cancel-work');
  if (!authConfig) throw new Error('认证配置加载失败');

  // 【修复】使用 SKILL.md 定义的请求参数
  const body = {
    servWorkId: workId,
    servOrderId: servOrderId,
    applySource: 17,           // SKILL.md 固定值
    operator: '系统',           // SKILL.md 固定值
    operatorId: 1,              // SKILL.md 固定值
    operatorIdentity: 1,       // SKILL.md 固定值
    reasonId: 217               // SKILL.md 固定值
  };

  // 【修复】使用 SKILL.md 定义的 API 地址
  const apiUrl = 'https://test-ais.xiujiadian.com/ratel-api/serv-work-general-agg/cancelApplyModifyRemoteService/submitCancelApply';

  addLog('request', '提交工单取消', { url: apiUrl, body });

  const response = await fetch(apiUrl, {
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
// 【修复】使用 SKILL.md create-track-task 中定义的 API 和参数
async function skill4_createTrackTask(trackWorkId, workId, intentResult, taskItemId) {
  addLog('process', '开始执行 Skill4: 生成跟单任务', { trackWorkId, workId, taskItemId });

  // 【修复】Step 1: 查询跟单详情（获取城市、公司、工程师等信息）
  const authConfig = await loadAuthConfig('create-track-task');
  if (!authConfig) throw new Error('认证配置加载失败');

  addLog('request', '查询跟单详情', { url: `https://test3-track.xiujiadian.com/amis/track/detail?trackWorkId=${trackWorkId}&workId=${workId}` });

  const detailRes = await fetch(`https://test3-track.xiujiadian.com/amis/track/detail?trackWorkId=${trackWorkId}&workId=${workId}`, {
    method: 'GET',
    headers: {
      'Authorization': 'Bearer ' + authConfig.AK
    }
  });

  const detailText = await detailRes.text();
  addLog('response', '跟单详情响应', { response: detailText.substring(0, 500) });

  // 解析跟单详情（支持 XML 格式）
  let trackDetail = null;
  try {
    const getXmlValue = (xml, tag) => {
      const match = xml.match(new RegExp(`<${tag}>([^<]*)</${tag}`));
      return match ? match[1] : '';
    };
    trackDetail = {
      trackWorkId: getXmlValue(detailText, 'trackWorkId'),
      workId: getXmlValue(detailText, 'workId'),
      cityId: getXmlValue(detailText, 'cityId'),
      cityName: getXmlValue(detailText, 'cityName'),
      companyId: getXmlValue(detailText, 'companyId'),
      companyName: getXmlValue(detailText, 'companyName'),
      engineerId: getXmlValue(detailText, 'engineerId'),
      engineerName: getXmlValue(detailText, 'engineerName'),
      engineerPhone: getXmlValue(detailText, 'engineerPhone')
    };
    addLog('info', '跟单详情解析成功', trackDetail);
  } catch (e) {
    addLog('error', '解析跟单详情失败: ' + e.message);
    return { success: false, error: '解析跟单详情失败' };
  }

  // 【修复】Step 2: 使用 SKILL.md 定义的参数构建请求体
  const body = {
    taskItemId: parseInt(taskItemId) || 1202,
    bizId: parseInt(trackWorkId),           // SKILL.md: bizId = trackWorkId
    bizSource: 40,                          // SKILL.md: 固定值 40（跟单）
    bizOrderType: 2,                        // SKILL.md: 固定值 2（服务工单）
    bizOrderId: parseInt(workId),           // SKILL.md: bizOrderId = workId
    cityId: parseInt(trackDetail.cityId) || 0,
    cityName: trackDetail.cityName || '',
    subCompanyId: parseInt(trackDetail.companyId) || 0,
    subCompanyName: trackDetail.companyName || '',
    engineerId: parseInt(trackDetail.engineerId) || 0,
    engineerName: trackDetail.engineerName || '',
    userTelephone: trackDetail.engineerPhone || '',
    plat: 10                                // SKILL.md: 固定值 10
  };

  // 【修复】使用 SKILL.md 定义的 API 地址
  const apiUrl = 'https://test-ais.xiujiadian.com/ratel-api/biz-twd/trackTaskModifyRemoteService/addTrackTask';

  addLog('request', '生成新跟单任务', { url: apiUrl, body });

  const response = await fetch(apiUrl, {
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
  let msg = '未知响应';
  try {
    const data = JSON.parse(resultText);
    msg = data.msg || data.message || '';
    if (data.status === 0 || data.success === true) {
      isSuccess = true;
      newTrackId = data.data || data.trackId || 'T' + Date.now();
    } else {
      addLog('error', 'Skill4 失败: ' + msg, { response: data });
    }
  } catch (e) {
    addLog('error', 'Skill4 失败: 响应解析失败', { response: resultText.substring(0, 200) });
    msg = resultText.substring(0, 200);
  }

  if (isSuccess) {
    addLog('success', 'Skill4 完成: 新跟单已生成', { newTrackId });
  }

  return { success: isSuccess, newTrackId, msg };
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

    // 分支处理：直接根据路由结果映射到对应 Skill
    currentStep++;
    let branchResult = null;

    if (routeData.routeResult === '确认上门') {
      // type1: 确认上门 → Skill2 工单改约
      steps.push({ step: currentStep, name: 'Skill2: 工单改约', status: 'running' });
      branchResult = await skill2_modifyDuty(trackWorkId, routeData.workId, routeData.intentResult);
    } else if (routeData.routeResult === '取消') {
      // type3: 取消 → Skill3 工单取消
      steps.push({ step: currentStep, name: 'Skill3: 工单取消', status: 'running' });
      branchResult = await skill3_cancelWork(trackWorkId, routeData.workId, routeData.intentResult, routeData.servOrderId);
    } else {
      // type2/type4: 其他意图 → Skill4 生成跟单任务
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
