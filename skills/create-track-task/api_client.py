# -*- coding: utf-8 -*-
"""
跟单任务 API 客户端
封装了登录、签名和接口调用的完整流程
"""

import json
import time
import os
from datetime import datetime
from urllib.parse import quote, urlparse, parse_qs
from hashlib import md5
import requests
from typing import Optional, Tuple, Dict, Any

# 导入配置常量
from config import (
    get_app_key,
    get_secret_key,
    get_base_url,
    get_login_url,
    get_track_task_url,
    LOGIN_PATH,
    TRACK_TASK_PATH,
    TOKEN_FILE,
    TOKEN_MAX_AGE_HOURS,
    DEFAULT_TRACK_TASK_PARAMS,
    set_environment,
    ENV_DEV,
    ENV_TEST,
    ENV_PROD
)


# ============ 日志记录 ============
LOGS_DIR = os.path.join(os.path.dirname(__file__), "logs")


def log_api_call(action: str, request_data: Dict, response_data: Dict, error: str = None):
    """
    记录 API 调用日志
    
    Args:
        action: 操作类型（如 login, create_track_task）
        request_data: 请求数据
        response_data: 响应数据
        error: 错误信息（如果有）
    """
    # 确保日志目录存在
    if not os.path.exists(LOGS_DIR):
        os.makedirs(LOGS_DIR)
    
    # 生成日志文件名（按日期）
    date_str = datetime.now().strftime("%Y%m%d")
    log_file = os.path.join(LOGS_DIR, f"api_calls_{date_str}.log")
    
    # 构建日志记录
    log_entry = {
        "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "action": action,
        "request": request_data,
        "response": response_data,
    }
    
    if error:
        log_entry["error"] = error
    
    # 追加写入日志文件
    with open(log_file, "a", encoding="utf-8") as f:
        f.write(json.dumps(log_entry, ensure_ascii=False) + "\n")


# ============ URL 构建 ============
# 函数已移至 config.py


# ============ URL 构建 ============
# 函数已移至 config.py


# ============ 签名生成 ============
def special_url_encode(value: str) -> str:
    """对齐 Java DefaultSignGenerator.specialUrlEncode"""
    return quote(str(value) if value is not None else "", safe="", encoding="utf-8")


def generate_sign(url: str, method: str, secret_key: str, timestamp: int, body_dict: Dict) -> Tuple[str, str]:
    """
    生成 Ratel 网关签名（对齐 ratel_sign.py）
    
    签名格式: METHOD&SECRET_KEY&/&TIMESTAMP&URL_ENCODE(SORTED_QUERY_PARAMS&BODY)
    
    Args:
        url: 完整请求 URL
        method: HTTP 方法 (GET/POST)
        secret_key: 密钥
        timestamp: 毫秒级时间戳
        body_dict: 请求体字典
    
    Returns:
        (sign, body_str) - 签名和规范化后的请求体 JSON
    """
    # 规范化 body：按 key 排序并序列化
    body_str = json.dumps(body_dict, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
    
    # 解析 URL query 参数，按 key 字典序参与签名
    parsed = urlparse(url)
    qp = {k: v[0] for k, v in parse_qs(parsed.query, keep_blank_values=True).items()}
    parts = [f"{special_url_encode(k)}={special_url_encode(v)}" for k, v in sorted(qp.items())]
    
    # body 追加到最后
    parts.append(special_url_encode(body_str))
    
    sorted_query_string = "&".join(parts)
    
    # 拼接签名字符串
    string_to_sign = "&".join([
        method.upper(),
        secret_key,
        special_url_encode("/"),
        str(timestamp),
        special_url_encode(sorted_query_string),
    ])
    
    signature = md5(string_to_sign.encode("utf-8")).hexdigest()
    return special_url_encode(signature), body_str


def get_ratel_headers(body_dict: Dict, url: str = None, method: str = "POST", env: str = None) -> Tuple[Dict[str, str], str]:
    """
    获取 Ratel 网关所需的请求头
    
    Args:
        body_dict: 请求体字典
        url: 请求 URL（默认使用跟单任务接口）
        method: HTTP 方法
        env: 环境类型 (dev/test/prod)
    
    Returns:
        (headers, body_str) - 包含 app-key、timestamp、sign 的请求头字典和请求体
    """
    if url is None:
        url = get_track_task_url(env)
    
    timestamp = int(time.time() * 1000)
    app_key = get_app_key(env)
    secret_key = get_secret_key(env)
    sign, body_str = generate_sign(url, method, secret_key, timestamp, body_dict)
    
    headers = {
        "Content-Type": "application/json",
        "app-key": app_key,
        "timestamp": str(timestamp),
        "sign": sign,
    }
    
    return headers, body_str


# ============ Token 管理 ============
def load_token() -> Optional[Dict]:
    """从本地加载 Token"""
    if os.path.exists(TOKEN_FILE):
        try:
            with open(TOKEN_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError):
            return None
    return None


def save_token(token_data: Dict) -> None:
    """保存 Token 到本地"""
    with open(TOKEN_FILE, 'w', encoding='utf-8') as f:
        json.dump(token_data, f, ensure_ascii=False, indent=2)


def is_token_valid(token_data: Dict, max_age_hours: int = None) -> bool:
    """检查 Token 是否在有效期内"""
    if not token_data:
        return False
    
    # 支持 token 或 cookies 方式
    if not token_data.get("token") and not token_data.get("cookies"):
        return False
    
    if max_age_hours is None:
        max_age_hours = TOKEN_MAX_AGE_HOURS
    
    timestamp = token_data.get("timestamp", 0)
    max_age_ms = max_age_hours * 60 * 60 * 1000
    return int(time.time() * 1000) - timestamp < max_age_ms


# ============ 登录接口 ============
def login(username: str, password: str, env: str = None) -> requests.Session:
    """
    调用登录接口获取 Session
    
    Args:
        username: 用户名
        password: 密码
        env: 环境类型
    
    Returns:
        登录成功的 Session 对象
    
    Raises:
        Exception: 登录失败时抛出异常
    """
    url = get_login_url(env)
    
    session = requests.Session()
    request_data = {"url": url, "username": username}
    
    try:
        response = session.post(url, json={
            "staffName": username,
            "password": password
        })
        result = response.json()
        
        # 记录日志
        log_api_call("login", request_data, result)
        
        if result.get("status") == 200:
            # 只保存 cookies，不保存用户名密码
            save_token({
                "cookies": dict(session.cookies),
                "timestamp": int(time.time() * 1000)
            })
            return session
        else:
            raise Exception(f"登录失败: {result.get('message', '未知错误')}")
    except Exception as e:
        # 记录错误日志
        log_api_call("login", request_data, {}, error=str(e))
        raise


# ============ 跟单任务接口 ============
def create_track_task(
    task_data: Dict,
    session: requests.Session = None,
    env: str = None
) -> Dict[str, Any]:
    """
    创建跟单任务
    
    Args:
        task_data: 任务数据字典
        session: 可选，传入已登录的 Session
        env: 环境类型 (dev/test/prod)，默认使用当前环境
    
    Returns:
        API 响应结果
    """
    url = get_track_task_url(env)
    
    # 准备默认参数（从配置导入）
    default_params = DEFAULT_TRACK_TASK_PARAMS.copy()
    default_params["operateTime"] = time.strftime("%Y-%m-%d %H:%M:%S")
    
    # 合并参数
    params = {**default_params, **task_data}
    
    # 生成签名和请求头
    headers, body_str = get_ratel_headers(params, url, "POST", env)
    
    # 发送请求
    if session is None:
        session = requests.Session()
    
    request_data = {"url": url, "headers": headers, "body": json.loads(body_str)}
    
    try:
        response = session.post(url, data=body_str.encode('utf-8'), headers=headers)
        result = response.json()
        
        # 记录日志
        log_api_call("create_track_task", request_data, result)
        
        return result
    except Exception as e:
        # 记录错误日志
        log_api_call("create_track_task", request_data, {}, error=str(e))
        raise


# ============ 便捷调用函数 ============
def create_track_task_with_auth(
    task_data: Dict,
    username: Optional[str] = None,
    password: Optional[str] = None,
    env: str = None
) -> Dict[str, Any]:
    """
    创建跟单任务（自动处理认证）
    
    如果提供了 username 和 password，直接使用它们登录
    否则尝试从本地缓存获取 Session
    如果本地 Session 无效，抛出异常提示需要登录
    
    Args:
        task_data: 任务数据
        username: 可选，用户名
        password: 可选，密码（建议不传，使用交互式输入）
        env: 环境类型 (dev/test/prod)，默认使用当前环境
    
    Returns:
        API 响应结果
    
    Raises:
        Exception: 未登录且未提供凭据时抛出异常
    """
    # 获取 Session
    if username and password:
        # 使用提供的凭据登录
        session = login(username, password, env)
    elif username:
        # 只提供了用户名，需要交互式输入密码
        raise Exception("请同时提供 username 和 password，或使用交互式输入功能")
    else:
        # 尝试从本地加载
        token_data = load_token()
        if is_token_valid(token_data):
            session = requests.Session()
            session.cookies.update(token_data.get("cookies", {}))
        else:
            raise Exception("未提供登录凭证且本地 Session 已过期，请先调用 login() 函数登录")
    
    # 调用接口
    return create_track_task(task_data, session, env)


def prompt_and_login(env: str = None) -> requests.Session:
    """
    交互式提示用户输入用户名密码并登录
    
    Args:
        env: 环境类型
    
    Returns:
        登录成功的 Session 对象
    """
    import getpass
    
    print("请先登录系统")
    username = input("用户名: ").strip()
    password = getpass.getpass("密码: ").strip()
    
    if not username or not password:
        raise Exception("用户名和密码不能为空")
    
    return login(username, password, env)


# ============ 使用示例 ============
if __name__ == "__main__":
    print("API 客户端已加载")
    print(f"当前环境: {ENV_TEST}")
    print(f"登录接口: {get_login_url()}")
    print(f"跟单任务接口: {get_track_task_url()}")
    print("\n环境说明:")
    print(f"  - dev:  {get_login_url(ENV_DEV)}")
    print(f"  - test: {get_login_url(ENV_TEST)}")
    print(f"  - prod: {get_login_url(ENV_PROD)}")
