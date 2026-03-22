#!/usr/bin/env node
/**
 * Token 用量估算工具
 * 
 * 估算规则：
 * - 英文/数字：1 token ≈ 4 字符
 * - 中文：1 token ≈ 0.75 汉字（即 1 汉字 ≈ 1.33 tokens）
 */

// 上次执行的输入数据
const input = {
    recording: "https://zmn-xno.oss-cn-beijing.aliyuncs.com/test3/2026/03/18/15/3_CHB2603181522370A21184110293381.mp3",
    dataMap: "127212650091091585"
};

// 上次执行的输出数据（意图识别结果）
const output = `
{
  "intention": {
    "category": "用户表示不需要服务",
    "confidence": "高",
    "confidence_score": 0.95
  },
  "reasoning": {
    "overall_analysis": "综合分析：对话内容为空数组（[]），即无任何有效对话片段；结合场景参数'127212650091091585'（经行业知识解析，该 ID 为啄木鸟平台内部工单号，格式符合已关闭/作废工单特征），且 ASR 转写结果为空，高度指向该工单已被用户主动取消、服务终止或系统判定无效。在维修服务流程中，空对话常见于用户拨打后立即挂断、未开口说话即离线，或接通后明确拒绝服务但 ASR 未能捕获（如仅说'不用了'后挂机）。根据意图分类体系，'用户表示不需要服务'涵盖'已放弃维修、自行解决或明确终止需求'等情形，空对话是最强否定信号，优先于其他需依赖文本推断的意图。",
    "key_evidence": [
      {
        "index": -1,
        "speaker": "N/A",
        "original_text": "",
        "corrected_understanding": "【ASR 缺失】全量对话为空，表明无有效语音输入或用户未进行任何陈述；非技术故障（因场景参数存在且格式合法），故排除 ASR 系统崩溃，更符合用户零交互即退出服务流程的行为模式",
        "supporting_role": "决定性反证：空对话是'用户未表达任何服务诉求'的最直接证据，与所有正向意图（如询价、确认时间、咨询）互斥，唯一兼容的意图是服务被主动放弃或拒绝"
      },
      {
        "index": -2,
        "speaker": "N/A",
        "original_text": "127212650091091585",
        "corrected_understanding": "【参数语义解析】该 16 位数字为啄木鸟标准工单 ID（前缀 1272 为区域 + 业务编码，末段 091585 为序列号），经查平台规则，此类 ID 若关联空对话，98.7% 对应'用户取消订单'或'未接通/未发言自动关单'状态（内部数据统计）",
        "supporting_role": "场景强化证据：有效工单 ID 存在但无对话，说明工单已生成但服务未启动，符合'用户表示不需要服务'中'已发起但主动终止'的子情形"
      }
    ]
  }
}
`;

// Token 估算函数
function estimateTokens(text) {
    // 分离中英文
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const englishChars = (text.match(/[a-zA-Z0-9]/g) || []).length;
    const otherChars = text.length - chineseChars - englishChars;
    
    // 估算规则
    const chineseTokens = chineseChars * 1.33;  // 1 汉字 ≈ 1.33 tokens
    const englishTokens = englishChars / 4;     // 4 英文字符 ≈ 1 token
    const otherTokens = otherChars / 4;         // 符号按英文算
    
    return {
        chineseChars,
        englishChars,
        otherChars,
        totalChars: text.length,
        estimatedTokens: Math.round(chineseTokens + englishTokens + otherTokens)
    };
}

// 计算输入 token
const inputJson = JSON.stringify(input);
const inputStats = estimateTokens(inputJson);

// 计算输出 token
const outputStats = estimateTokens(output);

// 打印结果
console.log('═══════════════════════════════════════════════════════════');
console.log('📊 Token 用量估算报告');
console.log('═══════════════════════════════════════════════════════════');
console.log('');
console.log('【输入】Intent Analysis API');
console.log('───────────────────────────────────────────────────────────');
console.log(`  录音 URL: ${input.recording}`);
console.log(`  跟单 ID:  ${input.dataMap}`);
console.log('');
console.log(`  中文字符：${inputStats.chineseChars}`);
console.log(`  英文/数字：${inputStats.englishChars}`);
console.log(`  其他字符：${inputStats.otherChars}`);
console.log(`  总字符数：${inputStats.totalChars}`);
console.log(`  估算 Token: ${inputStats.estimatedTokens}`);
console.log('');
console.log('【输出】Intent Analysis Result');
console.log('───────────────────────────────────────────────────────────');
console.log(`  中文字符：${outputStats.chineseChars}`);
console.log(`  英文/数字：${outputStats.englishChars}`);
console.log(`  其他字符：${outputStats.otherChars}`);
console.log(`  总字符数：${outputStats.totalChars}`);
console.log(`  估算 Token: ${outputStats.estimatedTokens}`);
console.log('');
console.log('【合计】');
console.log('───────────────────────────────────────────────────────────');
console.log(`  输入 Token:  ${inputStats.estimatedTokens}`);
console.log(`  输出 Token:  ${outputStats.estimatedTokens}`);
console.log(`  总 Token:    ${inputStats.estimatedTokens + outputStats.estimatedTokens}`);
console.log('═══════════════════════════════════════════════════════════');
console.log('');
console.log('💡 说明：');
console.log('   - 中文：1 汉字 ≈ 1.33 tokens');
console.log('   - 英文/数字：4 字符 ≈ 1 token');
console.log('   - 实际用量以 API 提供商统计为准');
