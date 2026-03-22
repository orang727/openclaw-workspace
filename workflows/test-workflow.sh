#!/bin/bash
# 挂起任务工作流测试脚本
# 用于 Phase 0 离线验证

set -e

WORKSPACE_DIR=~/.openclaw/agents/main/workspace
WORKFLOW_FILE=$WORKSPACE_DIR/workflows/hangqi-task-workflow.lobster

echo "======================================"
echo "挂起任务 Lobster 工作流测试"
echo "======================================"
echo ""

# 检查 Lobster 工具是否可用
echo "🔍 检查 Lobster 工具..."
if command -v lobster &> /dev/null; then
    echo "✅ Lobster CLI 已安装"
    lobster --version
else
    echo "⚠️  Lobster CLI 未安装，尝试使用 OpenClaw 工具调用"
fi

echo ""
echo "📁 工作流文件位置：$WORKFLOW_FILE"
echo ""

# 检查工作流文件是否存在
if [ ! -f "$WORKFLOW_FILE" ]; then
    echo "❌ 工作流文件不存在：$WORKFLOW_FILE"
    exit 1
fi

echo "✅ 工作流文件存在"
echo ""

# 测试用例 1：确认上门场景
echo "======================================"
echo "测试用例 1：确认上门场景"
echo "======================================"
echo "输入：task_id=T001, work_order_id=WO123, audio_ref=audio_confirm"
echo "预期：工单改约，自动执行"
echo ""

# 测试用例 2：用户询价/取消场景
echo "======================================"
echo "测试用例 2：用户询价/取消场景"
echo "======================================"
echo "输入：task_id=T002, work_order_id=WO456, audio_ref=audio_cancel"
echo "预期：工单取消，需要审批"
echo ""

# 测试用例 3：其他意图场景
echo "======================================"
echo "测试用例 3：其他意图场景"
echo "======================================"
echo "输入：task_id=T003, work_order_id=WO789, audio_ref=audio_other"
echo "预期：生成跟单任务，自动执行"
echo ""

# 测试用例 4：录音获取失败场景
echo "======================================"
echo "测试用例 4：录音获取失败场景"
echo "======================================"
echo "输入：task_id=T004, work_order_id=WO999, audio_ref=audio_not_found"
echo "预期：转人工复核"
echo ""

echo "======================================"
echo "测试准备完成"
echo "======================================"
echo ""
echo "下一步："
echo "1. 在 OpenClaw 配置中启用 lobster 和 llm-task 工具"
echo "2. 使用以下 JSON 调用工作流："
echo ""
cat << 'EOF'
{
  "action": "run",
  "pipeline": "~/.openclaw/agents/main/workspace/workflows/hangqi-task-workflow.lobster",
  "argsJson": "{\"task_id\":\"T001\",\"work_order_id\":\"WO123\",\"audio_ref\":\"audio_confirm\"}",
  "timeoutMs": 60000
}
EOF
echo ""
echo "3. 观察输出结果，验证是否符合预期"
echo ""
