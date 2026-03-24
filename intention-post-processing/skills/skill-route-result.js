/**
 * Skill0: 路由结果
 * 核心路由判断节点，输出标准分类标签
 * 入参intentionContent已为识别好的枚举值：
 * type1=确认上门 | type2=用户询价 | type3=取消 | type4=其他意图
 */

module.exports = async function(params) {
  const { trackId, intentionContent } = params;

  // 直接映射枚举值到标准分类
  const categoryMap = {
    'type1': '确认上门',
    'type2': '用户询价',
    'type3': '取消',
    'type4': '其他意图'
  };

  const category = categoryMap[intentionContent] || '其他意图';

  return {
    trackId,
    category,
    intentionContent
  };
}
