/**
 * Skill3: 工单取消
 * 用户询价/取消、取消场景触发
 */

module.exports = async function(params) {
  const { trackId, intentionContent } = params;

  // --------------------------
  // 这里实现取消逻辑：
  // MVP规则：取消原因 = 用户不需要了
  // --------------------------
  
  const cancelReason = '用户不需要了';
  
  console.log(`[工单取消] 跟单ID: ${trackId}, 取消原因: ${cancelReason}`);
  
  // 示例：调用取消API（实际使用时替换为真实API调用）
  console.log(`[工单取消] 已执行工单取消操作`);

  return {
    success: true,
    trackId,
    cancelReason,
    message: '工单取消完成'
  };
}
