---
name: intent-router
description: 意图路由技能。根据输入的意图类型进行路由映射，输出标准路由标签。不进行意图识别，仅做路由映射。
---

# 意图路由 Skill

## 功能说明

本技能接收跟单ID和预设的意图识别结果，直接进行路由映射，输出标准路由标签。

**不调用任何意图识别API**，仅做路由映射。

## 输入参数

| 参数 | 必填 | 说明 | 枚举值 |
|------|------|------|--------|
| trackWorkId | 是 | 跟单ID | - |
| intentType | 是 | 意图类型 | type1/type2/type3/type4 |

## 意图类型枚举

| 类型 | 含义 | 路由结果 |
|------|------|----------|
| type1 | 确认上门 | 确认上门 |
| type2 | 用户询价 | 取消 |
| type3 | 取消 | 取消 |
| type4 | 其他意图 | 其他意图 |

## 输出格式

```json
{
  "trackWorkId": "跟单ID",
  "workId": "工单ID",
  "intentType": "type1",
  "routeResult": "确认上门"
}
```

## 执行步骤

### Step 1: 参数校验
校验 trackWorkId 和 intentType 是否合法

### Step 2: 查询跟单信息
根据 trackWorkId 查询关联的工单号等信息

### Step 3: 路由映射
将 intentType 映射为标准路由标签

### Step 4: 返回结果

## 路由映射规则

| intentType 输入 | routeResult 输出 |
|-----------------|------------------|
| type1 | 确认上门 |
| type2 | 取消 |
| type3 | 取消 |
| type4 | 其他意图 |
