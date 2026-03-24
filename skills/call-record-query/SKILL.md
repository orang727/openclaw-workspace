---
name: call-record-query
description: |
  根据服务工单ID查询通话记录，按优先级筛选（detectRecordId > 通话时长>10秒），
  取结束时间最晚的一条记录。若有语音识别记录，自动获取并展示对话转写内容。
license: MIT
metadata:
  author: zmn
  version: "1.2"
  tags:
    - 通话记录
    - 语音转文字
    - 工单查询
---

# 通话记录查询

根据用户提供的服务工单ID（servWorkId），查询通话记录列表，按以下优先级筛选记录：
1. **最高优先级**：有 `detectRecordId` 字段的记录
2. **次优先级**：通话时长大于10秒的记录
3. 在符合以上条件的记录中，取结束时间最晚的一条

**如果筛选出的记录包含 `detectRecordId`，则继续调用接口获取语音转文字内容。**

**Input**: 用户提供 servWorkId 参数（必填）。

## 参数说明

| 参数 | 必选 | 说明 | 示例 |
|------|------|------|------|
| servWorkId | 是 | 服务工单ID | 6127320892848290944 |
| 数据来源 | 否 | 生产或测试，默认为测试 | 测试 |

## 认证说明

本 Skill 使用 AK Bearer Token 认证调用接口（不需要 Cookie、不需要用户名密码、不需要签名）：

- 请求头：`Authorization: Bearer <AK>`
- 从 `.auth` 文件读取 `AK` 字段

### .auth 文件格式

路径：与 SKILL.md 同目录下的 `.auth` 文件，包含以下字段（key=value 格式）：
```
AK=<your_ak_token>
```

### AK 获取流程

1. 尝试读取 `.auth` 文件中的 `AK` 字段
2. 如果 `.auth` 文件不存在或 AK 为空，使用 `ask_user_question` 向用户询问 AK
3. 使用用户提供的 AK 执行查询
4. **查询成功后**，将 AK 保存到 `.auth` 文件，下次自动使用

### .auth 文件解析方式

所有 Node.js 脚本统一使用以下方式解析 .auth 文件，其中 `{skillDir}` 在生成脚本时由 agent 替换为本 SKILL.md 所在目录的绝对路径：
```javascript
const fs = require('fs');
const path = require('path');
const authFilePath = '{skillDir}/.auth';
let authConfig = {};
try {
  const authContent = fs.readFileSync(authFilePath, 'utf8');
  authContent.split('\n').forEach(line => {
    const idx = line.indexOf('=');
    if (idx > 0) authConfig[line.substring(0, idx).trim()] = line.substring(idx + 1).trim();
  });
} catch (e) {
  // .auth 文件不存在，authConfig 为空
}
// authConfig.AK 可能为 undefined
```

## 占位符替换说明

以下脚本模板中包含 `{xxx}` 格式的占位符，agent 在将脚本写入临时文件时**必须**将其替换为实际值：

| 占位符 | 替换为 | 说明 |
|--------|--------|------|
| `{skillDir}` | 本 SKILL.md 文件所在目录的绝对路径 | 用于定位 `.auth` 配置文件 |
| `{baseUrl}` | 接口域名 | 测试: `https://test3-admin.xiujiadian.com`，生产: `https://admin.xiujiadian.com` |
| `{servWorkId}` | 服务工单ID | 用户提供的 servWorkId 参数 |
| `{detectRecordId}` | 识别记录ID | 从通话记录中获取的 detectRecordId |
| `{ak}` | AK Token 值 | 从 .auth 文件读取或用户输入 |

## 环境域名映射

| 数据来源 | 域名 |
|---------|------|
| 测试（默认） | `https://test3-admin.xiujiadian.com` |
| 生产 | `https://admin.xiujiadian.com` |

## 执行步骤

### Step 1: 确定查询参数

从用户消息中提取以下参数：
- **servWorkId**（必填）：若未提供，用 `ask_user_question` 询问
- **数据来源**：默认为"测试"，用户说"生产"/"线上"/"正式"时切换为生产环境

### Step 2: 读取 AK

在执行查询前，agent 需先获取 AK：

1. 读取 `{skillDir}/.auth` 文件，解析出 `AK` 字段
2. 如果文件不存在或 `AK` 为空，使用 `ask_user_question` 向用户询问：
   - 问题："请提供 AK Bearer Token 用于接口认证"
3. 将获取到的 AK 值用于后续脚本的 `{ak}` 占位符

### Step 3: 调用接口

使用 `run_in_terminal` 执行以下 Node.js 脚本，将占位符替换为实际值后写入临时文件执行：

```javascript
// /tmp/call_record_query.js
const fs = require('fs');

const AK = '{ak}';
const servWorkId = '{servWorkId}';

(async () => {
  try {
    const url = '{baseUrl}/bfm-serv-work/serv/work/listCallRecord?servWorkId=' + servWorkId;
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Authorization': 'Bearer ' + AK
      }
    });

    const text = await res.text();

    try {
      const data = JSON.parse(text);
      
      if (!Array.isArray(data)) {
        console.log('ERROR: 接口返回格式错误，期望数组，raw=' + text.substring(0, 500));
        return;
      }

      // 计算通话时长（秒）
      const getDurationSeconds = (duration) => {
        if (!duration) return 0;
        const parts = duration.split(':').map(Number);
        if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
        if (parts.length === 2) return parts[0] * 60 + parts[1];
        return 0;
      };

      // 优先级筛选：
      // 1. 最高优先级：有 detectRecordId 的记录
      // 2. 次优先级：通话时长 > 10秒 的记录
      let filteredRecords = data.filter(item => item.detectRecordId);
      
      if (filteredRecords.length === 0) {
        // 没有 detectRecordId，回退到通话时长 > 10秒
        filteredRecords = data.filter(item => getDurationSeconds(item.callDuration) > 10);
      }

      if (filteredRecords.length === 0) {
        console.log('RESULT=' + JSON.stringify({
          found: false,
          servWorkId: servWorkId,
          message: '没有找到符合条件的记录（无detectRecordId且通话时长均≤10秒）',
          totalRecords: data.length
        }));
        return;
      }

      // 按 finishTime 降序排序，取第一条（最晚结束的）
      filteredRecords.sort((a, b) => {
        const timeA = new Date(a.finishTime || '1970-01-01').getTime();
        const timeB = new Date(b.finishTime || '1970-01-01').getTime();
        return timeB - timeA;
      });

      const record = filteredRecords[0];
      console.log('RESULT=' + JSON.stringify({
        found: true,
        totalRecords: data.length,
        filteredCount: filteredRecords.length,
        record: {
          callRecordId: record.callRecordId,
          detectRecordId: record.detectRecordId,
          callTypeName: record.callTypeName,
          peerTypeName: record.peerTypeName,
          callerNo: record.callerNo,
          calledNo: record.calledNo,
          xnoNo: record.xnoNo,
          startTime: record.startTime,
          finishTime: record.finishTime,
          callDuration: record.callDuration,
          connect: record.connect,
          answer: record.answer,
          finishState: record.finishState,
          hangup: record.hangup,
          typeName: record.typeName,
          tapeUrl: record.tapeUrl,
          tapeArchived: record.tapeArchived,
          status: record.status
        }
      }));

    } catch (e) {
      console.log('ERROR: 无法解析响应，raw=' + text.substring(0, 500));
    }
  } catch (e) {
    console.log('ERROR: ' + e.message);
  }
})();
```

```bash
node /tmp/call_record_query.js
```

### Step 4: 获取语音转文字内容

**触发条件**：Step 3 返回的记录中包含 `detectRecordId` 字段时，**必须执行此步骤**。

由于语音转文字接口是**分页接口**，需要循环调用直到获取所有对话内容。

使用 `run_in_terminal` 执行以下 Node.js 脚本：

```javascript
// /tmp/voice_content_query.js
const AK = '{ak}';
const detectRecordId = '{detectRecordId}';
const PAGE_SIZE = 100;

(async () => {
  try {
    let allItems = [];
    let pageIndex = 1;
    let total = 0;
    let hasMore = true;

    // 循环分页获取所有数据
    while (hasMore) {
      const url = '{baseUrl}/bfm-mds/detectRecord/voiceRecord/content?detectRecordId=' + detectRecordId + '&pageIndex=' + pageIndex + '&pageSize=' + PAGE_SIZE;
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Authorization': 'Bearer ' + AK
        }
      });

      const text = await res.text();
      const data = JSON.parse(text);

      if (data.status !== 0) {
        console.log('ERROR: 接口返回错误，msg=' + (data.msg || JSON.stringify(data)));
        return;
      }

      if (!data.data || !data.data.items) {
        console.log('ERROR: 接口返回数据格式错误，raw=' + text.substring(0, 500));
        return;
      }

      // 记录总数（首次获取）
      if (pageIndex === 1) {
        total = data.data.total || 0;
      }

      // 转换 role 为可读名称
      const roleMap = { 1: '工程师', 2: '用户' };
      const items = data.data.items.map(item => ({
        role: roleMap[item.role] || '未知',
        text: item.text,
        beginTime: item.beginTime,
        endTime: item.endTime,
        silenceDuration: item.silenceDuration
      }));

      allItems = allItems.concat(items);

      // 判断是否还有更多数据
      if (data.data.items.length < PAGE_SIZE || allItems.length >= total) {
        hasMore = false;
      } else {
        pageIndex++;
      }
    }

    console.log('VOICE_CONTENT=' + JSON.stringify({
      success: true,
      detectRecordId: detectRecordId,
      total: total,
      fetchedCount: allItems.length,
      pageCount: pageIndex,
      items: allItems
    }));

  } catch (e) {
    console.log('ERROR: ' + e.message);
  }
})();
```

```bash
node /tmp/voice_content_query.js
```

**分页逻辑说明**：
- 每页获取 100 条记录（PAGE_SIZE=100）
- 循环调用直到：当前页返回数据少于 PAGE_SIZE，或已获取数量 >= total
- 合并所有页的数据后统一输出

### Step 5: 解析响应并展示

**解析结果：**

- 如果输出 `RESULT={...}`，解析 JSON 并展示
- **查询成功后**，如果 AK 是用户手动输入的（即 `.auth` 文件之前不存在或 AK 为空），将 AK 保存到 `{skillDir}/.auth` 文件：
  ```
  AK=<用户输入的ak值>
  ```

**成功找到记录时**，展示以下字段：

| 展示名称 | JSON 字段 | 说明 |
|---------|-----------|------|
| 通话记录ID | callRecordId | 通话记录唯一标识 |
| 识别记录ID | detectRecordId | 语音识别记录ID（最高优先级筛选条件） |
| 呼叫类型 | callTypeName | 如：工程师 |
| 对方类型 | peerTypeName | 如：用户 |
| 主叫号码 | callerNo | 主叫方号码（脱敏） |
| 被叫号码 | calledNo | 被叫方号码（脱敏） |
| 小号号码 | xnoNo | 中间号码 |
| 开始时间 | startTime | 通话开始时间 |
| 结束时间 | finishTime | 通话结束时间 |
| 通话时长 | callDuration | 格式 HH:MM:SS |
| 是否接通 | connect | 是/否 |
| 是否接听 | answer | 是/否 |
| 结束状态 | finishState | 如：主叫挂机 |
| 挂断方 | hangup | 如：被叫结束 |
| 通话类型 | typeName | 如：小号通话 |
| 录音地址 | tapeUrl | 录音文件URL |

同时展示：`共 {totalRecords} 条通话记录，筛选出 {filteredCount} 条符合条件的记录`

**如果有 detectRecordId**，继续展示语音转文字内容：

#### 语音转文字内容展示

| 展示名称 | JSON 字段 | 说明 |
|---------|-----------|------|
| 角色 | role | 工程师/用户 |
| 文本 | text | 语音转写的文字内容 |
| 开始时间 | beginTime | 毫秒 |
| 结束时间 | endTime | 毫秒 |
| 静音时长 | silenceDuration | 秒 |

输出结果还包含：
- `total`: 总记录数
- `fetchedCount`: 实际获取的记录数
- `pageCount`: 分页调用次数

展示格式为对话形式：
```
### 语音转文字内容（共 X 条，分 Y 页获取）

[用户] 五秒家庭维修来电。
[工程师] 你好。
[工程师] 哎，我看你一人的说一个电视要维修啊。
[用户] 不是明天十点要打电话吗？
[工程师] 好，明天十点左右是吧？
[用户] 嗯。
[工程师] 好的，好。
```

**未找到符合条件的记录时**：展示 "没有找到符合条件的记录（无detectRecordId且通话时长均≤10秒），共 {totalRecords} 条记录"

**失败时 (输出 ERROR:)**：展示错误信息给用户

## 错误处理

| 错误场景 | 处理方式 |
|---------|---------|
| .auth 文件不存在或 AK 为空 | 使用 `ask_user_question` 向用户询问 AK，查询成功后自动保存到 `.auth` 文件 |
| AK 无效或过期 | 提示用户重新提供 AK，查询成功后自动更新 `.auth` 文件 |
| 接口返回非数组格式 | 展示格式错误信息 |
| 语音转文字接口失败 | 展示错误信息，但不影响通话记录的展示 |
| 网络超时或连接失败 | 提示检查网络连接，确认 VPN 是否开启 |
| servWorkId 未提供 | 提示用户必须提供服务工单ID |

## 示例

**用户输入**：查询工单 6127320892848290944 的通话记录

**AI 执行流程**：
1. 确定参数 → servWorkId=6127320892848290944, 数据来源=测试
2. 从 `.auth` 文件读取 AK
3. 调用 `https://test3-admin.xiujiadian.com/bfm-serv-work/serv/work/listCallRecord?servWorkId=6127320892848290944`
4. 按优先级筛选：先找有detectRecordId的记录，否则找通话时长>10秒的记录
5. 按结束时间降序排序，取第一条
6. 如果有 detectRecordId，调用语音转文字接口获取对话内容
7. 展示结果

**输出示例**：

```
## 通话记录查询结果（测试环境）

共 5 条通话记录，筛选出 3 条时长大于10秒的记录

### 符合条件的最新通话记录

| 字段 | 值 |
|------|-----|
| 通话记录ID | 69ba51ece9a1703cd9bc34bb |
| 识别记录ID | 124285159181370163 |
| 呼叫类型 | 工程师 |
| 对方类型 | 用户 |
| 主叫号码 | 156****1372 |
| 被叫号码 | 177****0095 |
| 小号号码 | 13034941412 |
| 开始时间 | 2026-03-18 15:18:46 |
| 结束时间 | 2026-03-18 15:19:08 |
| 通话时长 | 00:00:22 |
| 是否接通 | 是 |
| 是否接听 | 是 |
| 结束状态 | 主叫挂机 |
| 挂断方 | 被叫结束 |
| 通话类型 | 小号通话 |
| 录音地址 | [点击播放](录音URL) |

### 语音转文字内容（共 7 条，分 1 页获取）

[用户] 五秒家庭维修来电。
[工程师] 你好。
[工程师] 哎，我看你一人的说一个电视要维修啊。
[用户] 不是明天十点要打电话吗？
[工程师] 好，明天十点左右是吧？
[用户] 嗯。
[工程师] 好的，好。
```

## Guardrails

- servWorkId 为必填参数，未提供时必须向用户确认
- 数据来源默认为"测试"，用户明确说"生产"/"线上"/"正式"时才使用生产环境
- 不要在终端输出中暴露 AK 值
- 筛选优先级：detectRecordId 存在 > 通话时长 > 10秒
- 结束时间排序为降序，取最晚的一条记录
- Node.js 脚本先写入临时文件再执行
- 录音地址可能包含签名参数，展示时注意不要截断
- 语音转文字接口在有 detectRecordId 时**必须调用**
- 语音转文字接口为分页接口，需循环调用获取所有对话
- 语音转文字内容按对话形式展示，标注角色（工程师/用户）
