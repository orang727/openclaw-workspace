---
name: call-record-query_v3
description: |-
  根据跟单ID获取工单ID，再查询通话记录并获取语音转文字内容。
  完整流程：跟单ID → 工单ID → 通话记录 → 语音转文字
license: MIT
metadata:
  author: zmn
  version: "1.0"
  tags:
    - 跟单查询
    - 通话记录
    - 语音转文字
---

# 通话记录查询 v3（跟单ID版）

根据用户提供的**跟单ID**（trackWorkId），完成以下完整流程：

1. **Step 1**: 通过跟单ID查询工单ID
2. **Step 2**: 通过工单ID查询通话记录
3. **Step 3**: 获取语音转文字内容

## 参数说明

| 参数 | 必选 | 说明 | 示例 |
|------|------|------|------|
| trackWorkId | 是 | 跟单ID | 127325663565551233 |
| 数据来源 | 否 | 生产或测试，默认为生产 | 生产 |

## 环境域名映射

| 数据来源   | 域名                                   |
| ------ | ------------------------------------ |
| 测试(默认) | `https://test3-admin.xiujiadian.com` |
| 生产     | `https://ais.xiujiadian.com/public`  |

## 认证说明

- 请求头：`Authorization: Bearer <AK>`
- 从 `.auth` 文件读取 `AK` 字段

### .auth 文件格式

路径：与 SKILL.md 同目录下的 `.auth` 文件：
```
AK=<your_ak_token>
```

## 执行步骤

### Step 1: 跟单ID → 工单ID

调用接口：
```
POST https://test3-track.xiujiadian.com/amis/track/list
Content-Type: application/json
Authorization: Bearer {ak}
Body: {"trackWorkId": "{trackWorkId}"}
```

解析响应获取 `workId` 字段。

### Step 2: 工单ID → 通话记录

调用接口：
```
GET https://test3-admin.xiujiadian.com/bfm-serv-work/serv/work/listCallRecord?servWorkId={workId}
Authorization: Bearer {ak}
```

筛选规则：
1. 优先选有 `detectRecordId` 的记录
2. 次选通话时长 > 10秒 的记录
3. 取结束时间最晚的一条

### Step 3: 获取语音转文字

当 Step 2 返回有 `detectRecordId` 时，调用：
```
GET https://test3-admin.xiujiadian.com/bfm-mds/detectRecord/voiceRecord/content?detectRecordId={detectRecordId}&pageIndex=1&pageSize=100
```

## 输出格式

```json
{
  "success": true,
  "trackWorkId": "跟单ID",
  "workId": "工单ID",
  "callRecord": {
    "callRecordId": "通话记录ID",
    "detectRecordId": "识别记录ID",
    "callTypeName": "工程师",
    "peerTypeName": "用户",
    "startTime": "开始时间",
    "finishTime": "结束时间",
    "callDuration": "00:00:22",
    "tapeUrl": "录音地址"
  },
  "voiceText": {
    "total": 10,
    "items": [
      {"role": "用户", "text": "对话内容", "beginTime": 0, "endTime": 5000},
      {"role": "工程师", "text": "对话内容", "beginTime": 5000, "endTime": 12000}
    ]
  }
}
```

## 错误处理

| 错误场景 | 处理方式 |
|---------|---------|
| trackWorkId 未提供 | 询问用户 |
| 获取工单ID失败 | 展示错误信息 |
| 无通话记录 | 展示"未找到通话记录" |
| 无语音转文字 | 展示通话记录但不包含对话内容 |
