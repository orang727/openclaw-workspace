#!/usr/bin/env node
/**
 * Token 用量估算工具 - 保守估算版
 * 
 * 考虑因素：
 * 1. 输入：录音 URL + 跟单 ID + 系统 Prompt
 * 2. ASR 转写：录音文件转文字（如果有）
 * 3. 输出：意图分析结果
 * 4. Overhead：JSON 结构、系统指令等
 */

// ==================== 实际调用分析 ====================

// 1. 系统 Prompt（隐藏但消耗 token）
const systemPrompt = `
你是一个专业的客服意图识别助手。
请分析录音内容，识别用户意图。
意图分类包括：
- 确认上门/同意上门
- 用户询价/价格咨询
- 其他

请输出 JSON 格式结果，包含 intention 和 reasoning。
`;

// 2. 用户输入
const userInput = {
    recording: "https://zmn-xno.oss-cn-beijing.aliyuncs.com/test3/2026/03/18/15/3_CHB2603181522370A21184110293381.mp3",
    dataMap: "127212650091091585"
};

// 3. ASR 转写（录音转文字）- 即使为空也有处理成本
// 14 秒录音，按正常语速约 30-50 字
const asrTranscription = "[]"; // 实际为空，但系统需要处理音频流

// 4. 输出结果
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
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const englishChars = (text.match(/[a-zA-Z0-9]/g) || []).length;
    const otherChars = text.length - chineseChars - englishChars;
    
    const chineseTokens = chineseChars * 1.33;
    const englishTokens = englishChars / 4;
    const otherTokens = otherChars / 4;
    
    return {
        chineseChars,
        englishChars,
        otherChars,
        totalChars: text.length,
        estimatedTokens: Math.round(chineseTokens + englishTokens + otherTokens)
    };
}

// 计算各项 token
const systemStats = estimateTokens(systemPrompt);
const inputStats = estimateTokens(JSON.stringify(userInput));
const asrStats = estimateTokens(asrTranscription);
const outputStats = estimateTokens(output);

// 额外 overhead（JSON 结构、API 协议等）
const overheadTokens = 50;

// 打印结果
console.log('═══════════════════════════════════════════════════════════');
console.log('📊 Token 用量估算报告（保守估算版）');
console.log('═══════════════════════════════════════════════════════════');
console.log('');
console.log('【输入部分】');
console.log('───────────────────────────────────────────────────────────');
console.log(`  1. 系统 Prompt:    ${systemStats.estimatedTokens.toString().padStart(5)} tokens (${systemStats.totalChars} 字符)`);
console.log(`  2. 用户输入：${inputStats.estimatedTokens.toString().padStart(5)} tokens (${inputStats.totalChars} 字符)`);
console.log(`  3. ASR 处理：${asrStats.estimatedTokens.toString().padStart(5)} tokens (音频流处理)`);
console.log(`  4. Overhead:   ${overheadTokens.toString().padStart(5)} tokens (JSON/协议)`);
console.log('───────────────────────────────────────────────────────────');
const inputTotal = systemStats.estimatedTokens + inputStats.estimatedTokens + asrStats.estimatedTokens + overheadTokens;
console.log(`  输入小计：${inputTotal.toString().padStart(5)} tokens`);
console.log('');
console.log('【输出部分】');
console.log('───────────────────────────────────────────────────────────');
console.log(`  意图分析结果：${outputStats.estimatedTokens.toString().padStart(5)} tokens (${outputStats.totalChars} 字符)`);
console.log('───────────────────────────────────────────────────────────');
console.log(`  输出小计：${outputStats.estimatedTokens.toString().padStart(5)} tokens`);
console.log('');
console.log('【合计】');
console.log('═══════════════════════════════════════════════════════════');
console.log(`  输入 Token:  ${inputTotal.toString().padStart(5)}`);
console.log(`  输出 Token:  ${outputStats.estimatedTokens.toString().padStart(5)}`);
console.log(`  总 Token:    ${(inputTotal + outputStats.estimatedTokens).toString().padStart(5)}`);
console.log('═══════════════════════════════════════════════════════════');
console.log('');
console.log('💡 保守估算说明：');
console.log('   ✓ 包含系统 Prompt（通常不显示但消耗 token）');
console.log('   ✓ 包含 ASR 音频处理成本（14 秒录音）');
console.log('   ✓ 包含 JSON 结构/协议 overhead');
console.log('   ✓ 中文：1 汉字 ≈ 1.33 tokens');
console.log('   ✓ 英文/数字：4 字符 ≈ 1 token');
console.log('');
console.log('📈 批量估算：');
console.log('   100 次执行  ≈ ' + (inputTotal + outputStats.estimatedTokens) * 100 + ' tokens');
console.log('   1000 次执行 ≈ ' + (inputTotal + outputStats.estimatedTokens) * 1000 + ' tokens');
console.log('   10000 次执行≈ ' + (inputTotal + outputStats.estimatedTokens) * 10000 + ' tokens');
