# 挂起任务工作流使用指南

> 基于 Lobster 工作流引擎  
> 版本：1.0  
> 创建时间：2026-03-16

---

## 快速开始

### 1. 启用 Lobster 工具

在 OpenClaw 配置中添加：

```json
{
  "tools": {
    "alsoAllow": ["lobster", "llm-task"]
  }
}
```

或在 agent 级别配置：

```json
{
  "agents": {
    "list": [
      {
        "id": "main",
        "tools": {
          "alsoAllow": ["lobster", "llm-task"]
        }
      }
    ]
  }
}
```

### 2. 安装 Lobster CLI

确保 `lobster` 命令在 PATH 中：

```bash
# 检查是否已安装
which lobster

# 如果未安装，参考 https://github.com/openclaw/lobster
```

---

## 工作流文件

### 文件位置
```
~/.openclaw/agents/main/workspace/workflows/hangqi-task-workflow.lobster
```

### 运行工作流

#### 方式 1：通过 Lobster 工具调用

```json
{
  "action": "run",
  "pipeline": "~/.openclaw/agents/main/workspace/workflows/hangqi-task-workflow.lobster",
  "argsJson": "{\"task_id\":\"T001\",\"work_order_id\":\"WO123\",\"audio_ref\":\"audio_456\"}",
  "timeoutMs": 60000
}
```

#### 方式 2：命令行直接运行

```bash
lobster run --mode tool ~/.openclaw/agents/main/workspace/workflows/hangqi-task-workflow.lobster \
  --args-json '{"task_id":"T001","work_order_id":"WO123","audio_ref":"audio_456"}'
```

---

## 工作流参数

| 参数 | 类型 | 必填 | 说明 | 示例 |
|------|------|------|------|------|
| task_id | string | ✅ | 任务 ID | T001 |
| work_order_id | string | ✅ | 工单号 | WO123 |
| audio_ref | string | ✅ | 录音引用 ID | audio_456 |
| confidence_threshold | number | ❌ | 置信度阈值（默认 0.75） | 0.75 |

---

## 工作流执行流程

```
┌─────────────────────────────────────────────────────────────────┐
│                     挂起任务工作流                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  阶段 A：理解与路由                                              │
│  ┌────────────────┐                                            │
│  │ Skill 1        │ 获取录音文件                                │
│  │ - audio_fetch  │ 输入：task_id, work_order_id, audio_ref    │
│  │                │ 输出：audio_file_id, audio_text, status    │
│  └────────┬───────┘                                            │
│           ↓                                                     │
│  ┌────────────────┐                                            │
│  │ Skill 2        │ 意图识别（3 类）                             │
│  │ - intent       │ 输入：audio_text, audio_summary            │
│  │                │ 输出：intent_name, confidence              │
│  └────────┬───────┘                                            │
│           ↓                                                     │
│  ┌────────────────┐                                            │
│  │ Skill 3        │ 结果路由                                    │
│  │ - route        │ 输入：intent_name, confidence              │
│  │                │ 输出：route_type, execution_mode           │
│  └────────┬───────┘                                            │
│           ↓                                                     │
│  阶段 B：跟单与执行                                              │
│  ┌────────────────┐                                            │
│  │ Skill 4        │ 跟单处理（固定规则）                         │
│  │ - followup     │ 输出：followup_option=111, log             │
│  └────────┬───────┘                                            │
│           ↓                                                     │
│  ┌────────────────┐                                            │
│  │ Skill 5        │ 业务执行（根据路由）                         │
│  │ - action       │ route_type=confirm_visit → 改约            │
│  │                │ route_type=price_or_cancel → 取消 (需审批)  │
│  │                │ route_type=other → 创建跟单任务             │
│  └────────┬───────┘                                            │
│           ↓                                                     │
│  ┌────────────────┐                                            │
│  │ Approval Gate  │ 审批确认（需要时）                          │
│  └────────┬───────┘                                            │
│           ↓                                                     │
│  ┌────────────────┐                                            │
│  │ Finalize       │ 任务归档                                    │
│  └────────────────┘                                            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3 条路由路径

### 路由 1：确认上门
```json
{
  "route_type": "confirm_visit",
  "action_type": "work_order_reschedule",
  "new_appointment_time": "2026-03-18 09:00:00",
  "need_approval": false,
  "execution_mode": "auto",
  "final_status": "待履约"
}
```

### 路由 2：用户询价/取消
```json
{
  "route_type": "price_or_cancel",
  "action_type": "work_order_cancel",
  "cancel_reason": "用户不需要了",
  "need_approval": true,
  "approval_role": "客服主管",
  "execution_mode": "manual",
  "final_status": "待取消审批"
}
```

### 路由 3：其他意图
```json
{
  "route_type": "other",
  "action_type": "create_followup_task",
  "task_type": "挂起跟单",
  "need_approval": false,
  "execution_mode": "auto",
  "final_status": "待后续跟进"
}
```

---

## 审批流程

当工作流遇到需要审批的动作（如工单取消）时，会返回：

```json
{
  "ok": true,
  "status": "needs_approval",
  "requiresApproval": {
    "type": "approval_request",
    "prompt": "确认取消工单 WO123？",
    "items": [...],
    "resumeToken": "eyJ0YXNrSWQiOiJUMDAxIiwi..."
  }
}
```

**审批通过**：
```json
{
  "action": "resume",
  "token": "eyJ0YXNrSWQiOiJUMDAxIiwi...",
  "approve": true
}
```

**审批驳回**：
```json
{
  "action": "resume",
  "token": "eyJ0YXNrSWQiOiJUMDAxIiwi...",
  "approve": false
}
```

---

## 输出示例

### 成功完成
```json
{
  "ok": true,
  "status": "ok",
  "output": [
    {
      "task_id": "T001",
      "final_status": "COMPLETED",
      "execution_summary": "工单改约成功，新预约时间：2026-03-18 09:00",
      "artifacts": [
        {"type": "audio", "id": "audio_123"},
        {"type": "intent", "name": "confirm_visit", "confidence": 0.95},
        {"type": "action", "action_type": "work_order_reschedule"}
      ],
      "completed_at": "2026-03-16T15:30:00Z"
    }
  ]
}
```

### 需要人工复核
```json
{
  "ok": true,
  "status": "ok",
  "output": [
    {
      "task_id": "T001",
      "final_status": "HUMAN_REVIEW",
      "execution_summary": "录音获取失败：AUDIO_NOT_FOUND",
      "reason": "录音文件不存在"
    }
  ]
}
```

### 等待审批
```json
{
  "ok": true,
  "status": "needs_approval",
  "output": [
    {
      "task_id": "T001",
      "final_status": "WAIT_APPROVAL",
      "execution_summary": "工单取消待客服主管审批"
    }
  ],
  "requiresApproval": {
    "type": "approval_request",
    "prompt": "确认取消工单 WO123？",
    "resumeToken": "..."
  }
}
```

---

## 异常处理

### 场景 1：录音获取失败
- **触发条件**：录音不存在、拉取失败、文件损坏
- **处理**：标记 `need_human_review=true`，跳过后续 Skills，直接转人工
- **最终状态**：`HUMAN_REVIEW`

### 场景 2：意图识别低置信度
- **触发条件**：`confidence < 0.75`
- **处理**：标记 `need_human_review=true`，继续流程但 `execution_mode=manual`
- **最终状态**：`HUMAN_REVIEW` 或 `WAIT_APPROVAL`

### 场景 3：取消单审批
- **触发条件**：`route_type=price_or_cancel`
- **处理**：生成取消动作，`need_approval=true`，等待客服主管审批
- **最终状态**：`WAIT_APPROVAL` → 审批通过 → `COMPLETED`

---

## 监控指标

### 关键指标
| 指标 | 目标值 | 告警阈值 |
|------|--------|----------|
| 录音获取成功率 | ≥ 95% | < 90% |
| 意图识别准确率 | ≥ 90% | < 85% |
| 自动执行成功率 | ≥ 95% | < 90% |
| 人工复核率 | ≤ 15% | > 20% |
| 平均处理时长 | < 2 分钟 | > 5 分钟 |

### 日志查询
```bash
# 查看工作流执行日志
lobster logs --task-id T001

# 查看审批记录
lobster approvals --status pending
```

---

## 调试技巧

### 1. 单步执行
```bash
# 只执行 Skill 1
lobster run --mode tool hangqi-task-workflow.lobster \
  --args-json '{"task_id":"T001","work_order_id":"WO123","audio_ref":"audio_456"}' \
  --stop-after skill1_fetch_audio
```

### 2. 查看中间结果
```bash
# 输出所有中间结果
lobster run --mode tool hangqi-task-workflow.lobster \
  --args-json '{"task_id":"T001"}' \
  --verbose
```

### 3. 模拟测试
```bash
# 使用历史样本回放
lobster run --mode tool hangqi-task-workflow.lobster \
  --args-json '{"task_id":"TEST001","work_order_id":"TEST_WO","audio_ref":"test_audio"}' \
  --dry-run
```

---

## 版本历史

| 版本 | 日期 | 变更内容 | 作者 |
|------|------|----------|------|
| v1.0 | 2026-03-16 | 初始版本，基于 G1 工作流程文档 | main |

---

## 相关文档

- [G1 工作流程文档](https://qcnvm7ba2fd9.feishu.cn/wiki/DNzIwJLL3iuRPfkGHUSc5bZ8n1c)
- [Lobster 官方文档](https://github.com/openclaw/lobster)
- [OpenClaw Lobster 工具文档](https://docs.openclaw.ai/tools/lobster)

---

**文档状态**：✅ 已完成  
**工作流状态**：⏳ 待测试
