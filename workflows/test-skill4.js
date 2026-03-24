// 单独测试 Skill4: 生成跟单任务
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

async function skill4_createTrackTask() {
  const trackWorkId = '127320778006697601';
  const workId = '6127320770546056321';
  const taskItemId = '1202';
  
  const authConfig = await loadAuthConfig('create-track-task');
  if (!authConfig) {
    console.log('❌ 认证配置加载失败');
    return;
  }
  
  console.log('========== Skill4: 生成跟单任务 测试 ==========');
  
  console.log('入参:');
  console.log('  - workId:', workId);
  console.log('  - sourceTrackId:', trackWorkId);
  console.log('  - bizId:', taskItemId);
  console.log('  - taskItemId:', taskItemId);
  console.log('  - bizSource: 11');
  console.log('  - content: 自动生成：用户询价');
  console.log('  - level: 2');
  
  const body = {
    workId: workId,
    sourceTrackId: trackWorkId,
    bizId: taskItemId,
    taskItemId: taskItemId,
    bizSource: 11,
    content: "自动生成：用户询价",
    level: 2
  };
  
  console.log('\n请求体:', JSON.stringify(body, null, 2));
  
  try {
    const response = await fetch('https://test-ais.xiujiadian.com/ratel-api/biz-twd/trackTaskModifyRemoteService/addTrackTask', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + authConfig.AK
      },
      body: JSON.stringify(body)
    });
    
    const resultText = await response.text();
    console.log('\n出参:', resultText);
    
    try {
      const result = JSON.parse(resultText);
      console.log('\n解析结果:', JSON.stringify(result, null, 2));
    } catch (e) {
      console.log('解析失败:', e.message);
    }
  } catch (e) {
    console.log('❌ 请求失败:', e.message);
  }
}

skill4_createTrackTask();
