/**
 * 意图路由技能
 * 直接接收跟单ID和预设意图类型，输出标准路由结果
 * 不调用意图识别API，仅做路由映射
 * 
 * 用法: node intent-router.js <trackWorkId> <intentType>
 * 
 * intentType 枚举:
 *   type1 = 确认上门
 *   type2 = 用户询价 → 路由为"取消"
 *   type3 = 取消 → 路由为"取消"
 *   type4 = 其他意图
 */

const fs = require('fs');
const path = require('path');

const SKILLS_DIR = 'C:/Users/admin/.openclaw/workspace/skills';

// 路由映射表
const ROUTE_MAP = {
  'type1': '确认上门',
  'type2': '取消',
  'type3': '取消',
  'type4': '其他意图'
};

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
    console.error('加载认证失败:', e.message);
    return null;
  }
}

async function runIntentRouter(trackWorkId, intentType) {
  console.log('🔄 意图路由技能开始执行');
  console.log('输入参数:', { trackWorkId, intentType });

  // Step 1: 参数校验
  if (!trackWorkId) {
    throw new Error('缺少必填参数: trackWorkId');
  }
  if (!intentType) {
    throw new Error('缺少必填参数: intentType');
  }
  if (!ROUTE_MAP[intentType]) {
    throw new Error(`无效的intentType: ${intentType}，可选值: type1, type2, type3, type4`);
  }

  // Step 2: 查询跟单信息，获取工单号
  const authConfig = await loadAuthConfig('intent-router');
  if (!authConfig) {
    throw new Error('认证配置加载失败');
  }

  console.log('📤 查询跟单信息...');
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
  const statusNameMatch = xmlText.match(/<statusName>([^<]*)<\/statusName>/);
  
  const workId = workIdMatch ? workIdMatch[1] : null;
  const statusName = statusNameMatch ? statusNameMatch[1] : '未知';

  console.log('📥 跟单信息:', { workId, statusName });

  // Step 3: 路由映射
  const routeResult = ROUTE_MAP[intentType];
  console.log('🗺️ 路由映射:', { intentType, routeResult });

  // Step 4: 返回结果
  const result = {
    trackWorkId,
    workId,
    statusName,
    intentType,
    routeResult,
    success: true
  };

  console.log('✅ 路由结果:', result);
  return result;
}

// 入口
if (require.main === module) {
  const trackWorkId = process.argv[2];
  const intentType = process.argv[3];

  if (!trackWorkId || !intentType) {
    console.log('用法: node intent-router.js <trackWorkId> <intentType>');
    console.log('示例: node intent-router.js 127325663565551233 type1');
    console.log('');
    console.log('intentType 枚举:');
    console.log('  type1 = 确认上门');
    console.log('  type2 = 用户询价');
    console.log('  type3 = 取消');
    console.log('  type4 = 其他意图');
    process.exit(1);
  }

  runIntentRouter(trackWorkId, intentType)
    .then(result => {
      console.log('\n========== 执行结果 ==========');
      console.log(JSON.stringify(result, null, 2));
      process.exit(0);
    })
    .catch(e => {
      console.error('❌ 执行失败:', e.message);
      process.exit(1);
    });
}

module.exports = { runIntentRouter, ROUTE_MAP };
