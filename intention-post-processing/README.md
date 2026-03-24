# 意图后处理工作流 (MVP)
基于openClaw实现挂起跟单场景自动化处理的最小可行版本。

## 项目结构
```
intention-post-processing/
├── index.js                # 主流程入口
├── skills/
│   ├── skill-route-result.js       # Skill0: 路由结果（核心判断）
│   ├── skill-track-handle.js       # Skill1: 统一跟单处理
│   ├── skill-modify-duty-time.js   # Skill2: 工单改约
│   ├── skill-cancel-work.js        # Skill3: 工单取消
│   └── skill-create-track-task.js  # Skill4: 生成跟单任务
├── test.js                 # 测试脚本
├── package.json            # 依赖配置
└── README.md               # 说明文档
```

## 流程说明
完全按照方案设计实现：
```
输入 → Skill0路由 → Skill1公共处理 → 分支执行
├─ 确认上门 → Skill2工单改约
├─ 用户询价/取消 → Skill3工单取消
└─ 其他意图 → Skill4生成跟单任务
```

## 部署步骤
1. 安装依赖：
```bash
cd intention-post-processing
npm install
```

2. 配置Gateway地址：
修改`index.js`中的`CONFIG.gateway`为你的openClaw Gateway地址

3. 替换Skill中的真实实现：
- 每个Skill文件中都有注释标记的待实现区域，替换为实际的API调用逻辑
- 配置各个Skill的认证信息（.auth文件放在~/.qoder/skills/对应目录下）

## 使用方式
### 命令行调用
```bash
node index.js '{"trackId":"TRACK-12345","intentionContent":"用户确认可以上门"}'
```

### 作为模块调用
```javascript
const workflow = require('./index');
const result = await workflow({
  trackId: 'TRACK-12345',
  intentionContent: '用户确认可以上门'
});
```

### 测试运行
```bash
npm run test
```

## 批量处理扩展
按照方案建议，可在外侧增加调度流程：
1. 定时触发
2. 获取待处理跟单任务列表
3. 逐条调用本工作流

## 后续迭代方向
1. 增强Skill0的路由能力，接入更复杂的意图识别模型
2. 完善各个Skill的错误处理和重试机制
3. 增加监控和日志上报
4. 支持更多业务场景的路由分类
