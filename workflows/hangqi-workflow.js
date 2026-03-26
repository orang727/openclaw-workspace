/**
 * 挂起任务工作流 - 纯 Node.js 实现
 * 不依赖 Lobster，直接调用 Skills
 * 
 * 用法: node hangqi-workflow.js <trackWorkId>
 */

const http = require('http');

// ==================== 配置 ====================
const GATEWAY_URL = 'http://localhost:18789';
const TOKEN = '64a4ffec94093067b0fb0927527cffdb3e4e51cd15a46083';
const SKILLS_DIR = 'C:/Users/admin/.openclaw/workspace/skills';

// ==================== 执行日志系统 ====================
const executionLogs = [];

function addLog(category, message, details = null) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    category,
    message,
    details
  };
  executionLogs.push(logEntry);
  console.log(`[${category}] ${message}`);
  if (details) {
    console.log(`  详情: ${JSON.stringify(details, null, 2)}`);
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
    const icon = {
      'REQUEST': '📤',
      'RESPONSE': '📥',
      'PROCESS': '🔄',
      'SUCCESS': '✅',
      'ERROR': '❌',
      'INFO': 'ℹ️',
      'SKIP': '⏭️'
    }[log.category] || '📝';
    console.log(`  ${idx + 1}. ${icon} [${log.category}] ${log.message}`);
    if (log.details) {
      const detailsStr = JSON.stringify(log.details);
      if (detailsStr.length > 300) {
        console.log(`      ${detailsStr.substring(0, 300)}...`);
      } else {
        console.log(`      ${detailsStr}`);
      }
    }
  });
  
  console.log('\n📊 执行步骤:');
  steps.forEach(step => {
    const icon = {
      'completed': '✅',
      'running': '🔄',
      'failed': '❌'
    }[step.status] || '⏳';
    console.log(`  ${icon} Step ${step.step}: ${step.name} [${step.status}]`);
  });
  
  console.log('='.repeat(60));
}

// ==================== 认证配置加载 ====================
// 使用各 Skill 目录下的 .auth 文件
// 全局环境配置
let globalEnv = 'test';
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

async function loadAuthConfig(skillName) {
  const skillAuthPath = `C:/Users/admin/.openclaw/workspace/skills/${skillName}/.auth`;
  try {
    const fs = require('fs');
    const authContent = fs.readFileSync(skillAuthPath, 'utf8');
    const authConfig = {};
    authContent.split('\n').forEach(line => {
      const idx = line.indexOf('=');
      if (idx > 0) authConfig[line.substring(0, idx).trim()] = line.substring(idx + 1).trim();
    });
    
    // 根据环境选择 AK
    const isProd = globalEnv === 'prod';
    authConfig.AK = isProd ? (authConfig.AK_PROD || API_CONFIG.prod.ak) : (authConfig.AK_TEST || API_CONFIG.test.ak);
    
    // 生产环境登录凭证
    if (isProd) {
      authConfig.USERNAME = authConfig.USERNAME_PROD;
      authConfig.PASSWORD = authConfig.PASSWORD_PROD;
    }
    
    return authConfig;
  } catch (e) {
    console.error(`加载认证失败: ${skillAuthPath}`, e.message);
    return null;
  }
}

// ==================== 工具函数 ====================
function invokeTool(tool, action, args) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 18789,
      path: '/tools/invoke',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + TOKEN
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json);
        } catch (e) {
          reject(new Error('Invalid JSON: ' + data));
        }
      });
    });

    req.on('error', reject);
    req.write(JSON.stringify({ tool, action, args }));
    req.end();
  });
}

function log(message, type = 'info') {
  const prefix = {
    info: 'ℹ️',
    success: '✅',
    error: '❌',
    warn: '⚠️',
    step: '🔄'
  }[type] || '📝';
  console.log(`${prefix} ${message}`);
}

// ==================== Skills 实现 ====================

// Skill 1: 获取录音 (按 SKILL.md call-record-query_v3 定义重写)
async function skill1_getRecordText(trackWorkId, taskItemId = 1202) {
  addLog('PROCESS', `开始执行 Skill1: 获取录音文本`, { trackWorkId, taskItemId });

  const authConfig = await loadAuthConfig('call-record-query');
  if (!authConfig) {
    addLog('ERROR', '认证配置加载失败');
    throw new Error('认证配置加载失败');
  }

  // 使用全局配置的环境
  const AK = env === 'prod' ? (authConfig.AK_PROD || currentConfig.ak) : (authConfig.AK_TEST || currentConfig.ak);
  const baseUrl = currentConfig.trackBaseUrl;
  const aisPublicBaseUrl = currentConfig.aisPublicBaseUrl;
  const aisBaseUrl = currentConfig.aisBaseUrl;

  try {
    // Step 1: 查询工单号
    const listRequestBody = { trackWorkId };
    addLog('REQUEST', '查询工单号', {
      url: `${baseUrl}/amis/track/list`,
      body: listRequestBody
    });

    const listRes = await fetch(`${baseUrl}/amis/track/list`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + authConfig.AK
      },
      body: JSON.stringify(listRequestBody)
    });

    const listText = await listRes.text();
    addLog('RESPONSE', '工单号查询响应', { xml: listText.substring(0, 500) });

    const workIdMatch = listText.match(/<workId>(\d+)<\/workId>/);
    let workId;
    if (!workIdMatch) {
      addLog('ERROR', '未找到工单号', { response: listText.substring(0, 200) });
      return { need_human_review: true, workId: null, taskItemId };
    }
    workId = workIdMatch[1];

    addLog('INFO', `找到工单号: ${workId}`);

    // Step 2: 查询通话记录
    addLog('REQUEST', '查询通话记录', {
      url: `${aisPublicBaseUrl}/bfm-serv-work/serv/work/listCallRecord?servWorkId=${workId}`
    });

    const recordRes = await fetch(`${aisPublicBaseUrl}/bfm-serv-work/serv/work/listCallRecord?servWorkId=${workId}`, {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer ' + authConfig.AK
      }
    });

    const recordJson = await recordRes.json();
    addLog('RESPONSE', '通话记录查询响应', recordJson);

    if (recordJson.status !== 0 || !recordJson.data || recordJson.data.length === 0) {
      addLog('WARNING', '无通话记录，跳过录音文本获取，直接创建跟单', { response: recordJson });
      return { workId, hasCallRecord: false, audio_text: '', taskItemId, need_human_review: false };
    }

    // 按 SKILL.md 筛选规则:
    // 1. 优先选有 detectRecordId 的记录
    // 2. 次选通话时长 > 10秒 的记录
    // 3. 按 finishTime 取最新
    // 4. callTypeName = "工程师", peerTypeName = "用户"

    // 先筛选工程师→用户的通话记录
    const engineerToUserRecords = recordJson.data.filter(r =>
      r.callTypeName === '工程师' && r.peerTypeName === '用户'
    );

    // 按 SKILL.md 筛选规则:
    // 1. 存在 detectRecordId 字段
    // 2. 通话时长 > 10秒
    // 3. callTypeName = "工程师"
    // 4. peerTypeName = "用户"
    // 5. 取结束时间最晚的一条

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
    const selectedRecord = validRecords.length > 0 ? validRecords[0] : engineerToUserRecords[0];

    addLog('INFO', `选中通话记录: detectRecordId=${selectedRecord.detectRecordId || '无'}, callDuration=${selectedRecord.callDuration}, remark=${selectedRecord.remark ? '有' : '无'}`);

    // 直接使用通话记录的 remark 作为录音文本
    let voiceText = selectedRecord.remark || '';

    // Step3: 有detectRecordId时，获取语音转文字内容
    if (selectedRecord.detectRecordId) {
      addLog('REQUEST', '获取语音转文字内容', {
        url: `${aisPublicBaseUrl}/bfm-mds/detectRecord/voiceRecord/content?detectRecordId=${selectedRecord.detectRecordId}&pageIndex=1&pageSize=100`
      });

      try {
        const voiceRes = await fetch(`${aisPublicBaseUrl}/bfm-mds/detectRecord/voiceRecord/content?detectRecordId=${selectedRecord.detectRecordId}&pageIndex=1&pageSize=100`, {
          method: 'GET',
          headers: { 'Authorization': 'Bearer ' + authConfig.AK }
        });
        var voiceJson = await voiceRes.json();
        addLog('RESPONSE', '语音转文字响应', voiceJson);

        if (voiceJson.status === 0 && voiceJson.data && voiceJson.data.items && voiceJson.data.items.length > 0) {
          // 拼接对话内容
          voiceText = voiceJson.data.items.map(item => `${item.role}: ${item.text}`).join('\n');
          addLog('INFO', `获取到语音转文字内容：长度=${voiceText.length}`);
        }
      } catch (e) {
        addLog('WARN', `获取语音转文字失败: ${e.message}`);
        var voiceJson = null;
      }
    }

    addLog('SUCCESS', `Skill1 完成: 录音文本长度=${voiceText.length}`, {
      workId,
      hasVoiceText: !!voiceText,
      hasDetectRecordId: !!selectedRecord.detectRecordId,
      hasRemark: !!selectedRecord.remark
    });

    // 按最新技能规范：构造完整recording对象，转义后供意图识别使用
    // 收集语音转文字items
    let voiceTextItems = [];
    let voiceTextTotal = 0;
    
    if (selectedRecord.detectRecordId && voiceJson && voiceJson.data && voiceJson.data.items) {
      voiceTextTotal = voiceJson.data.total || voiceJson.data.items.length;
      voiceTextItems = voiceJson.data.items.map(item => ({
        role: item.role === 1 ? '工程师' : '用户',
        text: item.text,
        beginTime: parseInt(item.beginTime) || 0,
        endTime: parseInt(item.endTime) || 0
      }));
    }

    const recordingData = {
      success: true,
      trackWorkId,
      workId,
      callRecord: {
        callRecordId: selectedRecord.callRecordId,
        detectRecordId: selectedRecord.detectRecordId,
        callTypeName: selectedRecord.callTypeName,
        peerTypeName: selectedRecord.peerTypeName,
        startTime: selectedRecord.startTime,
        finishTime: selectedRecord.finishTime,
        callDuration: selectedRecord.callDuration,
        tapeUrl: selectedRecord.tapeUrl
      },
      voiceText: {
        total: voiceTextTotal,
        items: voiceTextItems
      }
    };

    // 转义双引号，转换为字符串
    const recordingStr = JSON.stringify(recordingData).replace(/"/g, '\\"');

    return {
      trackWorkId,
      workId,
      detectRecordId: selectedRecord.detectRecordId || null,
      voiceText,
      recordingStr, // 新增：适配意图识别接口的转义后的字符串
      need_human_review: false
    };
  } catch (e) {
    addLog('ERROR', `Skill1 执行异常: ${e.message}`);
    throw e;
  }
}

// Skill 2: 意图识别 (按 SKILL.md recording-intention 定义重写)
async function skill2_recognizeIntent(audioText, detectRecordId = null) {
  addLog('PROCESS', `开始执行 Skill2: 意图识别`, { hasText: !!audioText, detectRecordId });

  const authConfig = await loadAuthConfig('recording-intention');
  if (!authConfig) {
    addLog('ERROR', '认证配置加载失败');
    throw new Error('认证配置加载失败');
  }

  if (!audioText) {
    addLog('ERROR', '无录音文本');
    return { intent_name: 'other', confidence: 0, need_human_review: true };
  }

  try {
    // 按 SKILL.md 格式构造入参
    // recording 字段是一个 JSON 字符串，包含 success, detect_record_id, total, items 等
    let recordingData;

    if (detectRecordId) {
      // 有 detectRecordId，调用 API 获取完整的语音转文字数据
      addLog('REQUEST', '获取语音转文字详情', {
        url: `${currentConfig.aisPublicBaseUrl}/bfm-mds/detectRecord/voiceRecord/content?detectRecordId=${detectRecordId}&pageIndex=1&pageSize=100`
      });

      try {
        const voiceRes = await fetch(`${currentConfig.aisPublicBaseUrl}/bfm-mds/detectRecord/voiceRecord/content?detectRecordId=${detectRecordId}&pageIndex=1&pageSize=100`, {
          method: 'GET',
          headers: { 'Authorization': 'Bearer ' + authConfig.AK }
        });
        const voiceJson = await voiceRes.json();

        // 按 SKILL.md 格式构造 recording 数据
        recordingData = {
          success: voiceJson.success === true,
          detect_record_id: detectRecordId,
          total: voiceJson.total || 0,
          fetched_count: voiceJson.fetched_count || (voiceJson.items?.length || 0),
          page_count: voiceJson.page_count || 1,
          items: voiceJson.items || []
        };
        addLog('INFO', `获取语音数据: total=${recordingData.total}, items=${recordingData.items.length}`);
      } catch (e) {
        addLog('WARN', `获取语音数据失败，降级使用纯文本: ${e.message}`);
        recordingData = {
          success: true,
          detect_record_id: '',
          total: 1,
          fetched_count: 1,
          page_count: 1,
          items: [{ role: '未知', text: audioText, beginTime: '0', endTime: '0', silenceDuration: '0' }]
        };
      }
    } else {
      // 没有 detectRecordId，直接使用纯文本
      recordingData = {
        success: true,
        detect_record_id: '',
        total: 1,
        fetched_count: 1,
        page_count: 1,
        items: [{ role: '未知', text: audioText, beginTime: '0', endTime: '0', silenceDuration: '0' }]
      };
    }

    // 将 recordingData 序列化为 JSON 字符串
    const recordingStr = JSON.stringify(recordingData, null, 0);
    const requestBody = { inputs: { recording: recordingStr } };

    // 按 SKILL.md 使用正确的 API 端点
    // 固定地址，不随环境变化
    const intentApiUrl = 'https://test-ai.xiujiadian.com/zmn-ai-workflow/v1/961296a26366462b9fbef746ae4ea2cf/execute_flow';
    addLog('REQUEST', '调用意图识别API', {
      url: intentApiUrl,
      body: requestBody
    });

    const response = await fetch(intentApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + authConfig.AK
      },
      body: JSON.stringify(requestBody)
    });

    const json = await response.json();
    addLog('RESPONSE', '意图识别响应', json);

    // 兼容多种返回格式: success/SUCCESS, data/run_result
    const isSuccess = json.success === true || json.message === 'SUCCESS' || json.status === 200;
    const runResultText = json.data?.run_result || json.data;

    if (!isSuccess || !runResultText) {
      addLog('ERROR', '意图识别API失败', json);
      return { intent_name: 'other', confidence: 0, need_human_review: true };
    }

    // 解析 run_result (可能是字符串格式 ```json...```)
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

    addLog('INFO', '解析意图结果', intentionData);

    // 兼容大小写: confidence_score/Confidence_score
    const category = intentionData.intention?.category || '';
    const confidenceScore = intentionData.intention?.confidence_score || intentionData.intention?.Confidence_score || 0;

    // 映射到四种意图
    let intentName = 'other';
    if (category.includes('确认上门') || category.includes('确定上门') || category.includes('上门时间')) {
      intentName = 'confirm_visit';  // 确认上门
    } else if (category.includes('询价') || category.includes('报价') || category.includes('价格')) {
      intentName = 'price_query';   // 用户询价
    } else if (category.includes('不需要') || category.includes('取消') || category.includes('不做了')) {
      intentName = 'cancel';        // 取消
    }

    addLog('SUCCESS', `Skill2 完成: category=${category}, intent=${intentName}, confidence=${confidenceScore}`);

    // 置信度低于阈值时，触发创建跟单
    if (confidenceScore < 0.75) {
      intentName = 'price_query';
      addLog('INFO', `置信度低于阈值0.75，触发创建跟单任务`);
    }

    return {
      intent_name: intentName,
      confidence: confidenceScore,
      category: category,
      need_human_review: false  // 低于阈值时自动触发创建跟单，不再人工复核
    };

  } catch (e) {
    addLog('ERROR', `Skill2 执行异常: ${e.message}`);
    throw e;
  }
}

// Skill 3: 跟单处理 (真实 API)
async function skill3_handleTrack(workId, trackWorkId, intentName) {
  addLog('PROCESS', `开始执行 Skill3: 跟单处理`, { workId, trackWorkId, intentName });
  
  const authConfig = await loadAuthConfig('handle-track-work');
  if (!authConfig) {
    addLog('ERROR', '认证配置加载失败');
    throw new Error('认证配置加载失败');
  }

  const handleRemark = intentName || 'AI自动处理';
  
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
    isCompleteTrack: 1
  };

  addLog('REQUEST', '提交跟单处理', { 
    url: `${currentConfig.trackBaseUrl}/amis/track/save/newHandle`,
    body
  });

  const response = await fetch(`${currentConfig.trackBaseUrl}/amis/track/save/newHandle`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + authConfig.AK
    },
    body: JSON.stringify(body)
  });

  const xmlText = await response.text();
  addLog('RESPONSE', '跟单处理响应', { xml: xmlText });

  const statusMatch = xmlText.match(/<status>(\d+)<\/status>/);
  const msgMatch = xmlText.match(/<msg>([^<]*)<\/msg>/);
  
  const status = statusMatch ? statusMatch[1] : '-1';
  const msg = msgMatch ? msgMatch[1] : '未知错误';
  
  if (status !== '0') {
    addLog('ERROR', `跟单处理失败: ${msg}`, { status, xml: xmlText });
    throw new Error(`跟单处理失败: ${msg}`);
  }
  
  addLog('SUCCESS', `Skill3 完成: ${msg}`);
  return { success: true, msg };
}

// Skill 4: 改约 (按 SKILL.md modify-duty-time 定义重写)
async function skill4_modifyDutyTime(trackWorkId) {
  addLog('PROCESS', `开始执行 Skill4: 改约`, { trackWorkId });

  const authConfig = await loadAuthConfig('modify-duty-time');
  if (!authConfig) {
    addLog('ERROR', '认证配置加载失败');
    throw new Error('认证配置加载失败');
  }

  try {
    // Step 2: 根据跟单ID查询工单号
    addLog('REQUEST', '查询工单号', {
      url: '${baseUrl}/amis/track/list',
      body: { trackWorkId }
    });

    const listRes = await fetch('${baseUrl}/amis/track/list', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + authConfig.AK
      },
      body: JSON.stringify({ trackWorkId })
    });

    const listJson = await listRes.json();
    addLog('RESPONSE', '工单号查询响应', listJson);

    let servWorkId;
    if (listJson.status === 0 && listJson.data && listJson.data.items && listJson.data.items.length > 0) {
      servWorkId = listJson.data.items[0].workId;
    } else {
      addLog('ERROR', '未找到该跟单ID对应的工单');
      return { success: false, msg: listJson.msg || '未找到工单' };
    }
    addLog('INFO', `找到工单号: ${servWorkId}`);

    // Step 3: 登录获取 sessionId 并查询人员信息
    addLog('PROCESS', '登录获取人员信息');

    const mccUrl = authConfig.mcc;
    const loginRes = await fetch('${mccUrl}/cas/login.action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ staffName: authConfig.username, password: authConfig.password }),
      redirect: 'manual'
    });

    addLog('INFO', `登录响应状态: ${loginRes.status}`);

    // 提取 sessionId - 支持多种浏览器/Node.js 环境
    let sessionId = '';
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

    addLog('INFO', `获取到 ${allCookies.length} 个 cookie`);

    // 解析 cookie 查找 sessionId
    for (const cookie of allCookies) {
      addLog('DEBUG', `Cookie: ${cookie.substring(0, 100)}...`);
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

    addLog('INFO', `解析到的 sessionId: ${sessionId ? sessionId.substring(0, 20) + '...' : '为空'}`);

    if (!sessionId) {
      addLog('ERROR', '登录成功但未获取到sessionId', { cookies: allCookies });
      return { success: false, msg: '登录成功但未获取到sessionId' };
    }

    // 获取人员信息
    const staffRes = await fetch('${baseUrl}/ratel-api/base-mcc/mcStaffForeignListRemoteService/getLoginStaffBySessionId', {
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
      }
    }
    addLog('INFO', `获取人员信息: ${staffInfo.realName}`);

    // Step 4: 修改预约时间
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

    addLog('REQUEST', '提交改约', {
      url: 'currentConfig.aisBaseUrl/ratel-api/serv-work-general-agg/servWorkModifyDutyTimeRemoteService/modifyDutyTime',
      body
    });

    const response = await fetch('currentConfig.aisBaseUrl/ratel-api/serv-work-general-agg/servWorkModifyDutyTimeRemoteService/modifyDutyTime', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + authConfig.AK,
        'abtag': 'p0342'
      },
      body: JSON.stringify(body)
    });

    const xmlText = await response.text();
    addLog('RESPONSE', '改约响应', { xml: xmlText.substring(0, 500) });

    // 解析响应
    let success = false;
    let msg = '未知错误';
    try {
      const jsonResult = JSON.parse(xmlText);
      success = jsonResult.success === true;
      msg = jsonResult.msg || '未知错误';
    } catch (e) {
      const statusMatch = xmlText.match(/<status>(\d+)<\/status>/);
      const msgMatch = xmlText.match(/<msg>([^<]*)<\/msg>/);
      success = statusMatch && statusMatch[1] === '200';
      msg = msgMatch ? msgMatch[1] : '未知错误';
    }

    if (!success) {
      addLog('ERROR', `改约失败: ${msg}`);
      return { success: false, msg };
    }

    addLog('SUCCESS', `Skill4 完成: 改约成功, 新时间=${dutyTime}`);
    return { success: true, newTime: dutyTime };
  } catch (e) {
    addLog('ERROR', `Skill4 执行异常: ${e.message}`);
    throw e;
  }
}

// Skill 5: 取消工单 (按 SKILL.md cancel-work 定义重写)
async function skill5_cancelWork(trackWorkId) {
  addLog('PROCESS', `开始执行 Skill5: 取消工单`, { trackWorkId });

  const authConfig = await loadAuthConfig('cancel-work');
  if (!authConfig) {
    addLog('ERROR', '认证配置加载失败');
    throw new Error('认证配置加载失败');
  }

  try {
    // Step 2: 根据跟单ID查询工单号
    addLog('REQUEST', '查询工单号', {
      url: '${baseUrl}/amis/track/list',
      body: { trackWorkId }
    });

    const listRes = await fetch('${baseUrl}/amis/track/list', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + authConfig.AK
      },
      body: JSON.stringify({ trackWorkId })
    });

    const listJson = await listRes.json();
    addLog('RESPONSE', '工单号查询响应', listJson);

    let servWorkId, servOrderId;
    if (listJson.status === 0 && listJson.data && listJson.data.items && listJson.data.items.length > 0) {
      const item = listJson.data.items[0];
      servWorkId = item.workId;
      servOrderId = item.servOrderId;
    } else {
      addLog('ERROR', '未找到该跟单ID对应的工单');
      return { success: false, msg: listJson.msg || '未找到工单' };
    }
    addLog('INFO', `找到工单号: ${servWorkId}, 服务订单号: ${servOrderId}`);

    // Step 3: 调用工单取消接口
    const body = {
      applySource: 17,
      operator: '系统',
      operatorId: 1,
      operatorIdentity: 1,
      reasonId: 217,
      servOrderId,
      servWorkId
    };

    addLog('REQUEST', '提交取消', {
      url: 'currentConfig.aisBaseUrl/ratel-api/serv-work-general-agg/cancelApplyModifyRemoteService/submitCancelApply',
      body
    });

    const response = await fetch('currentConfig.aisBaseUrl/ratel-api/serv-work-general-agg/cancelApplyModifyRemoteService/submitCancelApply', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + authConfig.AK
      },
      body: JSON.stringify(body)
    });

    const xmlText = await response.text();
    addLog('RESPONSE', '取消响应', { xml: xmlText.substring(0, 500) });

    // 解析响应
    let success = false;
    let msg = '未知错误';
    try {
      const jsonResult = JSON.parse(xmlText);
      success = jsonResult.success === true;
      msg = jsonResult.msg || '未知错误';
    } catch (e) {
      const statusMatch = xmlText.match(/<status>(\d+)<\/status>/);
      const msgMatch = xmlText.match(/<msg>([^<]*)<\/msg>/);
      success = statusMatch && statusMatch[1] === '200';
      msg = msgMatch ? msgMatch[1] : '未知错误';
    }

    if (!success) {
      addLog('ERROR', `取消失败: ${msg}`);
      return { success: false, msg };
    }

    addLog('SUCCESS', `Skill5 完成: 取消成功`);
    return { success: true, msg };
  } catch (e) {
    addLog('ERROR', `Skill5 执行异常: ${e.message}`);
    throw e;
  }
}

// Skill 6: 创建跟单任务 (按 SKILL.md create-track-task 定义重写)
async function skill6_createTrackTask(trackWorkId, workId, taskItemId = 1202) {
  addLog('PROCESS', `开始执行 Skill6: 创建跟单任务`, {
    trackWorkId,
    workId,
    taskItemId
  });

  const authConfig = await loadAuthConfig('create-track-task');
  if (!authConfig) {
    addLog('ERROR', '认证配置加载失败');
    throw new Error('认证配置加载失败');
  }

  try {
    // Step 2: 调用创建接口（无需查询跟单详情）
    const createBody = {
      trackWorkId: trackWorkId,
      servWorkId: workId,
      taskItemId: taskItemId
    };

    addLog('REQUEST', '创建跟单任务', {
      url: `https://ais.xiujiadian.com/zmn-track-admin/amis/track/add/task`,
      body: createBody
    });

    const response = await fetch(`https://ais.xiujiadian.com/zmn-track-admin/amis/track/add/task`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + authConfig.AK
      },
      body: JSON.stringify(createBody)
    });

    const resultText = await response.text();
    addLog('RESPONSE', '创建响应', { text: resultText.substring(0, 500) });

    // XML 解析辅助函数
    const getXmlValue = (xml, tag) => {
      const match = xml.match(new RegExp(`<${tag}>([^<]*)</${tag}`));
      return match ? match[1] : '';
    };

    const status = getXmlValue(resultText, 'status');
    const msg = getXmlValue(resultText, 'msg');
    
    if (status === '0') {
      addLog('SUCCESS', `Skill6 完成: 创建成功`);
      return { success: true, msg: '创建成功' };
    } else {
      addLog('ERROR', `创建跟单任务失败: ${msg || '未知错误'}`);
      return { success: false, msg: msg || '未知错误' };
    }

  } catch (e) {
    addLog('ERROR', `Skill6 执行异常: ${e.message}`);
    throw e;
  }
}

// ==================== 主工作流 ====================
async function runWorkflow(trackWorkId, taskItemId = 1202, env = 'test') {
  log('========== 挂起任务工作流开始 ==========', 'info');
  log(`输入: trackWorkId=${trackWorkId}, taskItemId=${taskItemId}, env=${env}`, 'info');
  
  const steps = [];
  let currentStep = 0;
  let skill1Result = null; // 提前定义，兜底流程可以访问
  
  try {
    // Step 1: Skill1 - 获取录音文本
    currentStep++;
    steps.push({ step: currentStep, name: 'Skill1: 获取录音文本', status: 'running' });
    skill1Result = await skill1_getRecordText(trackWorkId, taskItemId);
    
    if (skill1Result.need_human_review) {
      steps[steps.length - 1] = { ...steps[steps.length - 1], status: 'failed' };
      throw new Error('录音文本获取失败');
    }
    
    steps[steps.length - 1] = { ...steps[steps.length - 1], status: 'completed', result: skill1Result };
    
    // Step 2: Skill2 - 意图识别
    // 无录音文本或无通话记录时，跳过意图识别，直接创建跟单
    let intentName;
    if (!skill1Result.voiceText || skill1Result.hasCallRecord === false) {
      addLog('INFO', '无通话记录或录音文本，跳过意图识别，直接创建跟单');
      intentName = 'price_query';
      steps.push({ step: currentStep + 1, name: 'Skill2: 意图识别', status: 'skipped', result: { reason: skill1Result.hasCallRecord === false ? '无通话记录' : '无录音文本' } });
    } else {
      currentStep++;
      steps.push({ step: currentStep, name: 'Skill2: 意图识别', status: 'running' });
      const skill2Result = await skill2_recognizeIntent(skill1Result.voiceText, skill1Result.detectRecordId);

      if (skill2Result.need_human_review || skill2Result.confidence < 0.75) {
        steps[steps.length - 1] = { ...steps[steps.length - 1], status: 'failed' };
        throw new Error('意图识别置信度低');
      }

      steps[steps.length - 1] = { ...steps[steps.length - 1], status: 'completed', result: skill2Result };
      intentName = skill2Result.intent_name;
    }
    
    // Step 3: 根据意图执行
    addLog('INFO', `意图分类: ${intentName}`);
    addLog('INFO', `意图分类: ${intentName}`);
    
    // Skill3: 跟单处理（所有分支都需要）
    currentStep++;
    steps.push({ step: currentStep, name: 'Skill3: 跟单处理', status: 'running' });
    const skill3Result = await skill3_handleTrack(skill1Result.workId, trackWorkId, intentName);
    steps[steps.length - 1] = { ...steps[steps.length - 1], status: 'completed', result: skill3Result };
    
    // Skill 4/5/6: 根据意图路由（四种）
    let finalResult;

    if (intentName === 'confirm_visit') {
      // 确认上门 → 改约
      currentStep++;
      steps.push({ step: currentStep, name: 'Skill4: 改约', status: 'running' });
      const skill4Result = await skill4_modifyDutyTime(trackWorkId);  // 传入 trackWorkId
      steps[steps.length - 1] = { ...steps[steps.length - 1], status: 'completed', result: skill4Result };
      finalResult = skill4Result;

    } else if (intentName === 'cancel') {
      // 取消 → 取消工单
      currentStep++;
      steps.push({ step: currentStep, name: 'Skill5: 取消', status: 'running' });
      const skill5Result = await skill5_cancelWork(trackWorkId);  // 传入 trackWorkId
      steps[steps.length - 1] = { ...steps[steps.length - 1], status: 'completed', result: skill5Result };
      finalResult = skill5Result;

    } else {
      // 用户询价 / 其他意图 → 创建跟单
      currentStep++;
      steps.push({ step: currentStep, name: 'Skill6: 生成跟单', status: 'running' });
      const skill6Result = await skill6_createTrackTask(trackWorkId, skill1Result.workId, skill1Result.taskItemId);  // 传入 trackWorkId + workId
      steps[steps.length - 1] = { ...steps[steps.length - 1], status: 'completed', result: skill6Result };
      finalResult = skill6Result;
    }
    
    addLog('SUCCESS', '========== 工作流执行完成 ==========');
    printSummary(true, null, null, steps);
    
    return {
      success: true,
      intent: intentName,
      steps,
      final_result: finalResult
    };
    
  } catch (error) {
    addLog('ERROR', `工作流执行异常: ${error.message}`);
    
    // 兜底流程：发生错误时，仍尝试执行 Skill3 和 Skill6
    addLog('INFO', '触发兜底流程...');
    
    try {
      // Skill3: 跟单处理
      currentStep++;
      steps.push({ step: currentStep, name: 'Skill3: 跟单处理(兜底)', status: 'running' });
      const skill3Result = await skill3_handleTrack(skill1Result?.workId, trackWorkId, 'price_query');
      steps[steps.length - 1] = { ...steps[steps.length - 1], status: 'completed', result: skill3Result };
      
      // Skill6: 创建跟单任务
      currentStep++;
      steps.push({ step: currentStep, name: 'Skill6: 生成跟单(兜底)', status: 'running' });
      const skill6Result = await skill6_createTrackTask(trackWorkId, skill1Result?.workId, taskItemId);
      steps[steps.length - 1] = { ...steps[steps.length - 1], status: 'completed', result: skill6Result };
      
      addLog('SUCCESS', '兜底流程执行完成');
      printSummary(true, null, null, steps);
      
      return {
        success: true,
        intent: 'price_query',
        fallback: true,
        steps,
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
        error: error.stack
      };
    }
  }
}

// ==================== 启动 ====================
const args = process.argv.slice(2);
const trackWorkId = args[0];
const taskItemId = args[1] || 1202; // 默认任务项ID为1202
// 将参数 '生产'/'prod' 映射为 'prod'，其他为测试
const rawEnv = args[2] || 'test';
globalEnv = (rawEnv === '生产' || rawEnv === 'prod') ? 'prod' : 'test';
const env = globalEnv;

console.log('\n========== 任务参数 ==========');
console.log(`▶ 跟单ID: ${trackWorkId}`);
console.log(`▶ 任务项ID: ${taskItemId}`);
console.log(`▶ 环境: ${env === 'prod' ? '生产' : '测试'}`);
console.log('================================\n');

const currentConfig = API_CONFIG[env] || API_CONFIG.test;
console.log(`[INFO] 使用 API: ${currentConfig.trackBaseUrl}`);

runWorkflow(trackWorkId, taskItemId, env)
  .then(result => {
    console.log('\n========== 执行结果 ==========');
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.success ? 0 : 1);
  })
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
