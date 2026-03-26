/**
 * 挂起任务工作流 - 优化版
 * 纯 Node.js 实现，不依赖 Lobster，直接调用 Skills
 * 
 * 用法: node hangqi-workflow.js <trackWorkId> [taskItemId] [env]
 * 示例: node hangqi-workflow.js 127363772020785024 1202 prod
 */

const http = require('http');
const fs = require('fs');

// ==================== 配置 ====================
const CONFIG = {
  GATEWAY_URL: 'http://localhost:18789',
  TOKEN: '64a4ffec94093067b0fb0927527cffdb3e4e51cd15a46083',
  SKILLS_DIR: 'C:/Users/admin/.openclaw/workspace/skills',
  AI_WORKFLOW_AK: 'x76utyhsqdtirjcpp12sp9n2', // 算法组固定 AK
  INTENT_API_URL: 'https://test-ai.xiujiadian.com/zmn-ai-workflow/v1/961296a26366462b9fbef746ae4ea2cf/execute_flow'
};

// API 环境配置
const API_CONFIG = {
  test: {
    trackBaseUrl: 'https://test3-track.xiujiadian.com',
    aisBaseUrl: 'https://test-ais.xiujiadian.com',
    aisPublicBaseUrl: 'https://test-ais.xiujiadian.com/public',
    mcc: 'https://test3-mcc.xiujiadian.com',
    ak: 'aikm_5b5f60ccf5c9457f83461d58'
  },
  prod: {
    trackBaseUrl: 'https://ais.xiujiadian.com/zmn-track-admin',
    aisBaseUrl: 'https://ais.xiujiadian.com',
    aisPublicBaseUrl: 'https://ais.xiujiadian.com/public',
    ratelApiUrl: 'https://ais.xiujiadian.com/ratel-api',
    mcc: 'https://mcc.xiujiadian.com',
    ak: 'aikm_0e3de5bf7f5f4d09ab20ad97'
  }
};

// ==================== 全局状态 ====================
let globalEnv = 'test';
let currentConfig = API_CONFIG.test;
const executionLogs = [];

// ==================== 日志系统 ====================
const LOG_ICONS = {
  REQUEST: '📤',
  RESPONSE: '📥',
  PROCESS: '🔄',
  SUCCESS: '✅',
  ERROR: '❌',
  INFO: 'ℹ️',
  WARN: '⚠️',
  SKIP: '⏭️',
  DEBUG: '🐛'
};

const STEP_ICONS = {
  completed: '✅',
  running: '🔄',
  failed: '❌',
  skipped: '⏭️',
  pending: '⏳'
};

function addLog(category, message, details = null) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    category,
    message,
    details
  };
  executionLogs.push(logEntry);
  
  const icon = LOG_ICONS[category] || '📝';
  console.log(`${icon} [${category}] ${message}`);
  
  if (details) {
    const detailsStr = JSON.stringify(details, null, 2);
    const truncated = detailsStr.length > 500 ? detailsStr.substring(0, 500) + '...' : detailsStr;
    console.log(`   ${truncated.split('\n').join('\n   ')}`);
  }
}

function printSummary(success, failAt, failReason, steps) {
  console.log('\n' + '='.repeat(60));
  console.log('📋 执行日志汇总');
  console.log('='.repeat(60));
  
  console.log(`\n▶ 任务ID: ${process.argv[2] || 'N/A'}`);
  console.log(`▶ 执行结果: ${success ? '✅ 成功' : '❌ 失败'}`);
  if (!success) {
    console.log(`▶ 失败步骤: ${failAt}`);
    console.log(`▶ 失败原因: ${failReason}`);
  }
  
  console.log('\n📝 详细日志:');
  executionLogs.forEach((log, idx) => {
    const icon = LOG_ICONS[log.category] || '📝';
    console.log(`  ${idx + 1}. ${icon} [${log.category}] ${log.message}`);
  });
  
  console.log('\n📊 执行步骤:');
  steps.forEach(step => {
    const icon = STEP_ICONS[step.status] || '⏳';
    console.log(`  ${icon} Step ${step.step}: ${step.name} [${step.status}]`);
  });
  
  console.log('='.repeat(60));
}

// ==================== 认证配置加载 ====================
async function loadAuthConfig(skillName) {
  const skillAuthPath = `${CONFIG.SKILLS_DIR}/${skillName}/.auth`;
  try {
    const authContent = fs.readFileSync(skillAuthPath, 'utf8');
    const authConfig = {};
    
    authContent.split('\n').forEach(line => {
      const idx = line.indexOf('=');
      if (idx > 0) {
        authConfig[line.substring(0, idx).trim()] = line.substring(idx + 1).trim();
      }
    });
    
    // 根据环境选择 AK
    const isProd = globalEnv === 'prod';
    authConfig.AK = isProd 
      ? (authConfig.AK_PROD || API_CONFIG.prod.ak) 
      : (authConfig.AK_TEST || API_CONFIG.test.ak);
    
    // 生产环境登录凭证
    if (isProd) {
      authConfig.USERNAME = authConfig.USERNAME_PROD;
      authConfig.PASSWORD = authConfig.PASSWORD_PROD;
    }
    
    return authConfig;
  } catch (e) {
    addLog('ERROR', `加载认证失败: ${skillAuthPath}`, e.message);
    return null;
  }
}

// ==================== HTTP 工具函数 ====================
async function httpPost(url, headers, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body)
  });
  return response;
}

async function httpGet(url, headers) {
  const response = await fetch(url, {
    method: 'GET',
    headers
  });
  return response;
}

// XML 解析辅助函数
function parseXmlValue(xml, tag) {
  const match = xml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`));
  return match ? match[1] : '';
}

// ==================== Skills 实现 ====================

// Skill 1: 获取录音文本
async function skill1_getRecordText(trackWorkId, taskItemId = 1202) {
  addLog('PROCESS', 'Skill1: 获取录音文本', { trackWorkId, taskItemId });

  const authConfig = await loadAuthConfig('call-record-query');
  if (!authConfig) throw new Error('认证配置加载失败');

  const AK = authConfig.AK;
  const { trackBaseUrl, aisPublicBaseUrl } = currentConfig;

  try {
    // Step 1: 查询工单号
    addLog('REQUEST', '查询工单号', { url: `${trackBaseUrl}/amis/track/list` });
    
    const listRes = await httpPost(`${trackBaseUrl}/amis/track/list`, 
      { 'Authorization': `Bearer ${AK}` }, 
      { trackWorkId }
    );
    
    const listText = await listRes.text();
    addLog('RESPONSE', '工单号查询响应', { xml: listText.substring(0, 300) });

    const workIdMatch = listText.match(/<workId>(\d+)<\/workId>/);
    if (!workIdMatch) {
      addLog('ERROR', '未找到工单号');
      return { need_human_review: true, workId: null, taskItemId };
    }
    
    const workId = workIdMatch[1];
    addLog('INFO', `找到工单号: ${workId}`);

    // Step 2: 查询通话记录
    const recordUrl = `${aisPublicBaseUrl}/bfm-serv-work/serv/work/listCallRecord?servWorkId=${workId}`;
    addLog('REQUEST', '查询通话记录', { url: recordUrl });

    const recordRes = await httpGet(recordUrl, { 'Authorization': `Bearer ${AK}` });
    const recordJson = await recordRes.json();
    addLog('RESPONSE', '通话记录查询响应', { status: recordJson.status, count: recordJson.data?.length || 0 });

    if (recordJson.status !== 0 || !recordJson.data?.length) {
      addLog('WARN', '无通话记录，跳过录音文本获取');
      return { workId, hasCallRecord: false, voiceText: '', taskItemId, need_human_review: false };
    }

    // 筛选工程师→用户的通话记录
    const engineerToUserRecords = recordJson.data.filter(r =>
      r.callTypeName === '工程师' && r.peerTypeName === '用户'
    );

    // 筛选有 detectRecordId 且时长>10秒的记录
    const validRecords = engineerToUserRecords.filter(r => {
      if (!r.detectRecordId) return false;
      const durationStr = String(r.callDuration || '');
      const seconds = durationStr.includes(':')
        ? durationStr.split(':').reduce((acc, time) => (60 * acc) + +time, 0)
        : parseInt(durationStr) || 0;
      return seconds > 10;
    });

    // 按 finishTime 降序排序，取最新
    validRecords.sort((a, b) => b.finishTime - a.finishTime);
    const selectedRecord = validRecords[0] || engineerToUserRecords[0];

    if (!selectedRecord) {
      addLog('WARN', '无有效通话记录');
      return { workId, hasCallRecord: false, voiceText: '', taskItemId, need_human_review: false };
    }

    addLog('INFO', `选中通话记录`, { 
      detectRecordId: selectedRecord.detectRecordId || '无', 
      callDuration: selectedRecord.callDuration 
    });

    // Step 3: 获取语音转文字内容
    let voiceText = '';
    let voiceJson = null;
    
    if (selectedRecord.detectRecordId) {
      const voiceUrl = `${aisPublicBaseUrl}/bfm-mds/detectRecord/voiceRecord/content?detectRecordId=${selectedRecord.detectRecordId}&pageIndex=1&pageSize=100`;
      addLog('REQUEST', '获取语音转文字', { url: voiceUrl });

      try {
        const voiceRes = await httpGet(voiceUrl, { 'Authorization': `Bearer ${AK}` });
        voiceJson = await voiceRes.json();
        
        if (voiceJson.status === 0 && voiceJson.data?.items?.length) {
          voiceText = voiceJson.data.items.map(item => 
            `${item.role === 1 ? '工程师' : '用户'}: ${item.text}`
          ).join('\n');
          addLog('INFO', `获取到语音转文字: ${voiceJson.data.items.length}句`);
        }
      } catch (e) {
        addLog('WARN', `获取语音转文字失败: ${e.message}`);
      }
    }

    // 如果没有获取到语音转文字，使用 remark 作为备选
    if (!voiceText && selectedRecord.remark) {
      voiceText = selectedRecord.remark;
      addLog('INFO', '使用通话记录remark作为录音文本');
    }

    addLog('SUCCESS', `Skill1完成: 录音文本长度=${voiceText.length}`);

    // 构造 recording 数据供 Skill2 使用
    const recordingData = {
      success: true,
      detect_record_id: selectedRecord.detectRecordId || '',
      total: voiceJson?.data?.total || voiceJson?.data?.items?.length || 0,
      fetched_count: voiceJson?.data?.items?.length || 0,
      page_count: 1,
      items: (voiceJson?.data?.items || []).map(item => ({
        role: item.role,
        text: item.text,
        beginTime: String(item.beginTime || 0),
        endTime: String(item.endTime || 0),
        silenceDuration: String(item.silenceDuration || 0)
      }))
    };

    return {
      trackWorkId,
      workId,
      detectRecordId: selectedRecord.detectRecordId || null,
      voiceText,
      recordingData,
      need_human_review: false
    };
  } catch (e) {
    addLog('ERROR', `Skill1执行异常: ${e.message}`);
    throw e;
  }
}

// Skill 2: 意图识别
async function skill2_recognizeIntent(audioText, detectRecordId = null, recordingData = null) {
  addLog('PROCESS', 'Skill2: 意图识别', { hasText: !!audioText, detectRecordId });

  if (!audioText) {
    addLog('ERROR', '无录音文本');
    return { intent_name: 'other', confidence: 0, need_human_review: true };
  }

  try {
    // 优先使用传入的 recordingData
    let finalRecordingData = recordingData;
    
    if (!finalRecordingData) {
      // 降级：构造简单的 recordingData
      finalRecordingData = {
        success: true,
        detect_record_id: detectRecordId || '',
        total: 1,
        fetched_count: 1,
        page_count: 1,
        items: [{ role: '未知', text: audioText, beginTime: '0', endTime: '0', silenceDuration: '0' }]
      };
    }
    
    addLog('INFO', `使用语音数据: total=${finalRecordingData.total}, items=${finalRecordingData.items?.length || 0}`);

    const recordingStr = JSON.stringify(finalRecordingData);
    const requestBody = { inputs: { recording: recordingStr } };

    addLog('REQUEST', '调用意图识别API', { url: CONFIG.INTENT_API_URL });

    const response = await httpPost(CONFIG.INTENT_API_URL,
      { 'ak': `Bearer ${CONFIG.AI_WORKFLOW_AK}` },
      requestBody
    );

    const responseText = await response.text();
    addLog('INFO', `响应状态码: ${response.status}, 长度: ${responseText.length}`);

    if (!responseText?.trim()) {
      addLog('ERROR', '意图识别API返回空响应');
      return { intent_name: 'other', confidence: 0, need_human_review: true };
    }

    let json;
    try {
      json = JSON.parse(responseText);
    } catch (e) {
      addLog('ERROR', `响应解析失败: ${e.message}`);
      return { intent_name: 'other', confidence: 0, need_human_review: true };
    }

    // 解析意图结果
    const isSuccess = json.success === true || json.message === 'SUCCESS' || json.status === 200;
    const runResultText = json.data?.run_result || json.data;

    if (!isSuccess || !runResultText) {
      addLog('ERROR', '意图识别API失败', json);
      return { intent_name: 'other', confidence: 0, need_human_review: true };
    }

    // 解析 run_result
    let intentionData = {};
    try {
      const jsonMatch = runResultText.match(/```json\n?([\s\S]*?)\n?```/);
      if (jsonMatch) {
        intentionData = JSON.parse(jsonMatch[1]);
      } else if (typeof runResultText === 'object') {
        intentionData = runResultText;
      } else {
        intentionData = JSON.parse(runResultText);
      }
    } catch (e) {
      addLog('WARN', `解析意图结果失败: ${e.message}`);
    }

    const category = intentionData.intention?.category || '';
    const confidenceScore = intentionData.intention?.confidence_score || intentionData.intention?.Confidence_score || 0;

    // 映射到四种意图
    let intentName = 'other';
    if (category.includes('确认上门') || category.includes('确定上门') || category.includes('上门时间')) {
      intentName = 'confirm_visit';
    } else if (category.includes('询价') || category.includes('报价') || category.includes('价格')) {
      intentName = 'price_query';
    } else if (category.includes('不需要') || category.includes('取消') || category.includes('不做了')) {
      intentName = 'cancel';
    }

    addLog('SUCCESS', `Skill2完成: category=${category}, intent=${intentName}, confidence=${confidenceScore}`);

    // 置信度低于阈值时，触发创建跟单
    if (confidenceScore < 0.75) {
      intentName = 'price_query';
      addLog('INFO', '置信度低于0.75，触发创建跟单');
    }

    return {
      intent_name: intentName,
      confidence: confidenceScore,
      category,
      need_human_review: false
    };
  } catch (e) {
    addLog('ERROR', `Skill2执行异常: ${e.message}`);
    throw e;
  }
}

// Skill 3: 跟单处理
async function skill3_handleTrack(workId, trackWorkId, intentName) {
  addLog('PROCESS', 'Skill3: 跟单处理', { workId, trackWorkId, intentName });
  
  const authConfig = await loadAuthConfig('handle-track-work');
  if (!authConfig) throw new Error('认证配置加载失败');

  const body = {
    workId,
    trackWorkId,
    trackContentId: 1191,
    handleOptionList: [{
      optionId: 111,
      optionName: '挂起申请驳回',
      optionLevel: 0
    }],
    handleJumpType: 0,
    handleRemark: intentName || 'AI自动处理',
    isCompleteTrack: 1
  };

  addLog('REQUEST', '提交跟单处理', { url: `${currentConfig.trackBaseUrl}/amis/track/save/newHandle` });

  const response = await httpPost(`${currentConfig.trackBaseUrl}/amis/track/save/newHandle`,
    { 'Authorization': `Bearer ${authConfig.AK}` },
    body
  );

  const xmlText = await response.text();
  addLog('RESPONSE', '跟单处理响应', { xml: xmlText.substring(0, 200) });

  const status = parseXmlValue(xmlText, 'status');
  const msg = parseXmlValue(xmlText, 'msg');
  
  if (status !== '0') {
    throw new Error(`跟单处理失败: ${msg}`);
  }
  
  addLog('SUCCESS', `Skill3完成: ${msg}`);
  return { success: true, msg };
}

// Skill 4: 改约
async function skill4_modifyDutyTime(trackWorkId) {
  addLog('PROCESS', 'Skill4: 改约', { trackWorkId });

  const authConfig = await loadAuthConfig('modify-duty-time');
  if (!authConfig) throw new Error('认证配置加载失败');

  const { trackBaseUrl, aisBaseUrl, mcc } = currentConfig;

  try {
    // Step 1: 查询工单号
    addLog('REQUEST', '查询工单号', { url: `${trackBaseUrl}/amis/track/list` });

    const listRes = await httpPost(`${trackBaseUrl}/amis/track/list`,
      { 'Authorization': `Bearer ${authConfig.AK}` },
      { trackWorkId }
    );

    const listJson = await listRes.json();
    
    if (listJson.status !== 0 || !listJson.data?.items?.length) {
      throw new Error(listJson.msg || '未找到工单');
    }
    
    const servWorkId = listJson.data.items[0].workId;
    addLog('INFO', `找到工单号: ${servWorkId}`);

    // Step 2: 登录获取 sessionId
    addLog('PROCESS', '登录获取人员信息');

    const loginRes = await httpPost(`${mcc}/cas/login.action`,
      {},
      { staffName: authConfig.username, password: authConfig.password }
    );

    addLog('INFO', `登录响应状态: ${loginRes.status}`);

    // 提取 sessionId
    let sessionId = '';
    const cookies = loginRes.headers.getSetCookie?.() || [];
    
    for (const cookie of cookies) {
      const match = cookie.match(/zmn\.id=([^;]+)/);
      if (match) {
        sessionId = match[1];
        break;
      }
    }

    if (!sessionId) {
      throw new Error('未获取到sessionId');
    }

    // Step 3: 获取人员信息
    const staffRes = await httpPost(`${trackBaseUrl}/ratel-api/base-mcc/mcStaffForeignListRemoteService/getLoginStaffBySessionId`,
      { 'Authorization': `Bearer ${authConfig.AK}` },
      { sessionId }
    );

    const staffData = await staffRes.json();
    const staffInfo = staffData.data || { realName: '', deptName: '', deptId: 0, staffId: 0 };
    addLog('INFO', `获取人员信息: ${staffInfo.realName}`);

    // Step 4: 修改预约时间
    const formatTime = (date) => {
      const pad = (n) => String(n).padStart(2, '0');
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
    };

    const now = new Date();
    const dutyDate = new Date(now);
    dutyDate.setDate(dutyDate.getDate() + 2);
    dutyDate.setHours(9, 0, 0, 0);

    const modifyBody = {
      operateTime: formatTime(now),
      servWorkId,
      operator: staffInfo.realName,
      operatorDeptName: staffInfo.deptName,
      dutyTime: formatTime(dutyDate),
      operatorDeptId: staffInfo.deptId,
      operatorId: String(staffInfo.staffId),
      operatorIdentity: 2
    };

    addLog('REQUEST', '提交改约', { url: `${aisBaseUrl}/ratel-api/serv-work-general-agg/servWorkModifyDutyTimeRemoteService/modifyDutyTime` });

    const modifyRes = await httpPost(`${aisBaseUrl}/ratel-api/serv-work-general-agg/servWorkModifyDutyTimeRemoteService/modifyDutyTime`,
      { 'Authorization': `Bearer ${authConfig.AK}`, 'abtag': 'p0342' },
      modifyBody
    );

    const xmlText = await modifyRes.text();
    addLog('RESPONSE', '改约响应', { xml: xmlText.substring(0, 200) });

    let success = false;
    let msg = '未知错误';
    
    try {
      const jsonResult = JSON.parse(xmlText);
      success = jsonResult.success === true;
      msg = jsonResult.msg || '未知错误';
    } catch {
      success = parseXmlValue(xmlText, 'status') === '200';
      msg = parseXmlValue(xmlText, 'msg') || '未知错误';
    }

    if (!success) {
      throw new Error(`改约失败: ${msg}`);
    }

    addLog('SUCCESS', `Skill4完成: 改约成功`);
    return { success: true, newTime: modifyBody.dutyTime };
  } catch (e) {
    addLog('ERROR', `Skill4执行异常: ${e.message}`);
    throw e;
  }
}

// Skill 5: 取消工单
async function skill5_cancelWork(trackWorkId) {
  addLog('PROCESS', 'Skill5: 取消工单', { trackWorkId });

  const authConfig = await loadAuthConfig('cancel-work');
  if (!authConfig) throw new Error('认证配置加载失败');

  const { trackBaseUrl, aisBaseUrl } = currentConfig;

  try {
    // Step 1: 查询工单号
    addLog('REQUEST', '查询工单号', { url: `${trackBaseUrl}/amis/track/list` });

    const listRes = await httpPost(`${trackBaseUrl}/amis/track/list`,
      { 'Authorization': `Bearer ${authConfig.AK}` },
      { trackWorkId }
    );

    const listJson = await listRes.json();
    
    if (listJson.status !== 0 || !listJson.data?.items?.length) {
      throw new Error(listJson.msg || '未找到工单');
    }
    
    const { workId: servWorkId, servOrderId } = listJson.data.items[0];
    addLog('INFO', `找到工单号: ${servWorkId}, 服务订单号: ${servOrderId}`);

    // Step 2: 调用工单取消接口
    const cancelBody = {
      applySource: 17,
      operator: '系统',
      operatorId: 1,
      operatorIdentity: 1,
      reasonId: 217,
      servOrderId,
      servWorkId
    };

    addLog('REQUEST', '提交取消', { url: `${aisBaseUrl}/ratel-api/serv-work-general-agg/cancelApplyModifyRemoteService/submitCancelApply` });

    const cancelRes = await httpPost(`${aisBaseUrl}/ratel-api/serv-work-general-agg/cancelApplyModifyRemoteService/submitCancelApply`,
      { 'Authorization': `Bearer ${authConfig.AK}` },
      cancelBody
    );

    const xmlText = await cancelRes.text();
    addLog('RESPONSE', '取消响应', { xml: xmlText.substring(0, 200) });

    let success = false;
    let msg = '未知错误';
    
    try {
      const jsonResult = JSON.parse(xmlText);
      success = jsonResult.success === true;
      msg = jsonResult.msg || '未知错误';
    } catch {
      success = parseXmlValue(xmlText, 'status') === '200';
      msg = parseXmlValue(xmlText, 'msg') || '未知错误';
    }

    if (!success) {
      throw new Error(`取消失败: ${msg}`);
    }

    addLog('SUCCESS', 'Skill5完成: 取消成功');
    return { success: true, msg };
  } catch (e) {
    addLog('ERROR', `Skill5执行异常: ${e.message}`);
    throw e;
  }
}

// Skill 6: 创建跟单任务
async function skill6_createTrackTask(trackWorkId, workId, taskItemId = 1202) {
  addLog('PROCESS', 'Skill6: 创建跟单任务', { trackWorkId, workId, taskItemId });

  const authConfig = await loadAuthConfig('create-track-task');
  if (!authConfig) throw new Error('认证配置加载失败');

  const createBody = {
    trackWorkId,
    servWorkId: workId,
    taskItemId
  };

  const url = `${currentConfig.trackBaseUrl}/amis/track/add/task`;
  addLog('REQUEST', '创建跟单任务', { url });

  const response = await httpPost(url,
    { 'Authorization': `Bearer ${authConfig.AK}` },
    createBody
  );

  const resultText = await response.text();
  addLog('RESPONSE', '创建响应', { text: resultText.substring(0, 200) });

  const status = parseXmlValue(resultText, 'status');
  const msg = parseXmlValue(resultText, 'msg');
  
  if (status === '0') {
    addLog('SUCCESS', 'Skill6完成: 创建成功');
    return { success: true, msg: '创建成功' };
  } else {
    throw new Error(`创建跟单任务失败: ${msg || '未知错误'}`);
  }
}

// ==================== 主工作流 ====================
async function runWorkflow(trackWorkId, taskItemId = 1202, env = 'test') {
  console.log('\n========== 挂起任务工作流 ==========');
  console.log(`▶ 跟单ID: ${trackWorkId}`);
  console.log(`▶ 任务项ID: ${taskItemId}`);
  console.log(`▶ 环境: ${env === 'prod' ? '生产' : '测试'}`);
  console.log('====================================\n');
  
  const steps = [];
  let currentStep = 0;
  let skill1Result = null;
  
  const addStep = (name, status = 'running') => {
    currentStep++;
    steps.push({ step: currentStep, name, status });
    return currentStep - 1;
  };

  const updateStep = (idx, status, result = null) => {
    steps[idx] = { ...steps[idx], status, ...(result && { result }) };
  };
  
  try {
    // Step 1: Skill1 - 获取录音文本
    const step1Idx = addStep('Skill1: 获取录音文本');
    skill1Result = await skill1_getRecordText(trackWorkId, taskItemId);
    
    if (skill1Result.need_human_review) {
      updateStep(step1Idx, 'failed');
      throw new Error('录音文本获取失败');
    }
    
    updateStep(step1Idx, 'completed', skill1Result);
    
    // Step 2: Skill2 - 意图识别
    let intentName;
    let step2Idx;
    
    if (!skill1Result.voiceText) {
      addLog('INFO', '无录音文本，跳过意图识别');
      intentName = 'price_query';
      step2Idx = addStep('Skill2: 意图识别', 'skipped');
      updateStep(step2Idx, 'skipped', { reason: '无录音文本' });
    } else {
      step2Idx = addStep('Skill2: 意图识别');
      const skill2Result = await skill2_recognizeIntent(
        skill1Result.voiceText, 
        skill1Result.detectRecordId, 
        skill1Result.recordingData
      );

      if (skill2Result.need_human_review || skill2Result.confidence < 0.75) {
        updateStep(step2Idx, 'failed');
        throw new Error('意图识别置信度低');
      }

      updateStep(step2Idx, 'completed', skill2Result);
      intentName = skill2Result.intent_name;
    }
    
    addLog('INFO', `意图分类: ${intentName}`);
    
    // Step 3: Skill3 - 跟单处理（所有分支都需要）
    const step3Idx = addStep('Skill3: 跟单处理');
    const skill3Result = await skill3_handleTrack(skill1Result.workId, trackWorkId, intentName);
    updateStep(step3Idx, 'completed', skill3Result);
    
    // Step 4: 根据意图路由
    let finalResult;
    const step4Idx = addStep(`Skill4-${intentName}: 执行意图动作`);

    switch (intentName) {
      case 'confirm_visit':
        finalResult = await skill4_modifyDutyTime(trackWorkId);
        break;
      case 'cancel':
        finalResult = await skill5_cancelWork(trackWorkId);
        break;
      default:
        finalResult = await skill6_createTrackTask(trackWorkId, skill1Result.workId, taskItemId);
    }
    
    updateStep(step4Idx, 'completed', finalResult);
    
    addLog('SUCCESS', '========== 工作流执行完成 ==========');
    printSummary(true, null, null, steps);
    
    return {
      success: true,
      intent: intentName,
      steps,
      logs: executionLogs,
      final_result: finalResult
    };
    
  } catch (error) {
    addLog('ERROR', `工作流执行异常: ${error.message}`);
    
    // 兜底流程
    addLog('INFO', '触发兜底流程...');
    
    try {
      const fallbackIdx1 = addStep('Skill3: 跟单处理(兜底)');
      const skill3Result = await skill3_handleTrack(skill1Result?.workId, trackWorkId, 'price_query');
      updateStep(fallbackIdx1, 'completed', skill3Result);
      
      const fallbackIdx2 = addStep('Skill6: 生成跟单(兜底)');
      const skill6Result = await skill6_createTrackTask(trackWorkId, skill1Result?.workId, taskItemId);
      updateStep(fallbackIdx2, 'completed', skill6Result);
      
      addLog('SUCCESS', '兜底流程执行完成');
      printSummary(true, null, null, steps);
      
      return {
        success: true,
        intent: 'price_query',
        fallback: true,
        steps,
        logs: executionLogs,
        final_result: skill6Result
      };

    } catch (fallbackError) {
      addLog('ERROR', `兜底流程也失败: ${fallbackError.message}`);
      printSummary(false, `Step ${currentStep}`, error.message, steps);

      return {
        success: false,
        fail_at: `Step ${currentStep}`,
        fail_reason: error.message,
        fallback_failed: fallbackError.message,
        steps,
        logs: executionLogs,
        error: error.stack
      };
    }
  }
}

// ==================== 模块化支持 ====================
// 如果被 require，则只导出函数，不执行
if (require.main === module) {
  // ==================== 启动 ====================
  const args = process.argv.slice(2);
  const trackWorkId = args[0];
  const taskItemId = args[1] || '1202';
  const rawEnv = args[2] || 'test';

  globalEnv = (rawEnv === '生产' || rawEnv === 'prod') ? 'prod' : 'test';
  currentConfig = API_CONFIG[globalEnv];

  if (!trackWorkId) {
    console.error('❌ 错误: 请提供跟单ID');
    console.log('用法: node hangqi-workflow.js <trackWorkId> [taskItemId] [env]');
    console.log('示例: node hangqi-workflow.js 127363772020785024 1202 prod');
    process.exit(1);
  }

  runWorkflow(trackWorkId, taskItemId, globalEnv)
    .then(result => {
      console.log('\n========== 执行结果 ==========');
      console.log(JSON.stringify(result, null, 2));
      process.exit(result.success ? 0 : 1);
    })
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
} else {
  // 被模块化加载时，导出函数和配置
  module.exports = {
    runWorkflow,
    skill1_getRecordText,
    skill2_recognizeIntent,
    skill3_handleTrack,
    skill4_modifyDutyTime,
    skill5_cancelWork,
    skill6_createTrackTask,
    API_CONFIG,
    setGlobalEnv: (env) => {
      globalEnv = env;
      currentConfig = API_CONFIG[env] || API_CONFIG.test;
    }
  };
}
