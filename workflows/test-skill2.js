// 单独测试 Skill2: 工单改约
const fs = require('fs');
const SKILLS_DIR = 'C:/Users/admin/.openclaw/workspace/skills';

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
    console.log('加载认证失败:', e.message);
    return null;
  }
}

async function skill2_modifyDuty() {
  const trackWorkId = '127320778006697601';
  
  // 先获取 workId
  const authConfig = await loadAuthConfig('get-call-record');
  if (!authConfig) {
    console.log('❌ 认证配置加载失败');
    return;
  }
  
  console.log('========== Skill2: 工单改约 测试 ==========');
  console.log('Step 1: 查询工单号...');
  console.log('入参: trackWorkId =', trackWorkId);
  
  const response = await fetch('https://test3-track.xiujiadian.com/amis/track/list', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + authConfig.AK
    },
    body: JSON.stringify({ trackWorkId })
  });
  
  const responseText = await response.text();
  console.log('出参: 跟单列表响应 =', responseText.substring(0, 500));
  
  let workId = null;
  try {
    const data = JSON.parse(responseText);
    if (data.status === 0 && data.data && data.data.items && data.data.items.length > 0) {
      workId = data.data.items[0].workId;
      console.log('✅ 成功获取工单号:', workId);
    } else {
      console.log('⚠️ 未找到工单, msg:', data.msg);
    }
  } catch (e) {
    console.log('❌ 解析响应失败:', e.message);
  }
  
  if (!workId) {
    console.log('❌ 无法获取 workId，无法执行 Skill2');
    return { success: false, error: '无法获取 workId' };
  }
  
  // Step 2: 工单改约
  console.log('\nStep 2: 执行工单改约...');
  const modifyAuth = await loadAuthConfig('modify-duty-time');
  if (!modifyAuth) {
    console.log('❌ 认证配置加载失败');
    return;
  }
  
  const now = new Date();
  now.setDate(now.getDate() + 2);
  now.setHours(9, 0, 0, 0);
  const appointmentTime = now.toISOString().replace('T', ' ').substring(0, 19);
  
  console.log('入参:');
  console.log('  - servWorkId:', workId);
  console.log('  - appointmentTime:', appointmentTime);
  console.log('  - modifySource: 11');
  
  const body = {
    servWorkId: workId,
    appointmentTime: appointmentTime,
    modifySource: 11
  };
  
  const modifyResponse = await fetch('https://test3-admin.xiujiadian.com/bfm-serv-work/serv/work/modifyAppointmentTime', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + modifyAuth.AK
    },
    body: JSON.stringify(body)
  });
  
  const resultText = await modifyResponse.text();
  console.log('出参:', resultText);
  
  let result = null;
  try {
    result = JSON.parse(resultText);
    console.log('解析结果:', JSON.stringify(result, null, 2));
  } catch (e) {
    console.log('❌ 解析失败:', e.message);
  }
  
  return { success: result?.status === 0, result };
}

skill2_modifyDuty().then(r => {
  console.log('\n========== 执行完成 ==========');
  console.log(JSON.stringify(r, null, 2));
});
