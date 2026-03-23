/**
 * Skill1: 跟单处理
 * 统一公共处理节点
 */

module.exports = async function(params) {
  const { trackId, intentionContent, category } = params;

  // --------------------------
  // 这里实现公共处理逻辑：
  // 1. 驳回挂起申请
  // 2. 打印跟单日志
  // 3. 完结挂起跟单申请
  // --------------------------
  
  console.log(`[跟单处理] 跟单ID: ${trackId}, 分类: ${category}`);
  console.log(`[跟单处理] 意图内容: ${intentionContent}`);
  
  // 示例：打印日志（实际使用时替换为真实API调用）
  console.log(`[跟单处理] 已驳回挂起申请，完结挂起跟单记录`);

  return {
    success: true,
    trackId,
    message: '公共处理完成'
  };
}
