#!/usr/bin/env node
/**
 * SKILL 与 Workflow API 一致性检查 - CI/CD 入口
 *
 * 用法:
 *   node index.js                      # 控制台输出
 *   node index.js --json               # JSON 格式输出
 *   node index.js --markdown           # Markdown 格式报告
 *   node index.js --verbose            # 详细输出
 *   node index.js --only-errors        # 只显示错误
 *
 * 在 CI/CD 中集成:
 *   node index.js --json > report.json
 */

const path = require('path');
const { checkConsistency, generateJsonReport, generateMarkdownReport } = require('./consistency-checker');

// 解析命令行参数
const args = process.argv.slice(2);
const options = {
  verbose: args.includes('--verbose') || args.includes('-v'),
  outputFormat: args.includes('--json') ? 'json' : args.includes('--markdown') ? 'markdown' : 'console',
  onlyErrors: args.includes('--only-errors')
};

// 路径配置
const SKILLS_DIR = path.join(__dirname, '..', '..', 'skills');
const WORKFLOWS_DIR = path.join(__dirname, '..', '..', 'workflows');

// 运行检查
const results = checkConsistency(SKILLS_DIR, WORKFLOWS_DIR, options);

// 根据格式输出
switch (options.outputFormat) {
  case 'json':
    console.log(generateJsonReport(results));
    break;
  case 'markdown':
    console.log(generateMarkdownReport(results));
    break;
  // console 格式已在 checkConsistency 中输出
}

// 退出码
if (results.summary?.failed > 0) {
  process.exit(1);
} else if (results.summary?.warnings > 0) {
  process.exit(2); // 警告不算失败，但需要特殊处理
} else {
  process.exit(0);
}
