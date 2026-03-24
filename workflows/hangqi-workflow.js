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
async function loadAuthConfig(skillName) {
  const authPath = `${SKILLS_DIR}/${skillName}/.auth`;
  try {
    const fs = require('fs');
    const authContent = fs.readFileSync(authPath, 'utf8');
    const authConfig = {};
    authContent.split('\n').forEach(line => {
      const idx = line.indexOf('=');
      if (idx > 0) authConfig[line.substring(0, idx).trim()] = line.substring(idx + 1).trim();
    });
    return authConfig;
  } catch (e) {
    console.error(`加载认证失败: ${authPath}`, e.message);
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

// Skill 1: 获取录音 (真实 API)
async function skill1_getCallRecord(trackWorkId) {
  addLog('PROCESS', `开始执行 Skill1: 获取录音`, { trackWorkId });
  
  const authConfig = await loadAuthConfig('get-call-record');
  if (!authConfig) {
    addLog('ERROR', '认证配置加载失败');
    throw new Error('认证配置加载失败');
  }

  try {
    // Step 1: 查询工单号
    const listRequestBody = { trackWorkId };
    addLog('REQUEST', '查询工单号', { 
      url: 'https://test3-track.xiujiadian.com/amis/track/list',
      body: listRequestBody
    });

    const listRes = await fetch('https://test3-track.xiujiadian.com/amis/track/list', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + authConfig.AK
      },
      body: JSON.stringify(listRequestBody)
    });

    const listXml = await listRes.text();
    addLog('RESPONSE', '工单号查询响应', { xml: listXml.substring(0, 500) });

    const workIdMatch = listXml.match(/<workId>(\d+)<\/workId>/);
    
    if (!workIdMatch) {
      addLog('ERROR', '未找到工单号', { response: listXml.substring(0, 200) });
      return { need_human_review: true, workId: null };
    }
    
    const workId = workIdMatch[1];
    addLog('INFO', `找到工单号: ${workId}`);

    // Step 2: 查询通话录音
    addLog('REQUEST', '查询通话录音', { 
      url: `https://test3-admin.xiujiadian.com/bfm-serv-work/serv/work/listCallRecord?servWorkId=${workId}`
    });

    const recordRes = await fetch(`https://test3-admin.xiujiadian.com/bfm-serv-work/serv/work/listCallRecord?servWorkId=${workId}`, {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer ' + authConfig.AK
      }
    });

    const recordJson = await recordRes.json();
    addLog('RESPONSE', '通话录音查询响应', recordJson);
    
    if (recordJson.status !== 0 || !recordJson.data || recordJson.data.length === 0) {
      addLog('ERROR', '无通话记录', { response: recordJson });
      return { workId, need_human_review: true };
    }

    // 筛选工程师与用户的通话记录
    const validRecords = recordJson.data.filter(r => 
      (r.callTypeName === '工程师' && r.peerTypeName === '用户') ||
      (r.callTypeName === '用户' && r.peerTypeName === '工程师')
    );

    if (validRecords.length === 0) {
      addLog('ERROR', '无工程师与用户的通话记录', { response: recordJson });
      return { workId, need_human_review: true };
    }

    // 取最新一条
    validRecords.sort((a, b) => b.startTime - a.startTime);
    const latestRecord = validRecords[0];

    addLog('SUCCESS', `Skill1 完成: tapeUrl=${latestRecord.tapeUrl ? '有' : '无'}`, { 
      workId,
      hasAudio: !!latestRecord.tapeUrl 
    });
    
    return {
      workId,
      audio_url: latestRecord.tapeUrl || '',
      audio_text: latestRecord.remark || '',
      need_human_review: false
    };
  } catch (e) {
    addLog('ERROR', `Skill1 执行异常: ${e.message}`);
    throw e;
  }
}

// Skill 2: 意图识别 (真实 API)
async function skill2_recognizeIntent(audioText, audioUrl) {
  addLog('PROCESS', `开始执行 Skill2: 意图识别`, { audioUrl: audioUrl ? '有' : '无' });
  
  if (!audioUrl) {
    addLog('ERROR', '无录音URL');
    return { intent_name: 'other', confidence: 0, need_human_review: true };
  }

  try {
    const requestBody = { inputs: { recording: audioUrl } };
    addLog('REQUEST', '调用意图识别API', { 
      url: 'https://test-ai.xiujiadian.com/zmn-ai-workflow/v1/bce999b25b9b4a1dac1cd938b035aeac/execute_flow',
      body: requestBody
    });

    const response = await fetch('https://test-ai.xiujiadian.com/zmn-ai-workflow/v1/bce999b25b9b4a1dac1cd938b035aeac/execute_flow', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'ak': 'Bearer x76utyhsqdtirjcpp12sp9n2'
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
    const jsonMatch = runResultText.match(/```json\n([\s\S]*?)\n```/);
    const intentionData = jsonMatch ? JSON.parse(jsonMatch[1]) : (typeof runResultText === 'object' ? runResultText : {});
    
    addLog('INFO', '解析意图结果', intentionData);
    
    // 兼容大小写: confidence_score/Confidence_score
    const category = intentionData.intention?.category || '';
    const confidenceScore = intentionData.intention?.confidence_score || intentionData.intention?.Confidence_score || 0;
    
    // 映射到三种意图
    let intentName = 'other';
    if (category.includes('确认上门') || category.includes('确定上门') || category.includes('上门时间')) {
      intentName = 'confirm_visit';
    } else if (category.includes('不需要') || category.includes('取消') || category.includes('询价')) {
      intentName = 'price_or_cancel';
    }
    
    addLog('SUCCESS', `Skill2 完成: category=${category}, intent=${intentName}, confidence=${confidenceScore}`);
    return {
      intent_name: intentName,
      confidence: confidenceScore,
      need_human_review: confidenceScore < 0.75
    };
    
  } catch (e) {
    addLog('ERROR', `Skill2 执行异常: ${e.message}`);
    throw e;
  }
}

// Skill 0: 检查跟单状态
async function skill0_checkTrackStatus(trackWorkId) {
  addLog('PROCESS', `开始执行 Skill0: 检查跟单状态`, { trackWorkId });
  
  const authConfig = await loadAuthConfig('get-call-record');
  if (!authConfig) {
    addLog('ERROR', '认证配置加载失败');
    throw new Error('认证配置加载失败');
  }

  const requestBody = { trackWorkId };
  addLog('REQUEST', '查询跟单列表', { 
    url: 'https://test3-track.xiujiadian.com/amis/track/list',
    method: 'POST',
    body: requestBody
  });

  const response = await fetch('https://test3-track.xiujiadian.com/amis/track/list', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + authConfig.AK
    },
    body: JSON.stringify(requestBody)
  });

  const xmlText = await response.text();
  addLog('RESPONSE', '跟单列表响应', { xml: xmlText.substring(0, 500) });

  const statusMatch = xmlText.match(/<status>(\d+)<\/status>/);
  const statusNameMatch = xmlText.match(/<statusName>([^<]*)<\/statusName>/);
  const workIdMatch = xmlText.match(/<workId>(\d+)<\/workId>/);
  
  if (!statusMatch || statusMatch[1] !== '0') {
    addLog('WARNING', '查询跟单状态失败，使用默认值继续', { status: statusMatch?.[1], xml: xmlText.substring(0, 300) });
    return {
      status: '未知',
      statusName: '未知',
      workId: null,
      isCompleted: false
    };
  }
  
  const status = statusNameMatch ? statusNameMatch[1] : '未知';
  const workId = workIdMatch ? workIdMatch[1] : null;
  
  addLog('INFO', `跟单状态: ${status}`, { workId });
  
  return {
    status,
    statusName: status,
    workId,
    isCompleted: status === '已完结'
  };
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
    isCompleteTrack: 2
  };

  addLog('REQUEST', '提交跟单处理', { 
    url: 'https://test3-track.xiujiadian.com/amis/track/save/newHandle',
    body
  });

  const response = await fetch('https://test3-track.xiujiadian.com/amis/track/save/newHandle', {
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

// Skill 4: 改约（未实现）
async function skill4_modifyDutyTime(workId) {
  throw new Error('Skill4 改约功能未实现，请先实现实际API调用');
}

// Skill 5: 取消（未实现）
async function skill5_cancelWork(workId) {
  throw new Error('Skill5 取消工单功能未实现，请先实现实际API调用');
}

// Skill 6: 创建跟单任务（未实现）
async function skill6_createTrackTask(workId, intentName) {
  throw new Error('Skill6 创建跟单任务功能未实现，请先实现实际API调用');
}

// ==================== 主工作流 ====================
async function runWorkflow(trackWorkId) {
  log('========== 挂起任务工作流开始 ==========', 'info');
  log(`输入: trackWorkId=${trackWorkId}`, 'info');
  
  const steps = [];
  let currentStep = 0;
  
  try {
    // Step 0: 检查跟单状态（已跳过判断，无论状态都继续执行）
    currentStep++;
    steps.push({ step: currentStep, name: 'Skill0: 检查跟单状态', status: 'running' });
    let skill0Result = { workId: null, isCompleted: false };
    try {
      skill0Result = await skill0_checkTrackStatus(trackWorkId);
      steps[steps.length - 1] = { ...steps[steps.length - 1], status: 'completed', result: skill0Result };
      addLog('INFO', `跟单状态: ${skill0Result.status}`, { workId: skill0Result.workId });
    } catch (e) {
      steps[steps.length - 1] = { ...steps[steps.length - 1], status: 'failed', error: e.message };
      addLog('WARNING', '查询跟单状态失败，继续执行后续步骤', { error: e.message });
    }
    
    // Step 1: Skill1 - 获取录音
    currentStep++;
    steps.push({ step: currentStep, name: 'Skill1: 获取录音', status: 'running' });
    const skill1Result = await skill1_getCallRecord(trackWorkId);
    
    if (skill1Result.need_human_review) {
      steps[steps.length - 1] = { ...steps[steps.length - 1], status: 'failed' };
      throw new Error('录音获取失败');
    }
    
    steps[steps.length - 1] = { ...steps[steps.length - 1], status: 'completed', result: skill1Result };
    
    // Step 2: Skill2 - 意图识别
    currentStep++;
    steps.push({ step: currentStep, name: 'Skill2: 意图识别', status: 'running' });
    const skill2Result = await skill2_recognizeIntent(skill1Result.audio_text, skill1Result.audio_url);
    
    if (skill2Result.need_human_review || skill2Result.confidence < 0.75) {
      steps[steps.length - 1] = { ...steps[steps.length - 1], status: 'failed' };
      throw new Error('意图识别置信度低');
    }
    
    steps[steps.length - 1] = { ...steps[steps.length - 1], status: 'completed', result: skill2Result };
    
    // Step 3: 根据意图执行
    const intentName = skill2Result.intent_name;
    addLog('INFO', `意图分类: ${intentName}`);
    
    // Skill3: 跟单处理（所有分支都需要）
    currentStep++;
    steps.push({ step: currentStep, name: 'Skill3: 跟单处理', status: 'running' });
    const skill3Result = await skill3_handleTrack(skill1Result.workId, trackWorkId, intentName);
    steps[steps.length - 1] = { ...steps[steps.length - 1], status: 'completed', result: skill3Result };
    
    // Skill 4/5/6: 根据意图路由
    let finalResult;
    
    if (intentName === 'confirm_visit') {
      // 确认上门 → 改约
      currentStep++;
      steps.push({ step: currentStep, name: 'Skill4: 改约', status: 'running' });
      const skill4Result = await skill4_modifyDutyTime(skill1Result.workId);
      steps[steps.length - 1] = { ...steps[steps.length - 1], status: 'completed', result: skill4Result };
      finalResult = skill4Result;
      
    } else if (intentName === 'price_or_cancel') {
      // 用户询价/取消 → 取消
      currentStep++;
      steps.push({ step: currentStep, name: 'Skill5: 取消', status: 'running' });
      const skill5Result = await skill5_cancelWork(skill1Result.workId);
      steps[steps.length - 1] = { ...steps[steps.length - 1], status: 'completed', result: skill5Result };
      finalResult = skill5Result;
      
    } else {
      // 其他意图 → 创建跟单
      currentStep++;
      steps.push({ step: currentStep, name: 'Skill6: 生成跟单', status: 'running' });
      const skill6Result = await skill6_createTrackTask(skill1Result.workId, intentName);
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
    printSummary(false, `Step ${currentStep}`, error.message, steps);
    return {
      success: false,
      fail_at: `Step ${currentStep}`,
      fail_reason: error.message,
      steps,
      error: error.stack
    };
  }
}

// ==================== 启动 ====================
const args = process.argv.slice(2);
const trackWorkId = args[0];

if (!trackWorkId) {
  console.log('用法: node hangqi-workflow.js <trackWorkId>');
  console.log('示例: node hangqi-workflow.js 123456');
  process.exit(1);
}

runWorkflow(trackWorkId)
  .then(result => {
    console.log('\n========== 执行结果 ==========');
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.success ? 0 : 1);
  })
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
