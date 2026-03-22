---
name: handle-track-work
description: 跟单处理。当运营人员需要处理跟单、提交跟单操作，或提到"跟单处理"、"跟单提交"、"handle track"时使用此 Skill。
---

# 跟单处理

帮助运营人员通过跟单ID提交跟单处理操作。运营只会提供跟单ID，需要先根据跟单ID查出工单号，再进行跟单处理。

## 入参说明

Skill 接收以下入参：
- **跟单ID**（trackWorkId）：必填，跟单记录ID
- **意图名称**：可选，当前意图的名称
- **意图判断结果**：可选，意图识别的结果
- **其他信息**：可选，用户提供的其他补充信息

## 认证说明

本 Skill 使用 AK Bearer Token 认证方式，用于调用 track.xiujiadian.com 域名的接口。

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
// authConfig 包含: AK, app-key, secret_key, username, password
```

### 请求认证

- 请求头：`Authorization: Bearer <AK>`
- AK 从 `authConfig.AK` 读取

## 占位符替换说明

以下脚本模板中包含 `{xxx}` 格式的占位符，agent 在将脚本写入临时文件时**必须**将其替换为实际值：

| 占位符 | 替换为 | 说明 |
|--------|--------|------|
| `{skillDir}` | 本 SKILL.md 文件所在目录的绝对路径 | 用于定位 `.auth` 等配置文件 |
| `{trackWorkId}` | 用户提供的跟单ID | 从用户输入中获取 |
| `{workId}` | Step 2 查出的工单号 | 从接口返回中提取 |
| `{intentName}` | 意图名称 | 从用户输入中获取 |
| `{intentResult}` | 意图判断结果 | 从用户输入中获取 |

## 执行步骤

### Step 1: 获取入参

从用户消息中提取以下参数：
- **跟单ID**（trackWorkId）：必填，若未提供用 `ask_user_question` 询问
- **意图名称**：可选，未提供时使用空字符串
- **意图判断结果**：可选，未提供时使用空字符串
- **其他信息**：可选

### Step 2: 根据跟单ID查询工单号

使用 `run_in_terminal` 执行以下 Node.js 脚本，将 `{trackWorkId}` 替换为实际跟单ID，调用跟单列表接口获取工单号：

```javascript
// /tmp/track_query.js
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
    const workId = d.data.items[0].workId;
    console.log('WORK_ID=' + workId);
  } else {
    console.log('ERROR: 未找到该跟单ID对应的工单，msg=' + (d.msg || ''));
  }
}).catch(e => console.log('ERROR: ' + e.message));
```

```bash
node /tmp/track_query.js
```

**解析结果：**
- 如果输出 `WORK_ID=xxx`，提取 workId 进入 Step 3
- 如果输出 `ERROR:`，将错误信息展示给用户并终止流程

### Step 3: 调用跟单处理接口

使用 `run_in_terminal` 执行以下 Node.js 脚本（将脚本写到临时文件再执行）：

```javascript
// /tmp/handle_track_work.js
const fs = require('fs');

// 解析 .auth 文件
const authContent = fs.readFileSync('{skillDir}/.auth', 'utf8');
const authConfig = {};
authContent.split('\n').forEach(line => {
  const idx = line.indexOf('=');
  if (idx > 0) authConfig[line.substring(0, idx).trim()] = line.substring(idx + 1).trim();
});

const workId = '{workId}';           // 替换为 Step 2 获取到的 workId
const trackWorkId = '{trackWorkId}'; // 替换为实际跟单ID
const intentName = '{intentName}';   // 可选，未提供时替换为空字符串
const intentResult = '{intentResult}'; // 可选，未提供时替换为空字符串

// 构建 handleRemark：仅在有值时拼接
const parts = [intentName, intentResult].filter(s => s.length > 0);
const handleRemark = parts.length > 0 ? parts.join('\n') : '';

const body = {
  workId,
  trackWorkId,
  trackContentId: 1191,
  handleOptionList: [
    {
      optionId: 111,
      optionName: '挂起申请驳回',
      optionLevel: 0
    }
  ],
  handleJumpType: 0,
  handleRemark,
  isCompleteTrack: 2
};

fetch('https://test3-track.xiujiadian.com/amis/track/save/newHandle', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + authConfig.AK
  },
  body: JSON.stringify(body)
}).then(r => r.text()).then(d => console.log(d)).catch(e => console.error('请求异常:', e.message));
```

```bash
node /tmp/handle_track_work.js
```

### Step 4: 解析与展示

**注意：接口返回的是 XML 格式**，形如：
```xml
<AMISResponseDTO><status>0</status><msg>操作成功</msg><data/><errors/></AMISResponseDTO>
```

从 XML 中提取 `<status>` 和 `<msg>` 的值进行判断。

**成功情况：**

当 `status` 为 `0` 时，向用户展示：
- 工单号
- 跟单ID
- 提示"跟单处理提交成功"

**展示格式示例：**
```
工单 {workId} 跟单处理已提交成功！
- 跟单ID：{trackWorkId}
- 处理备注：{handleRemark}（若为空则显示"无"）
```

### 异常处理

- **接口返回失败**（`status` 不为 `0`）：展示 `<msg>` 中的错误信息，提示用户跟单处理提交失败及原因
- **网络异常**：提示用户稍后重试
- **缺少必填参数**（仅跟单ID）：使用 `ask_user_question` 向用户询问
