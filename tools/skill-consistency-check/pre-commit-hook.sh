#!/bin/sh
# pre-commit hook for SKILL Workflow Consistency Check
# 将此文件复制到 .git/hooks/pre-commit 并添加执行权限

echo "🔍 Running SKILL Workflow Consistency Check..."

cd "$(git rev-parse --show-toplevel)"

# 检查是否有修改的 SKILL 或 Workflow 文件
SKILL_CHANGED=$(git diff --cached --name-only | grep -E "workspace/skills/.*SKILL.md$" | wc -l)
WORKFLOW_CHANGED=$(git diff --cached --name-only | grep -E "workspace/workflows/.*\.js$" | wc -l)

if [ "$SKILL_CHANGED" -gt 0 ] || [ "$WORKFLOW_CHANGED" -gt 0 ]; then
    echo "📝 检测到修改的 SKILL 或 Workflow 文件，运行一致性检查..."

    node tools/skill-consistency-check/index.js --verbose

    if [ $? -ne 0 ]; then
        echo ""
        echo "❌ 一致性检查失败！"
        echo "请修复 SKILL.md 和 workflow.js 中的不一致问题后再提交。"
        exit 1
    fi

    echo "✅ 一致性检查通过"
else
    echo "ℹ️  未检测到 SKILL 或 Workflow 文件的修改，跳过检查"
fi

exit 0
