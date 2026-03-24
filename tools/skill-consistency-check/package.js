/**
 * SKILL ↔ Workflow API 一致性检查工具
 *
 * 用于确保 SKILL.md 中定义的 API 与 workflow.js 中实际调用的 API 保持一致。
 *
 * 使用方法:
 *
 * 1. 本地运行:
 *    node index.js
 *    node index.js --verbose
 *    node index.js --json > report.json
 *
 * 2. CI/CD 集成 (GitHub Actions):
 *    - 添加 .github/workflows/skill-check.yml
 *    - 每次 PR/Merge 时自动运行检查
 *
 * 3. Git Hooks:
 *    - 添加 pre-commit hook
 *    - 每次提交前自动检查
 */

const { SKILL_TO_FUNCTION_MAP } = require('./consistency-checker');

// 导出映射表供外部使用
module.exports.SKILL_TO_FUNCTION_MAP = SKILL_TO_FUNCTION_MAP;
