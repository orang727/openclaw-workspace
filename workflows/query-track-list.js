// 获取跟单列表
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

async function queryTrackList() {
  const authConfig = await loadAuthConfig('get-call-record');
  if (!authConfig) {
    console.log('❌ 认证配置加载失败');
    return;
  }
  
  console.log('========== 获取跟单列表 ==========');
  
  // 入参
  const trackContentId = 1101;
  const trackStatus = 1;
  const startTime = '2026-03-23';
  const endTime = '2026-03-23';
  
  console.log('入参:');
  console.log('  - trackContentId:', trackContentId);
  console.log('  - trackStatus:', trackStatus);
  console.log('  - 发起时间:', startTime + ' ~ ' + endTime);
  
  const body = {
    trackContentId: trackContentId,
    trackStatus: trackStatus,
    startTime: startTime,
    endTime: endTime
  };
  
  console.log('请求体:', JSON.stringify(body, null, 2));
  
  try {
    const response = await fetch('https://test3-track.xiujiadian.com/amis/track/list', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + authConfig.AK
      },
      body: JSON.stringify(body)
    });
    
    const responseText = await response.text();
    
    // 解析 XML 获取 items
    const itemsMatch = responseText.match(/<items>([\s\S]*?)<\/items>/g);
    
    console.log('\n========== 出参 ==========');
    console.log('原始响应 (前500字符):', responseText.substring(0, 500));
    
    // 解析每条跟单记录
    if (itemsMatch) {
      console.log('\n找到', itemsMatch.length, '条跟单记录:');
      
      itemsMatch.slice(0, 10).forEach((item, idx) => {
        const trackWorkId = item.match(/<trackWorkId>(\d+)<\/trackWorkId>/)?.[1] || '-';
        const statusName = item.match(/<statusName>([^<]*)<\/statusName>/)?.[1] || '-';
        const trackContent = item.match(/<trackContent>([^<]*)<\/trackContent>/)?.[1] || '-';
        const trackTypeName = item.match(/<trackTypeName>([^<]*)<\/trackTypeName>/)?.[1] || '-';
        const createTime = item.match(/<createTime>(\d+)<\/createTime>/)?.[1] || '-';
        
        console.log(`\n--- 跟单 ${idx + 1} ---`);
        console.log('  跟单ID:', trackWorkId);
        console.log('  跟单内容:', trackContent);
        console.log('  跟单类型:', trackTypeName);
        console.log('  状态:', statusName);
        console.log('  创建时间:', createTime);
      });
    }
  } catch (e) {
    console.log('❌ 请求失败:', e.message);
  }
}

queryTrackList();
