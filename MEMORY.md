# 长期记忆

## 工作流项目

### 挂起任务工作流
- **用途**: 自动处理挂起工单，识别用户意图并执行相应操作
- **Skills**: 6个自定义技能 (cancel-work, create-track-task, get-call-record, handle-track-work, modify-duty-time, recording-intention)
- **问题**: 
  - Lobster 工作流在 Windows 下有兼容性问题
  - 使用纯 Node.js 实现 (hangqi-workflow.js) 作为替代
- **认证**: Skills 需要在 ~/.qoder/skills/ 下配置 .auth 文件

### 环境配置
- Lobster CLI: C:\lobster
- 调试页面: dist/index.html
- 后端服务: workflow-server.js (port 3000)
- Gateway: localhost:18789

### 待处理
1. 完善 Skills 实际 API 调用
2. 配置 Skills 认证文件
3. 修复后端服务启动问题
