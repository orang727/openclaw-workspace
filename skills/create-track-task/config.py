# -*- coding: utf-8 -*-
"""
跟单任务 API 配置常量
"""

# ============ Ratel 网关认证配置 ============

# 测试环境密钥（来自 ratel_sign.py）
APP_KEY = "254B4EF88B5303E"
SECRET_KEY = "2c0c38615fa4465ea76a800e2cba26e4"


# ============ 接口基础配置 ============

# 登录接口路径
LOGIN_PATH = "/cas/login.action"

# 跟单任务创建接口路径
TRACK_TASK_PATH = "/ratel/biz-twd/trackTaskModifyRemoteService/addTrackTask"


# ============ 环境配置 ============

# 环境类型常量
ENV_DEV = "dev"      # 开发环境: dev-admin.xiujiadian.com
ENV_TEST = "test"    # 测试环境: test3-admin.xiujiadian.com
ENV_PROD = "prod"    # 生产环境: admin.xiujiadian.com

# 默认环境
DEFAULT_ENV = ENV_TEST

# 当前环境（可通过修改此变量切换环境）
CURRENT_ENV = DEFAULT_ENV

# 环境配置映射
ENVIRONMENT_CONFIG = {
    ENV_DEV: {
        "base_url": "https://dev-admin.xiujiadian.com",
        "login_url": "https://dev-mcc.xiujiadian.com",
        "app_key": "254B4EF88B5303E",
        "secret_key": "4918a2dc967c43008d09d7440e69eb42"
    },
    ENV_TEST: {
        "base_url": "https://test3-admin.xiujiadian.com",
        "login_url": "https://test3-mcc.xiujiadian.com",
        "app_key": "254B4EF88B5303E",
        "secret_key": "2c0c38615fa4465ea76a800e2cba26e4"
    },
    ENV_PROD: {
        "base_url": "https://admin.xiujiadian.com",
        "login_url": "https://mcc.xiujiadian.com",
        "app_key": "254B4EF88B5303E",
        "secret_key": "4918a2dc967c43008d09d7440e69eb42"
    }
}


def get_env_config(env: str = None):
    """
    获取指定环境的配置
    
    Args:
        env: 环境类型，默认为 CURRENT_ENV
    
    Returns:
        环境配置字典
    """
    if env is None:
        env = CURRENT_ENV
    return ENVIRONMENT_CONFIG.get(env, ENVIRONMENT_CONFIG[DEFAULT_ENV])


def set_environment(env: str):
    """
    设置当前环境
    
    Args:
        env: 环境类型 (dev/test/prod)
    """
    global CURRENT_ENV
    if env in ENVIRONMENT_CONFIG:
        CURRENT_ENV = env
        print(f"环境已切换为: {env}")
    else:
        raise ValueError(f"不支持的环境类型: {env}，可选: {list(ENVIRONMENT_CONFIG.keys())}")


def get_base_url(env: str = None) -> str:
    """获取基础 URL"""
    return get_env_config(env)["base_url"]


def get_login_url(env: str = None) -> str:
    """获取登录 URL"""
    return f"{get_env_config(env)['login_url']}{LOGIN_PATH}"


def get_track_task_url(env: str = None) -> str:
    """获取跟单任务接口 URL"""
    return f"{get_base_url(env)}{TRACK_TASK_PATH}"


def get_app_key(env: str = None) -> str:
    """获取 App Key"""
    return get_env_config(env)["app_key"]


def get_secret_key(env: str = None) -> str:
    """获取 Secret Key"""
    return get_env_config(env)["secret_key"]


# ============ 缓存配置 ============

# Token 缓存文件名
TOKEN_FILE = ".track_task_token"

# Token 有效期（小时）
TOKEN_MAX_AGE_HOURS = 24


# ============ 接口默认参数 ============

# 跟单任务创建接口默认参数（只包含必要字段，其他由调用方传入）
DEFAULT_TRACK_TASK_PARAMS = {
    "operateTime": "",  # 操作时间，必填
    "bizSource": 0,     # 业务来源
    "plat": 0,          # 平台标识
}
