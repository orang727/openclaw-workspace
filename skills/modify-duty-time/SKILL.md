---
name: modify-duty-time
description: 修改工单预约时间。当运营人员需要修改工单的预约上门时间，或提到"预约时间"、"改约"、"修改预约"时使用此 Skill。
---

# 修改工单预约时间

帮助运营人员通过跟单ID修改工单的预约上门时间（默认改为当天 +2 天后的 09:00）。运营只会提供跟单ID，需要先根据跟单ID查出工单号，再获取当前登录人员信息，最后修改预约时间。

## 入参说明

Skill 接收以下入参：
- **跟单ID**（trackWorkId）：必填，需要修改预约时间的跟单ID
- **其他信息**：可选，用户提供的其他补充信息
- **环境**（env）：必填，目标环境。传 `生产` 时使用生产环境接口，其他值时默认使用测试环境接口

## 认证说明

本 Skill 使用 AK Bearer Token 认证调用所有接口（不需要 Cookie 头、不需要签名）：

- **track.xiujiadian.com** → AK Bearer Token（跟单列表查询）
- **mcc.xiujiadian.com** → 登录接口，用于获取 sessionId（请求体参数）
- **ais.xiujiadian.com** → AK Bearer Token（获取人员信息、修改预约时间接口）

从 `.auth` 文件读取 `AK` 字段，请求头：`Authorization: Bearer <AK>`

### .auth 文件格式

路径：与 SKILL.md 同目录下的 `.auth` 文件，包含以下字段（key=value 格式）：
```
AK=<your_ak_token>
username=<your_username>
password=<your_password>
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
// authConfig 包含: AK, username, password
```

## 占位符替换说明

以下脚本模板中包含 `{xxx}` 格式的占位符，agent 在将脚本写入临时文件时**必须**将其替换为实际值：

| 占位符 | 替换为 | 说明 |
|--------|--------|------|
| `{skillDir}` | 本 SKILL.md 文件所在目录的绝对路径 | 用于定位 `.auth` 等配置文件 |
| `{trackWorkId}` | 用户提供的跟单ID | 从用户输入中获取 |
| `{env}` | 用户指定的环境，`生产` 或其他（默认测试） | 从用户输入中获取 |
| `{servWorkId}` | Step 2 查出的工单号 | 从接口返回中提取 |
| `{realName}` | Step 3 获取的操作人姓名 | 从人员信息接口返回中提取 |
| `{deptName}` | Step 3 获取的部门名称 | 从人员信息接口返回中提取 |
| `{deptId}` | Step 3 获取的部门ID | 从人员信息接口返回中提取 |
| `{staffId}` | Step 3 获取的工号ID | 从人员信息接口返回中提取 |

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
- 如果输出 `WORK_ID=xxx`，提取 workId 作为 servWorkId 进入 Step 3
- 如果输出 `ERROR:`，将错误信息展示给用户并终止流程

### Step 3: 登录获取 sessionId 并查询人员信息

此步骤包含两个子步骤：
1. 登录 MCC 获取 sessionId（从 Cookie 中提取）
2. 使用 sessionId 作为请求体参数 + AK Bearer Token 认证调用获取人员信息接口

使用 `run_in_terminal` 执行以下 Node.js 脚本（将脚本写到临时文件再执行）：

```javascript
// /tmp/get_staff_info.js
const fs = require('fs');

// 解析 .auth 文件
const authContent = fs.readFileSync('{skillDir}/.auth', 'utf8');
const authConfig = {};
authContent.split('\n').forEach(line => {
  const idx = line.indexOf('=');
  if (idx > 0) authConfig[line.substring(0, idx).trim()] = line.substring(idx + 1).trim();
});

const env = '{env}'; // '生产' 或其他（默认测试）
const isProd = env === '生产';
const mccBaseUrl = isProd ? 'https://mcc.xiujiadian.com' : 'https://test3-mcc.xiujiadian.com';
const aisBaseUrl = isProd ? 'https://ais.xiujiadian.com' : 'https://test-ais.xiujiadian.com';
const sessionCookieName = isProd ? 'zmn.id' : 'test3.zmn.id';

(async () => {
  try {
    // Step 3.1: 登录获取 Cookie，从中提取 sessionId
    const loginRes = await fetch(mccBaseUrl + '/cas/login.action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ staffName: authConfig.username, password: authConfig.password }),
      redirect: 'manual'
    });

    if (loginRes.status !== 200 && loginRes.status !== 302) {
      const loginText = await loginRes.text();
      console.log('ERROR: 登录失败，status=' + loginRes.status + ', body=' + loginText);
      return;
    }

    // 提取 cookies
    const cookies = [];
    const setCookieHeaders = loginRes.headers.getSetCookie ? loginRes.headers.getSetCookie() : [];
    if (setCookieHeaders.length > 0) {
      setCookieHeaders.forEach(c => cookies.push(c.split(';')[0]));
    } else {
      loginRes.headers.forEach((value, key) => {
        if (key.toLowerCase() === 'set-cookie') {
          cookies.push(value.split(';')[0]);
        }
      });
    }

    // 从 cookie 中提取 sessionId
    let sessionId = '';
    cookies.forEach(c => {
      if (c.startsWith(sessionCookieName + '=')) {
        sessionId = c.substring(sessionCookieName.length + 1);
      }
    });

    if (!sessionId) {
      console.log('ERROR: 登录成功但未获取到sessionId');
      return;
    }

    // Step 3.2: 使用 sessionId + AK 调用获取人员信息接口
    const apiUrl = aisBaseUrl + '/ratel-api/base-mcc/mcStaffForeignListRemoteService/getLoginStaffBySessionId';

    const staffRes = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + authConfig.AK
      },
      body: JSON.stringify({ sessionId })
    });

    const text = await staffRes.text();
    // 尝试 JSON 解析
    try {
      const staffData = JSON.parse(text);
      if (staffData.success === true && staffData.data) {
        console.log('STAFF_INFO=' + JSON.stringify(staffData.data));
      } else {
        console.log('ERROR: 获取人员信息失败，' + JSON.stringify(staffData));
      }
    } catch(e) {
      // 尝试从 XML 提取
      const realName = text.match(/<realName>([^<]+)<\/realName>/);
      const deptName = text.match(/<deptName>([^<]+)<\/deptName>/);
      const deptId = text.match(/<deptId>([^<]+)<\/deptId>/);
      const staffId = text.match(/<staffId>([^<]+)<\/staffId>/);
      if (realName && staffId) {
        console.log('STAFF_INFO=' + JSON.stringify({
          realName: realName[1],
          deptName: deptName ? deptName[1] : '',
          deptId: deptId ? parseInt(deptId[1]) : 0,
          staffId: staffId ? parseInt(staffId[1]) : 0
        }));
      } else {
        console.log('ERROR: 无法解析响应, raw=' + text.substring(0, 500));
      }
    }
  } catch (e) {
    console.log('ERROR: ' + e.message);
  }
})();
```

```bash
node /tmp/get_staff_info.js
```

**解析返回结果：**

- 如果输出 `STAFF_INFO={...}`，解析 JSON 并提取以下字段：
  - `realName`：操作人真实姓名
  - `deptName`：操作人部门名称
  - `deptId`：操作人部门 ID
  - `staffId`：操作人工号 ID
- 如果输出 `ERROR:`，将错误信息展示给用户并终止流程

### Step 4: 修改预约时间

使用提取的人员信息和工单号（Step 2 获取的 workId），通过 AK Bearer Token 调用修改预约时间接口。所有时间参数格式为 `yyyy-MM-dd HH:mm:ss`。

使用 `run_in_terminal` 执行以下 Node.js 脚本（将脚本写到临时文件再执行）：

```javascript
// /tmp/modify_duty_time.js
const fs = require('fs');

// 解析 .auth 文件
const authContent = fs.readFileSync('{skillDir}/.auth', 'utf8');
const authConfig = {};
authContent.split('\n').forEach(line => {
  const idx = line.indexOf('=');
  if (idx > 0) authConfig[line.substring(0, idx).trim()] = line.substring(idx + 1).trim();
});

const servWorkId = '{servWorkId}';  // 替换为 Step 2 获取到的 workId

// 从 Step 3 获取的人员信息
const realName = '{realName}';
const deptName = '{deptName}';
const deptId = {deptId};
const staffId = {staffId};

// 格式化时间函数
function formatTime(date) {
  const y = date.getFullYear();
  const M = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');
  return `${y}-${M}-${d} ${h}:${m}:${s}`;
}

// 当前时间
const now = new Date();
const operateTime = formatTime(now);

// 当天 +2 天后的 09:00
const dutyDate = new Date(now);
dutyDate.setDate(dutyDate.getDate() + 2);
dutyDate.setHours(9, 0, 0, 0);
const dutyTime = formatTime(dutyDate);

const bodyDict = {
  operateTime,
  servWorkId,
  operator: realName,
  operatorDeptName: deptName,
  dutyTime,
  operatorDeptId: deptId,
  operatorId: String(staffId),
  operatorIdentity: 2
};

(async () => {
  try {
    const env = '{env}'; // '生产' 或其他（默认测试）
    const isProd = env === '生产';
    const aisBaseUrl = isProd ? 'https://ais.xiujiadian.com' : 'https://test-ais.xiujiadian.com';
    const apiUrl = aisBaseUrl + '/ratel-api/serv-work-general-agg/servWorkModifyDutyTimeRemoteService/modifyDutyTime';

    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + authConfig.AK,
        'abtag': 'p0342'
      },
      body: JSON.stringify(bodyDict)
    });

    const text = await res.text();
    console.log(text);
  } catch (e) {
    console.log('ERROR: ' + e.message);
  }
})();
```

```bash
node /tmp/modify_duty_time.js
```

### Step 5: 解析与展示

**注意：先用 `.text()` 获取原始响应内容，再判断是 JSON 还是 XML 格式进行解析。**

**成功情况：**

当接口返回 `success === true`（JSON）或 `<status>200</status>`（XML）时，向用户展示：
- 工单号
- 修改后的预约时间（dutyTime）
- 操作人信息（realName）
- 提示"工单预约时间修改成功"

**展示格式示例：**
```
工单 {servWorkId} 预约时间已修改成功！
- 新预约时间：2026-03-19 09:00:00
- 操作人：王晏赐
```

### 异常处理

- **Step 2 查询工单号失败**：提示"未找到该跟单ID对应的工单"并终止流程
- **Step 3 登录失败**：提示"登录失败，请检查用户名密码是否正确"并终止流程
- **Step 3 获取 sessionId 失败**：提示"登录成功但未获取到sessionId，请联系管理员"并终止流程
- **Step 3 获取人员信息失败**（`success !== true`）：提示"获取登录人员信息失败，请检查登录状态"
- **Step 4 修改预约时间失败**（`success !== true`）：展示返回的错误信息（msg 字段），提示用户修改失败及原因
- **网络异常**：提示用户稍后重试
