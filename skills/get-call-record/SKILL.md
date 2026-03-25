---
name: get-call-record
description: 获取工单通话录音记录。当运营人员需要查询工单录音、通话记录，或提到"录音"、"通话"、"跟单录音"、"call record"时使用此 Skill。
---

# 获取工单通话录音

帮助运营人员通过跟单ID查询通话录音列表。运营只会提供跟单ID，需要先根据跟单ID查出工单号，再查询录音。

## 入参说明

Skill 接收以下入参：
- **意图名称**：当前意图的名称
- **意图判断结果**：意图识别的结果
- **跟单ID**（trackWorkId）：需要查询录音的跟单ID
- **其他信息**：用户提供的其他补充信息
- **环境**（env）：必填，目标环境。传 `生产` 时使用生产环境接口，其他值时默认使用测试环境接口

## 认证说明

本 Skill 统一使用 AK Bearer Token 认证：

- **track.xiujiadian.com** → AK Bearer Token（跟单列表查询接口）
- **admin.xiujiadian.com** → AK Bearer Token（通话录音查询接口）

从 `.auth` 文件读取 `AK` 字段，请求头格式：`Authorization: Bearer <AK>`

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
| `{env}` | 用户指定的环境，`生产` 或其他（默认测试） | 从用户输入中获取 |
| `{servWorkId}` | Step 2 查出的工单号 | 从接口返回中提取 |

## 执行步骤

### Step 1: 获取跟单ID

从用户消息（入参中的 **跟单ID** 字段）提取 trackWorkId。若未提供，用 `ask_user_question` 询问。
同时提取 **环境**（env），不传或非 `生产` 时默认使用测试环境。

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
const env = '{env}'; // '生产' 或其他（默认测试）

const isProd = env === '生产';
const trackBaseUrl = isProd
  ? 'https://ais.xiujiadian.com/zmn-track-admin'
  : 'https://test3-track.xiujiadian.com';

fetch(trackBaseUrl + '/amis/track/list', {
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

### Step 3: 查询通话录音

使用 `run_in_terminal` 执行以下 Node.js 脚本，将 `{servWorkId}` 替换为 Step 2 中获取到的 workId：

```javascript
// /tmp/call_record.js
const fs = require('fs');

// 解析 .auth 文件
const authContent = fs.readFileSync('{skillDir}/.auth', 'utf8');
const authConfig = {};
authContent.split('\n').forEach(line => {
  const idx = line.indexOf('=');
  if (idx > 0) authConfig[line.substring(0, idx).trim()] = line.substring(idx + 1).trim();
});

const servWorkId = '{servWorkId}';
const env = '{env}'; // '生产' 或其他（默认测试）

const isProd = env === '生产';
const callRecordUrl = isProd
  ? 'https://ais.xiujiadian.com/public/bfm-serv-work/serv/work/listCallRecord?servWorkId=' + servWorkId
  : 'https://test3-admin.xiujiadian.com/bfm-serv-work/serv/work/listCallRecord?servWorkId=' + servWorkId;

fetch(callRecordUrl, {
  method: 'GET',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + authConfig.AK
  }
}).then(r => r.json()).then(d => {
  console.log(JSON.stringify(d));
}).catch(e => console.log('ERROR: ' + e.message));
```

```bash
node /tmp/call_record.js
```

### Step 4: 解析与展示

接口返回 JSON 格式：`{ "status": 0, "msg": "操作成功", "data": [...] }`

当 `status === 0` 且 `data` 非空时，按以下规则处理：

**筛选规则：**

只保留工程师与用户之间的通话记录，即满足以下任一条件：
- `callTypeName` 为"工程师"且 `peerTypeName` 为"用户"
- `callTypeName` 为"用户"且 `peerTypeName` 为"工程师"

**取最近一条：**

在筛选结果中按 `startTime` 倒序排列，取第一条（最新的）。

**展示内容：**

只需展示该条记录的录音地址（`tapeUrl`）：
- 有录音：直接输出录音链接，格式 `[点击播放](tapeUrl)`
- 无录音：提示"最近一条工程师与用户的通话无录音"
- 筛选后无记录：提示"该工单暂无工程师与用户的通话记录"

### 异常处理

- **Step 2 查询工单号失败**：提示"未找到该跟单ID对应的工单"并终止流程
- **Step 3 查询录音失败**（`status !== 0`）：展示 msg 内容，提示用户接口调用失败
- **data 为空数组**：提示"该工单暂无通话记录"
- **网络异常**：提示用户稍后重试
