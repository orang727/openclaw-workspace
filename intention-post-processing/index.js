/**
 * 意图后处理工作流 (MVP)
 * 基于openClaw实现挂起跟单场景自动化处理
 */

const http = require('http');
const url = require('url');

// 配置信息
const CONFIG = {
  gateway: 'http://localhost:3001', // 你的真实workflow-server地址
  skills: {
    route: 'skill-route-result',
    trackHandle: 'handle-track-work',
    modifyDuty: 'modify-duty-time',
    cancelWork: 'cancel-work',
    createTrack: 'create-track-task'
  }
}

/**
 * 调用Skill（本地直接调用，无依赖，真实执行技能逻辑）
 * @param {string} skillName 技能名称
 * @param {object} params 输入参数
 */
async function callSkill(skillName, params) {
  try {
    // 直接加载本地部署的真实技能文件
    const skill = require(`C:/Users/admin/.openclaw/skills/${skillName}/index.js`);
    const result = await skill(params);
    return result;
  } catch (error) {
    console.error(`调用Skill ${skillName} 失败:`, error.message);
    throw error;
  }
}

/**
 * 主流程入口
 * @param {object} input 输入参数
 * @param {string} input.trackId 跟单ID
 * @param {string} input.intentionContent 意图识别内容（type1-type4）
 */
async function main(input) {
  const { trackId, intentionContent } = input;
  console.log('='.repeat(80));
  console.log('🚀 意图后处理工作流启动');
  console.log('='.repeat(80));
  console.log('【全局入参】');
  console.log('跟单ID:', trackId);
  console.log('意图识别内容:', intentionContent);
  console.log('');

  try {
    // 1. 调用Skill0: 路由结果
    console.log('【节点1】Skill0: 路由结果');
    const routeInput = { trackId, intentionContent };
    console.log('输入:', JSON.stringify(routeInput, null, 2));
    const routeResult = await require('./skills/skill-route-result')(routeInput);
    console.log('输出:', JSON.stringify(routeResult, null, 2));
    console.log('');

    // 2. 调用Skill1: 统一跟单处理
    console.log('【节点2】Skill1: 跟单处理 (handle-track-work)');
    const trackHandleInput = { trackId, intentionContent, category: routeResult.category };
    console.log('输入:', JSON.stringify(trackHandleInput, null, 2));
    const trackHandleResult = await callSkill(CONFIG.skills.trackHandle, trackHandleInput);
    console.log('输出:', JSON.stringify(trackHandleResult, null, 2));
    console.log('');

    // 3. 分支处理
    console.log('【分支判断】路由分类:', routeResult.category);
    let businessResult = null;
    switch (routeResult.category) {
      case '确认上门':
        console.log('【节点3】Skill2: 工单改约 (modify-duty-time)');
        const modifyInput = { trackId, intentionContent };
        console.log('输入:', JSON.stringify(modifyInput, null, 2));
        businessResult = await callSkill(CONFIG.skills.modifyDuty, modifyInput);
        console.log('输出:', JSON.stringify(businessResult, null, 2));
        break;
      
      case '用户询价':
      case '取消':
        console.log('【节点3】Skill3: 工单取消 (cancel-work)');
        const cancelInput = { trackId, intentionContent };
        console.log('输入:', JSON.stringify(cancelInput, null, 2));
        businessResult = await callSkill(CONFIG.skills.cancelWork, cancelInput);
        console.log('输出:', JSON.stringify(businessResult, null, 2));
        break;
      
      case '其他意图':
        console.log('【节点3】Skill4: 生成跟单任务 (create-track-task)');
        const createInput = { trackId, intentionContent };
        console.log('输入:', JSON.stringify(createInput, null, 2));
        businessResult = await callSkill(CONFIG.skills.createTrack, createInput);
        console.log('输出:', JSON.stringify(businessResult, null, 2));
        break;
      
      default:
        throw new Error(`未知路由分类: ${routeResult.category}`);
    }
    console.log('');

    console.log('='.repeat(80));
    console.log('✅ 工作流执行完成');
    console.log('='.repeat(80));
    return {
      success: true,
      trackId,
      category: routeResult.category,
      routeResult,
      trackHandleResult,
      businessResult
    };

  } catch (error) {
    console.log('');
    console.log('='.repeat(80));
    console.error('❌ 工作流执行失败:', error.message);
    console.log('='.repeat(80));
    return {
      success: false,
      trackId,
      error: error.message
    };
  }
}

// 命令行调用入口
if (require.main === module) {
  const input = JSON.parse(process.argv[2]);
  main(input).then(result => {
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.success ? 0 : 1);
  });
}

module.exports = main;
