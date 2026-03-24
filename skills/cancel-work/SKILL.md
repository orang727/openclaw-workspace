---
name: cancel-work
description: 工单取消。当运营人员需要取消工单，或提到"工单取消"、"取消工单"、"cancel work"时使用此 Skill。
---

# 工单取消

帮助运营人员通过跟单ID提交工单取消申请。运营只会提供跟单ID，需要先根据跟单ID查出工单号，再调用工单取消接口。

## 入参说明

Skill 接收以下入参：
- **跟单ID**（trackWorkId）：跟单记录ID

## 认证说明

本 Skill 统一使用 AK Bearer Token 认证：

- **track.xiujiadian.com** → AK Bearer Token（跟单列表查询）
- **test-ais.xiujiadian.com** → AK Bearer Token（工单取消接口）

从 `.auth` 文件读取 `AK` 字段，请求头：`Authorization: Bearer <AK>`

### .auth 文件格式

路径：与 SKILL.md 同目录下的 `.auth` 文件，包含以下字段（key=value 格式）：
```
AK=<your_ak_token>
```

### .auth 文件解析方式

所有 Node.js 脚本统一使用以下方式解析 .auth 文件，其中 `{skillDir}` 在生成脚本时由 agent 替换为本 SKILL.md 所在目录的绝对路径：
```javascript
const fs = require('fs');
const authContent = fs.readFileSync('{skillDir}/.auth', 'utf8');
const authConfig = {};
authContent.split('\n').forEach(line => {
  const idx = line.indexOf('=');
  if (idx > 0) authConfig[line.substring(0, idx).trim()] = line.substring(idx + 1).trim();
});
// authConfig 包含: AK
```

## 占位符替换说明

以下脚本模板中包含 `{xxx}` 格式的占位符，agent 在将脚本写入临时文件时**必须**将其替换为实际值：

| 占位符 | 替换为 | 说明 |
|--------|--------|------|
| `{skillDir}` | 本 SKILL.md 文件所在目录的绝对路径 | 用于定位 `.auth` 等配置文件 |
| `{trackWorkId}` | 用户提供的跟单ID | 从用户输入中获取 |
| `{workId}` | Step 2 查出的 servWorkId | 从接口返回中提取 |

## 执行步骤

### Step 1: 获取入参

从用户消息中提取以下参数：
- **跟单ID**（trackWorkId）：必填，若未提供用 `ask_user_question` 询问

### Step 2: 根据跟单ID查询工单号

使用 `run_in_terminal` 执行以下 Node.js 脚本，将 `{trackWorkId}` 替换为实际跟单ID，调用跟单列表接口获取工单号：

```javascript
// /tmp/cancel_track_query.js
const fs = require('fs');

// 解析 .auth 文件
const authContent = fs.readFileSync('{skillDir}/.auth', 'utf8');
const authConfig = {};
authContent.split('\n').forEach(line => {
  const idx = line.indexOf('=');
  if (idx > 0) authConfig[line.substring(0, idx).trim()] = line.substring(idx + 1).trim();
});

const trackWorkId = '{trackWorkId}';

fetch('https://test3-track.xiujiadian.com/amis/track/list', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + authConfig.AK
  },
  body: JSON.stringify({ trackWorkId })
}).then(r => r.json()).then(d => {
  if (d.status === 0 && d.data && d.data.items && d.data.items.length > 0) {
    const item = d.data.items[0];
    const servWorkId = item.workId;
    const servOrderId = item.servOrderId;
    console.log('WORK_ID=' + servWorkId);
    console.log('SERV_ORDER_ID=' + servOrderId);
  } else {
    console.log('ERROR: 未找到该跟单ID对应的工单，msg=' + (d.msg || ''));
  }
}).catch(e => console.log('ERROR: ' + e.message));
```

```bash
node /tmp/cancel_track_query.js
```

**解析结果：**
- 如果输出 `WORK_ID=xxx` 和 `SERV_ORDER_ID=xxx`，提取 servWorkId 和 servOrderId 进入 Step 3
- 如果输出 `ERROR:`，将错误信息展示给用户并终止流程

### Step 3: 调用工单取消接口

使用 `run_in_terminal` 执行以下 Node.js 脚本（将脚本写到临时文件再执行），将 `{workId}` 替换为 Step 2 获取到的 servWorkId，将 `{servOrderId}` 替换为 Step 2 获取到的 servOrderId：

```javascript
// /tmp/cancel_work.js
const fs = require('fs');

// 解析 .auth 文件
const authContent = fs.readFileSync('{skillDir}/.auth', 'utf8');
const authConfig = {};
authContent.split('\n').forEach(line => {
  const idx = line.indexOf('=');
  if (idx > 0) authConfig[line.substring(0, idx).trim()] = line.substring(idx + 1).trim();
});

const servWorkId = '{workId}';
const servOrderId = '{servOrderId}';

fetch('https://test-ais.xiujiadian.com/ratel-api/serv-work-general-agg/cancelApplyModifyRemoteService/submitCancelApply', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + authConfig.AK
  },
  body: JSON.stringify({
    applySource: 17,
    operator: '系统',
    operatorId: 1,
    operatorIdentity: 1,
    reasonId: 217,
    servOrderId,
    servWorkId
  })
}).then(r => r.text()).then(text => {
  console.log(text);
}).catch(e => console.log('ERROR: ' + e.message));
```

```bash
node /tmp/cancel_work.js
```

### Step 4: 解析与展示

**注意：先用 `.text()` 获取原始响应内容，再判断是 JSON 还是 XML 格式进行解析。**

**成功情况：**

当接口返回 `success === true`（JSON）或 `<status>200</status>`（XML）时，向用户展示：
- 工单号
- 跟单ID
- 提示"工单取消申请提交成功"

**展示格式示例：**
```
工单 {workId} 取消申请已提交成功！
- 跟单ID：{trackWorkId}
```

### 异常处理

- **Step 2 查询工单号失败**：提示"未找到该跟单ID对应的工单"并终止流程
- **Step 3 工单取消接口返回失败**（`success !== true`）：展示返回的错误信息（msg 字段），提示用户工单取消申请提交失败及原因
- **网络异常**：提示用户稍后重试
- **缺少必填参数**：使用 `ask_user_question` 向用户询问跟单ID
