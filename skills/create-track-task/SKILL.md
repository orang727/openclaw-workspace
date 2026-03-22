---
name: create-track-task
description: 调用跟单任务创建接口，通过 HTTP POST 请求在测试环境创建新的跟单任务。支持自动登录获取 Session 和 Ratel 网关签名。
trigger_words: ["创建跟单任务", "跟单", "track task", "添加跟单"]
---

# 创建跟单任务

## 接口信息

- **接口地址**: `https://test3-admin.xiujiadian.com/ratel/biz-twd/trackTaskModifyRemoteService/addTrackTask`
- **请求方法**: POST
- **Content-Type**: application/json
- **环境**: 测试环境 (test3)

## 认证信息

- **app-key**: `254B4EF88B5303E`
- **secret_key**: `2c0c38615fa4465ea76a800e2cba26e4`
- **登录接口**: `https://test3-mcc.xiujiadian.com/cas/login.action`

## 签名算法

参考 `ratel_sign.py`：

```python
# 签名格式: METHOD&SECRET_KEY&/&TIMESTAMP&URL_ENCODE(SORTED_QUERY_PARAMS&BODY)
string_to_sign = "&".join([
    method.upper(),           # POST
    secret_key,               # 2c0c38615fa4465ea76a800e2cba26e4
    special_url_encode("/"),  # %2F
    str(timestamp),           # 毫秒时间戳
    special_url_encode(sorted_query_string),  # URL编码后的参数
])
signature = md5(string_to_sign.encode("utf-8")).hexdigest()
```

## 调用示例

```python
from api_client import create_track_task_with_auth

# 创建跟单任务
result = create_track_task_with_auth(
    task_data={
        "bizOrderId": "123420282989890689",  # 工单ID
        "bizId": "123420282989890689",       # 跟单ID
        "taskItemId": 2003,                   # 跟单任务code
        "operatorRemark": "创建跟单任务"
    },
    username="zmn001879",
    password="8888888"
)

print(result)
# 输出: {"success": true, "status": 200, "data": 127212674567489409}
```

## 核心参数

| 字段名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| bizOrderId | string | 是 | 工单ID |
| bizId | string | 是 | 跟单ID |
| taskItemId | number | 是 | 跟单任务code |
| operatorRemark | string | 否 | 操作备注 |
| operateTime | string | 是 | 操作时间（自动填充） |

## 文件结构

```
create-track-task/
├── SKILL.md          # 本说明文档
├── api_client.py     # API 客户端（登录、签名、接口调用）
├── config.py         # 环境配置（密钥、URL）
└── ratel_sign.py     # Ratel 签名算法参考
```

## 使用方式

**方式 1：交互式输入（推荐，密码不保存）**
```python
from api_client import prompt_and_login, create_track_task

# 1. 交互式登录（提示输入用户名密码）
session = prompt_and_login()

# 2. 创建跟单任务
result = create_track_task(
    task_data={"bizOrderId": "xxx", "bizId": "xxx", "taskItemId": 2003},
    session=session
)
```

**方式 2：代码中传入凭据（密码不会保存到文件）**
```python
from api_client import login, create_track_task

# 1. 登录（只保存 session cookies，不保存密码）
session = login("zmn001879", "8888888")

# 2. 创建跟单任务
result = create_track_task(
    task_data={"bizOrderId": "xxx", "bizId": "xxx", "taskItemId": 2003},
    session=session
)
```

**方式 3：使用已缓存的 Session（无需重复登录）**
```python
from api_client import create_track_task_with_auth

# 如果本地有有效的 Session，直接使用；否则抛出异常提示登录
result = create_track_task_with_auth(
    task_data={"bizOrderId": "xxx", "bizId": "xxx", "taskItemId": 2003}
)
```
