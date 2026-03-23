/**
 * Skill2: 工单改约
 * 确认上门场景触发
 */

module.exports = async function(params) {
  const { trackId, intentionContent } = params;

  // --------------------------
  // 这里实现改约逻辑：
  // MVP规则：预约时间 = 当前日期 + 2天，09:00
  // --------------------------
  
  // 原生Date实现，无依赖
  const appointmentDate = new Date();
  appointmentDate.setDate(appointmentDate.getDate() + 2);
  appointmentDate.setHours(9, 0, 0, 0);
  
  // 格式化为 YYYY-MM-DD HH:mm:ss
  const appointmentTime = `${appointmentDate.getFullYear()}-${String(appointmentDate.getMonth() + 1).padStart(2, '0')}-${String(appointmentDate.getDate()).padStart(2, '0')} 09:00:00`;
  
  console.log(`[工单改约] 跟单ID: ${trackId}, 新预约时间: ${appointmentTime}`);
  
  // 示例：调用改约API（实际使用时替换为真实API调用）
  console.log(`[工单改约] 已执行工单改约操作，取消原因：用户确认上门`);

  return {
    success: true,
    trackId,
    appointmentTime,
    message: '工单改约完成'
  };
}
