---
name: create-track-task 
description: 根据跟单ID和工单ID创建跟单任务。通过 AK Bearer Token 认证，调用跟单系统 API 获取跟单数据。
---

# 创建跟单任务

根据跟单ID和工单ID创建跟单任务。流程：获取权限 → 查询跟单详情 → 转换入参并创建任务 → 返回任务ID。

## 入参说明

| 参数名         | 类型      | 必填  | 说明    |
| ----------- | ------- | --- | ----- |
| trackWorkId | Long    | 是   | 跟单ID  |
| workId      | Long    | 是   | 工单ID  |
| taskItemId  | Integer | 是   | 任务项ID |
| env         | String  | 否   | 环境，传入 `生产` 时使用生产环境，默认测试环境 |

---

## Step 1: 权限获取

### .auth 文件配置

路径：`{skillDir}/.auth`，格式如下：

```
AK=<your_ak_token>
```

### 认证方式

所有接口使用 AK Bearer Token 认证，请求头：`Authorization: Bearer <AK>`

### .auth 文件解析

```javascript
const fs = require('fs');
const authContent = fs.readFileSync('{skillDir}/.auth', 'utf8');
const authConfig = {};
authContent.split('\n').forEach(line => {
  const idx = line.indexOf('=');
  if (idx > 0) authConfig[line.substring(0, idx).trim()] = line.substring(idx + 1).trim();
});
// authConfig.AK 即为 Token
```

---

## Step 2: 查询跟单详情

### 环境域名映射

| 数据来源 | 域名 |
|---------|------|
| 测试（默认） | `https://test3-track.xiujiadian.com` |
| 生产 | `https://track.xiujiadian.com` |

### API 端点

```
GET {baseUrl}/amis/track/detail?trackWorkId={trackWorkId}&workId={workId}
```

### 响应格式（XML）

```xml
<AMISResponseDTO>
  <status>0</status>
  <msg>操作成功</msg>
  <data>
    <trackWorkId>127325906441705088</trackWorkId>
    <workId>6127325899314773120</workId>
    <statusName>待处理</statusName>
    <trackContent>挂起申请</trackContent>
    <cityId>500100</cityId>
    <cityName>重庆市</cityName>
    <companyId>10041</companyId>
    <companyName>重庆公司</companyName>
    <engineerId>45429907</engineerId>
    <engineerName>陈志强</engineerName>
    <engineerPhone>19400001027</engineerPhone>
    <!-- 其他字段省略 -->
  </data>
</AMISResponseDTO>
```

### 响应关键字段

| XML 字段 | 说明 |
|----------|------|
| trackWorkId | 跟单ID |
| workId | 服务工单ID |
| statusName | 跟单状态名称 |
| trackContent | 跟单内容 |
| cityId | 城市ID |
| cityName | 城市名称 |
| companyId | 子公司ID |
| companyName | 子公司名称 |
| engineerId | 工程师ID |
| engineerName | 工程师名称 |
| engineerPhone | 工程师手机号 |

---

## Step 3: 转换入参 & 创建跟单任务

> ⚠️ **强制约束 - 必须严格遵守以下规则**：
> - **禁止跳过 Step 2**：必须先查询跟单详情获取完整数据，再构造请求体
> - **禁止自行添加字段**：请求体中不得包含 `sourceTrackId`、`content`、`level` 等 SKILL 中未定义的字段
> - **bizId 必须使用 trackWorkId**：禁止使用 taskItemId 或其他值！
> - **bizSource 必须使用固定值 40**：禁止使用 11、10 等其他值！
> - **workId 必须映射为 bizOrderId**：不得直接作为顶层字段传递

### 字段映射规则

| 创建任务入参 (TrackTaskCreateDIO) | 来源            | 说明          |
| --------------------------- | ------------- | ----------- |
| **taskItemId**              | 用户指定          | 任务项ID（必填）   |
| **bizId**                   | trackWorkId   | 跟单ID作为业务ID  |
| **bizSource**               | 固定值: 40       | 业务来源=跟单     |
| **bizOrderType**            | 固定值: 2        | 业务单据类型=服务工单 |
| **bizOrderId**              | workId        | 工单ID        |
| **cityId**                  | cityId        | 城市ID（必填）    |
| **cityName**                | cityName      | 城市名称        |
| **subCompanyId**            | companyId     | 子公司ID       |
| **subCompanyName**          | companyName   | 子公司名称       |
| **engineerId**              | engineerId    | 工程师ID       |
| **engineerName**            | engineerName  | 工程师名称       |
| **userTelephone**           | engineerPhone | 手机号（必填）     |
| **plat**                    | 固定值: 10       | 平台（必填）      |

### 创建任务 API 端点

| 数据来源 | 域名 |
|---------|------|
| 测试（默认） | `https://test-ais.xiujiadian.com` |
| 生产 | `https://ais.xiujiadian.com` |

```
POST {aisBaseUrl}/ratel-api/biz-twd/trackTaskModifyRemoteService/addTrackTask
```

### ⚠️ 请求体校验清单（调用 API 前必须逐项核对）

- [ ] `taskItemId` = 用户指定的 taskItemId
- [ ] `bizId` = **trackWorkId**（跟单ID）← **禁止使用 taskItemId！**
- [ ] `bizSource` = **40**（固定值）← **禁止使用其他值（如 11、10 等）！**
- [ ] `bizOrderType` = **2**（固定值）
- [ ] `bizOrderId` = **workId**（工单ID）← 不是顶层 workId 字段！
- [ ] `cityId`、`cityName`、`subCompanyId`、`subCompanyName`、`engineerId`、`engineerName`、`userTelephone`、`plat` 均从 **Step 2 跟单详情响应**中获取
- [ ] 请求体中 **不包含** `sourceTrackId`、`content`、`level` 等未定义字段

### 请求体示例

```json
{
  "taskItemId": 1202,
  "bizId": 127325906441705088,
  "bizSource": 40,
  "bizOrderType": 2,
  "bizOrderId": 6127325899314773120,
  "cityId": 500100,
  "cityName": "重庆市",
  "subCompanyId": 10041,
  "subCompanyName": "重庆公司",
  "engineerId": 45429907,
  "engineerName": "陈志强",
  "userTelephone": "19400001027",
  "plat": 10
}
```

### 响应格式

```json
{
  "success": true,
  "data": 12345678,
  "msg": "操作成功"
}
```

`data` 字段即为创建的跟单任务ID (trackTaskId)。

---

## 完整执行脚本

```javascript
// /tmp/create_track_task_from_detail.js
const fs = require('fs');

// ========== 配置参数 ==========
const skillDir = '{skillDir}';
const trackWorkId = '{trackWorkId}';
const workId = '{workId}';
const taskItemId = {taskItemId};
const env = '{env}'; // '生产' 或其他（默认测试）

// 环境映射
const isProd = env === '生产';
const trackBaseUrl = isProd ? 'https://track.xiujiadian.com' : 'https://test3-track.xiujiadian.com';
const aisBaseUrl = isProd ? 'https://ais.xiujiadian.com' : 'https://test-ais.xiujiadian.com';

// ========== Step 1: 权限获取 ==========
const authContent = fs.readFileSync(skillDir + '/.auth', 'utf8');
const authConfig = {};
authContent.split('\n').forEach(line => {
  const idx = line.indexOf('=');
  if (idx > 0) authConfig[line.substring(0, idx).trim()] = line.substring(idx + 1).trim();
});

if (!authConfig.AK) {
  console.log('ERROR: .auth 文件中未配置 AK');
  process.exit(1);
}
console.log('Step 1: 权限获取成功');

// XML 解析辅助函数
const getXmlValue = (xml, tag) => {
  const match = xml.match(new RegExp(`<${tag}>([^<]*)</${tag}`));
  return match ? match[1] : '';
};

(async () => {
  try {
    // ========== Step 2: 查询跟单详情 ==========
    const detailUrl = `${trackBaseUrl}/amis/track/detail?trackWorkId=${trackWorkId}&workId=${workId}`;
    const detailRes = await fetch(detailUrl, {
      method: 'GET',
      headers: { 'Authorization': 'Bearer ' + authConfig.AK }
    });
    const detailText = await detailRes.text();
    
    const status = getXmlValue(detailText, 'status');
    if (status !== '0') {
      console.log('ERROR: 查询跟单详情失败 - ' + getXmlValue(detailText, 'msg'));
      return;
    }
    
    const track = {
      trackWorkId: getXmlValue(detailText, 'trackWorkId'),
      workId: getXmlValue(detailText, 'workId'),
      trackContent: getXmlValue(detailText, 'trackContent'),
      statusName: getXmlValue(detailText, 'statusName'),
      cityId: getXmlValue(detailText, 'cityId'),
      cityName: getXmlValue(detailText, 'cityName'),
      companyId: getXmlValue(detailText, 'companyId'),
      companyName: getXmlValue(detailText, 'companyName'),
      engineerId: getXmlValue(detailText, 'engineerId'),
      engineerName: getXmlValue(detailText, 'engineerName'),
      engineerPhone: getXmlValue(detailText, 'engineerPhone')
    };
    
    console.log('Step 2: 查询跟单详情成功');
    console.log('  - 跟单ID: ' + track.trackWorkId);
    console.log('  - 工单ID: ' + track.workId);
    console.log('  - 跟单内容: ' + track.trackContent);
    console.log('  - 跟单状态: ' + track.statusName);
    
    // ========== Step 3: 转换入参 & 创建跟单任务 ==========
    const createBody = {
      taskItemId: taskItemId,
      bizId: parseInt(track.trackWorkId),
      bizSource: 40,
      bizOrderType: 2,
      bizOrderId: parseInt(track.workId),
      cityId: parseInt(track.cityId),
      cityName: track.cityName,
      subCompanyId: parseInt(track.companyId),
      subCompanyName: track.companyName,
      engineerId: parseInt(track.engineerId),
      engineerName: track.engineerName,
      userTelephone: track.engineerPhone,
      plat: 10
    };
    
    console.log('\nStep 3: 转换入参');
    console.log(JSON.stringify(createBody, null, 2));
    
    // 调用创建接口
    const createUrl = `${aisBaseUrl}/ratel-api/biz-twd/trackTaskModifyRemoteService/addTrackTask`;
    const createRes = await fetch(createUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + authConfig.AK
      },
      body: JSON.stringify(createBody)
    });
    
    const createText = await createRes.text();
    try {
      const result = JSON.parse(createText);
      if (result.success === true && result.data) {
        console.log('\n========== 创建成功 ==========');
        console.log('跟单任务ID: ' + result.data);
        console.log('SUCCESS: trackTaskId=' + result.data);
      } else {
        console.log('\nERROR: 创建失败 - ' + (result.msg || result.message || JSON.stringify(result)));
      }
    } catch(e) {
      console.log('\nERROR: 响应解析失败 - ' + createText.substring(0, 500));
    }
  } catch (e) {
    console.log('ERROR: ' + e.message);
  }
})();
```

```bash
node /tmp/create_track_task_from_detail.js
```

---

## 占位符说明

| 占位符 | 替换为 | 说明 |
|--------|--------|------|
| `{skillDir}` | SKILL.md 所在目录绝对路径 | 用于定位 .auth 文件 |
| `{trackWorkId}` | 用户提供的跟单ID | 查询参数 |
| `{workId}` | 用户提供的工单ID | 查询参数 |
| `{taskItemId}` | 用户指定的任务项ID | 创建参数（必填，Integer） |
| `{env}` | 用户指定的环境 | `生产` 或其他（默认测试） |
| `{baseUrl}` | 域名根据环境 | 测试: `https://test3-track.xiujiadian.com`，生产: `https://track.xiujiadian.com` |
| `{aisBaseUrl}` | 域名根据环境 | 测试: `https://test-ais.xiujiadian.com`，生产: `https://ais.xiujiadian.com` |

---

## 枚举值参考

### bizOrderType（业务单据类型）- 固定为 2

| 值 | 说明 |
|----|------|
| 1 | 服务订单 |
| 2 | **服务工单** |

### bizSource（业务来源）- 固定为 40

| 值 | 说明 |
|----|------|
| 10 | 派单 |
| 20 | 取消申请 |
| 30 | 改派申请 |
| 40 | **跟单** |
| 50 | 领单超时 |
| 60 | 房屋 |
| 80 | 投诉 |

---

## 异常处理

| 错误类型 | 处理方式 |
|---------|---------|
| .auth 文件不存在或 AK 未配置 | 提示用户配置 .auth 文件 |
| 查询跟单详情失败 | 展示错误信息，检查跟单ID和工单ID是否正确 |
| 创建任务失败 | 展示返回的 msg 字段错误信息 |
| 必填参数缺失 | 使用 ask_user_question 询问用户 |

---

## 输出格式

**成功：**
```
Step 1: 权限获取成功
Step 2: 查询跟单详情成功
  - 跟单ID: 127325906441705088
  - 工单ID: 6127325899314773120
  - 跟单内容: 挂起申请
  - 跟单状态: 待处理

Step 3: 转换入参
{
  "taskItemId": 1202,
  "bizId": 127325906441705088,
  "bizSource": 40,
  "bizOrderType": 2,
  "bizOrderId": 6127325899314773120,
  "cityId": 500100,
  "cityName": "重庆市",
  "subCompanyId": 10041,
  "subCompanyName": "重庆公司",
  "engineerId": 45429907,
  "engineerName": "陈志强",
  "userTelephone": "19400001027",
  "plat": 10
}

========== 创建成功 ==========
跟单任务ID: 127330734477002620
SUCCESS: trackTaskId=127330734477002620
```

**失败：**
```
ERROR: 查询跟单详情失败 - 未找到该跟单
```
或
```
ERROR: 创建失败 - 任务项ID不存在
```
