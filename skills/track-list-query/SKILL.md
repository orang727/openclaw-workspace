---
name: track-list-query
description: 根据跟单内容等参数查询跟单系统的跟单列表。通过 AK Bearer Token 认证，调用跟单系统 API 获取跟单数据。
license: MIT
metadata:
  author: zmn
  version: "2.0"
---

# 跟单列表查询

根据用户提供的查询条件（跟单内容、工单号、跟单类型、跟单状态、跟单等级、发起时间等），查询跟单系统的跟单列表并展示结果。

**Input**: 用户提供查询参数，跟单内容为必填项，其他参数可选。

## 参数说明

| 参数 | 必选 | 说明 | API 字段 | 示例 |
|------|------|------|----------|------|
| 跟单内容ID | 是 | 跟单内容 ID 列表 | trackContentIdList | [1101,1151] |
| 数据来源 | 否 | 生产或测试，默认为测试 | — | 测试 |
| 工单号 | 否 | 工单号 | code | 123456789 |
| 跟单类型 | 否 | 跟单类型值 | trackType | 1 |
| 跟单状态 | 否 | 1=待处理 2=处理中 3=已完结 | status | 1 |
| 跟单等级 | 否 | 跟单等级值 | trackLevel | 1 |
| 发起时间 | 否 | 时间范围，格式 "YYYY-MM-DD,YYYY-MM-DD" | createTime | "2026-03-01,2026-03-21" |
| 每页条数 | 否 | 默认 10 | perPage | 10 |
| 页码 | 否 | 默认 1 | page | 1 |

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
| `{baseUrl}` | 接口域名 | 测试: `https://test3-track.xiujiadian.com`，生产: `https://track.xiujiadian.com` |
| `{requestBody}` | 构建好的 JSON 请求体字符串 | 包含所有查询参数 |
| `{ak}` | AK Token 值 | 从 .auth 文件读取或用户输入 |

## 环境域名映射

| 数据来源 | 域名 |
|---------|------|
| 测试（默认） | `https://test3-track.xiujiadian.com` |
| 生产 | `https://track.xiujiadian.com` |

## 执行步骤

### Step 1: 确定查询参数

从用户消息中提取以下参数：
- **跟单内容ID**（必填）：若未提供，用 `ask_user_question` 询问
- **数据来源**：默认为"测试"，用户说"生产"/"线上"/"正式"时切换为生产环境
- **其他可选参数**：工单号、跟单类型、跟单状态、跟单等级、发起时间、每页条数、页码

### Step 2: 构建请求参数

根据用户提供的查询条件，构建 JSON 请求体。

**请求体模板**：

```json
{
  "trackContentIdList": [1101,1151],
  "page": 1,
  "perPage": 10
}
```

**可选字段映射**（用户提供时才加入请求体）：

| 用户参数 | JSON 字段 | 类型 |
|---------|-----------|------|
| 工单号 | code | Long |
| 跟单类型 | trackType | Integer |
| 跟单状态 | status | Integer |
| 跟单等级 | trackLevel | Integer |
| 发起时间 | createTime | String ("YYYY-MM-DD,YYYY-MM-DD") |

### Step 3: 读取 AK

在执行查询前，agent 需先获取 AK：

1. 读取 `{skillDir}/.auth` 文件，解析出 `AK` 字段
2. 如果文件不存在或 `AK` 为空，使用 `ask_user_question` 向用户询问：
   - 问题："请提供 AK Bearer Token 用于接口认证"
3. 将获取到的 AK 值用于后续脚本的 `{ak}` 占位符

### Step 4: 调用接口

使用 `run_in_terminal` 执行以下 Node.js 脚本，将占位符替换为实际值后写入临时文件执行：

```javascript
// /tmp/track_list_query.js
const fs = require('fs');

const AK = '{ak}';
const requestBody = {requestBody};

(async () => {
  try {
    const res = await fetch('{baseUrl}/amis/track/list', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': 'Bearer ' + AK
      },
      body: JSON.stringify(requestBody)
    });

    const text = await res.text();

    // 尝试 JSON 解析
    try {
      const data = JSON.parse(text);
      if (data.status === 0 && data.data) {
        console.log('RESULT=' + JSON.stringify({
          total: data.data.total,
          items: (data.data.items || []).map(item => ({
            trackWorkId: item.trackWorkId,
            statusName: item.statusName,
            trackContent: item.trackContent,
            reasonName: item.reasonName,
            trackTypeName: item.trackTypeName,
            trackLevelName: item.trackLevelName,
            createTime: item.createTime,
            workId: item.workId,
            promoter: item.promoter,
            operateRemark: item.operateRemark
          }))
        }));
      } else {
        console.log('ERROR: 查询失败，msg=' + (data.msg || JSON.stringify(data)));
      }
    } catch (e) {
      // 尝试从 XML 提取
      const statusMatch = text.match(/<status>(\d+)<\/status>/);
      if (statusMatch && statusMatch[1] === '0') {
        console.log('XML_RESPONSE: 接口返回了 XML 格式，请添加 Accept: application/json 头');
      } else {
        console.log('ERROR: 无法解析响应，raw=' + text.substring(0, 500));
      }
    }
  } catch (e) {
    console.log('ERROR: ' + e.message);
  }
})();
```

```bash
node /tmp/track_list_query.js
```

### Step 5: 解析响应并展示

**解析结果：**

- 如果输出 `RESULT={...}`，解析 JSON 并以表格形式展示
- **查询成功后**，如果 AK 是用户手动输入的（即 `.auth` 文件之前不存在或 AK 为空），将 AK 保存到 `{skillDir}/.auth` 文件：
  ```
  AK=<用户输入的ak值>
  ```

**成功时**，从结果中提取以下字段展示：

| 展示名称 | JSON 字段 | 说明 |
|---------|-----------|------|
| 跟单ID | trackWorkId | 跟单唯一标识 |
| 跟单状态 | statusName | 待处理/处理中/已完结 |
| 跟单内容 | trackContent | 跟单内容名称 |
| 跟单缘由 | reasonName | 跟单缘由名称 |
| 跟单类型 | trackTypeName | 跟单类型名称 |
| 跟单等级 | trackLevelName | 跟单等级名称 |
| 发起时间 | createTime | 跟单创建时间 |
| 工单号 | workId | 关联工单号 |
| 发起人 | promoter | 发起人姓名 |
| 处理说明 | operateRemark | 最近处理说明 |

同时展示：`共 {total} 条记录，当前第 {page} 页，每页 {perPage} 条`

**失败时 (输出 ERROR:)**：展示错误信息给用户

## 错误处理

| 错误场景 | 处理方式 |
|---------|---------|
| .auth 文件不存在或 AK 为空 | 使用 `ask_user_question` 向用户询问 AK，查询成功后自动保存到 `.auth` 文件 |
| AK 无效或过期 | 提示用户重新提供 AK，查询成功后自动更新 `.auth` 文件 |
| 接口返回非 0 status | 展示 msg 中的错误信息 |
| 网络超时或连接失败 | 提示检查网络连接，确认 VPN 是否开启 |
| 跟单内容 ID 未提供 | 提示用户必须提供跟单内容 ID（trackContentIdList） |

## 示例

**用户输入**：查询跟单内容 ID 为 [1101,1151]，状态为待处理的跟单

**AI 执行流程**：
1. 确定参数 → trackContentIdList=[1101,1151], status=1, 数据来源=测试
2. 构建请求体：`{"trackContentIdList":[1101,1151],"status":1,"page":1,"perPage":10}`
3. 从 `.auth` 文件读取 AK，调用 `https://test3-track.xiujiadian.com/amis/track/list`
4. 解析响应并以表格展示跟单列表

**输出示例**：

```
## 跟单列表查询结果（测试环境）

共 25 条记录，当前第 1 页，每页 10 条

| 跟单ID | 状态 | 跟单内容 | 跟单缘由 | 类型 | 等级 | 发起时间 | 工单号 | 发起人 |
|--------|------|---------|---------|------|------|---------|-------|--------|
| 10001 | 待处理 | 安装问题 | 客户投诉 | 售后 | 紧急 | 2026-03-20 | 98765 | 张三 |
| 10002 | 待处理 | 维修延迟 | 超时未完成 | 售后 | 普通 | 2026-03-19 | 98766 | 李四 |
...
```

## Guardrails

- 跟单内容 ID (trackContentIdList) 为必填参数，未提供时必须向用户确认
- 跟单内容 ID 列表中数字之间不加空格，如 `[1101,1151]`
- 数据来源默认为"测试"，用户明确说"生产"/"线上"/"正式"时才使用生产环境
- 不要在终端输出中暴露 AK 值
- 如果返回数据量过大（超过 50 条），建议用户增加筛选条件
- 发起时间格式必须为 "YYYY-MM-DD,YYYY-MM-DD"，逗号分隔起止日期
- Node.js 脚本先写入 `/tmp/track_list_query.js` 临时文件再执行
- 先用 `.text()` 获取原始响应，再判断是 JSON 还是 XML 格式进行解析
