# Lobster 工作流测试报告

> 测试时间：2026-03-16  
> 测试环境：OpenClaw Gateway  
> 状态：⏳ 进行中

---

## 一、测试准备

### 1.1 工作流文件
- ✅ 文件已创建：`~/.openclaw/agents/main/workspace/workflows/hangqi-task-workflow.lobster`
- ✅ 使用文档已创建：`~/.openclaw/agents/main/workspace/workflows/README.md`
- ✅ 测试脚本已创建：`~/.openclaw/agents/main/workspace/workflows/test-workflow.sh`

### 1.2 工具依赖
- ⚠️ Lobster CLI：未独立安装（作为 OpenClaw 插件使用）
- ⚠️ llm-task 工具：需要启用

### 1.3 配置要求

在 OpenClaw 配置中启用以下工具：

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

---

## 二、测试用例

### 测试用例 1：确认上门场景

**输入**：
```json
{
  "task_id": "T001",
  "work_order_id": "WO123",
  "audio_ref": "audio_confirm"
}
```

**预期输出**：
- route_type: `confirm_visit`
- action_type: `work_order_reschedule`
- need_approval: `false`
- execution_mode: `auto`
- final_status: `待履约`

**测试状态**：⏳ 待执行

---

### 测试用例 2：用户询价/取消场景

**输入**：
```json
{
  "task_id": "T002",
  "work_order_id": "WO456",
  "audio_ref": "audio_cancel"
}
```

**预期输出**：
- route_type: `price_or_cancel`
- action_type: `work_order_cancel`
- need_approval: `true`
- approval_role: `客服主管`
- final_status: `待取消审批`

**测试状态**：⏳ 待执行

---

### 测试用例 3：其他意图场景

**输入**：
```json
{
  "task_id": "T003",
  "work_order_id": "WO789",
  "audio_ref": "audio_other"
}
```

**预期输出**：
- route_type: `other`
- action_type: `create_followup_task`
- need_approval: `false`
- execution_mode: `auto`
- final_status: `待后续跟进`

**测试状态**：⏳ 待执行

---

### 测试用例 4：录音获取失败场景

**输入**：
```json
{
  "task_id": "T004",
  "work_order_id": "WO999",
  "audio_ref": "audio_not_found"
}
```

**预期输出**：
- audio_fetch_status: `failed`
- need_human_review: `true`
- final_status: `HUMAN_REVIEW`

**测试状态**：⏳ 待执行

---

## 三、测试调用方式

### 方式 1：通过 OpenClaw lobster 工具

```json
{
  "action": "run",
  "pipeline": "~/.openclaw/agents/main/workspace/workflows/hangqi-task-workflow.lobster",
  "argsJson": "{\"task_id\":\"T001\",\"work_order_id\":\"WO123\",\"audio_ref\":\"audio_confirm\"}",
  "timeoutMs": 60000
}
```

### 方式 2：命令行（如果 Lobster CLI 可用）

```bash
lobster run --mode tool ~/.openclaw/agents/main/workspace/workflows/hangqi-task-workflow.lobster \
  --args-json '{"task_id":"T001","work_order_id":"WO123","audio_ref":"audio_confirm"}'
```

---

## 四、验收标准

### Phase 0：离线验证

| 指标 | 目标值 | 实测值 | 状态 |
|------|--------|--------|------|
| 录音获取成功率 | ≥ 95% | - | ⏳ |
| 意图识别准确率 | ≥ 90% | - | ⏳ |
| 路由准确率 | ≥ 90% | - | ⏳ |
| 动作建议准确率 | ≥ 90% | - | ⏳ |

### 功能验收

- [ ] 工作流能正常启动
- [ ] 5 Skills 按顺序执行
- [ ] 3 条路由路径正确分支
- [ ] 审批门正确触发
- [ ] 异常场景正确处理
- [ ] 输出格式符合预期

---

## 五、已知问题

| 问题 | 影响 | 解决方案 | 状态 |
|------|------|----------|------|
| Lobster CLI 未独立安装 | 无法通过命令行直接运行 | 通过 OpenClaw 工具调用 | ⏳ |
| llm-task 工具未配置 | Skills 无法执行 LLM 调用 | 需要在配置中启用 | ⏳ |

---

## 六、下一步计划

1. **配置工具权限** - 在 OpenClaw 配置中启用 `lobster` 和 `llm-task` 工具
2. **执行测试用例** - 运行 4 个测试用例，记录结果
3. **修复问题** - 根据测试结果调整工作流
4. **Phase 0 验收** - 确认指标达标

---

## 七、测试记录

### 2026-03-16 15:55

- ✅ 工作流文件创建完成
- ✅ 使用文档创建完成
- ✅ 测试脚本创建完成
- ⏳ 等待工具配置
- ⏳ 等待测试执行

---

**报告状态**：⏳ 进行中  
**下次更新**：测试执行后
