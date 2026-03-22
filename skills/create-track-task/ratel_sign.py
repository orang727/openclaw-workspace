# -*- coding: utf-8 -*-
"""
Ratel 网关签名工具
用途：为啄木鸟 Ratel 网关接口生成请求签名（对齐 Java DefaultSignGenerator）。

用法：
    python3 ratel_sign.py '<完整URL>' '<JSON请求体>' [test]

示例（正式环境）：
    python3 ratel_sign.py \
      'https://api-ratel.xiujiadian.com/baseCommonData/companyListRemoteService/listPageOptionByPermitQuery?zmn-company=' \
      '{"level":3,"status":2,"limitPermit":false}'

示例（测试环境）：
    python3 ratel_sign.py 'https://test3-api-ratel.xiujiadian.com/...' '{}' test

输出（可直接用于 curl -H 的三个请求头）：
    app-key: 24D8BCDB215DC83
    timestamp: <毫秒时间戳>
    sign: <签名值>
    body: <规范化后的JSON body，发送时必须用此值>
"""

import sys
import json
import time
from urllib.parse import quote, urlparse, parse_qs
from hashlib import md5

# 正式环境
APP_KEY_PROD = "24D8BCDB215DC83"
SECRET_KEY_PROD = "4918a2dc967c43008d09d7440e69eb42"

# 测试环境
APP_KEY_TEST = "24D553DC3D2BB8B"
SECRET_KEY_TEST = "88dd5e66fa054c77996770f38899e2c0"


def special_url_encode(value: str) -> str:
    """
    对齐 Java DefaultSignGenerator.specialUrlEncode：
      URLEncoder.encode(UTF-8) + * → %2A + + → %20 + %7E → ~
    Python quote(safe='') 的行为与之一致。
    """
    return quote(str(value) if value is not None else "", safe="", encoding="utf-8")


def generate_sign(url: str, method: str, secret_key: str, timestamp: int, body_dict) -> tuple:
    """
    对齐 Java DefaultSignGenerator.generator，
    **注意**：URL 中的 query 参数（如 zmn-company=）也必须参与签名。

    返回 (sign, body_str) 两个值：
    - sign：最终签名，已做 URL encode
    - body_str：规范化后的 JSON 字符串，发送时必须用此值（保证签名与发送一致）
    """
    # 规范化 body：sort_keys 对齐 fastjson WriteMapNullValue 的字母序输出
    body_str = json.dumps(body_dict, ensure_ascii=False, separators=(",", ":"), sort_keys=True)

    # 解析 URL query 参数，按 key 字典序参与签名
    parsed = urlparse(url)
    qp = {k: v[0] for k, v in parse_qs(parsed.query, keep_blank_values=True).items()}
    parts = [f"{special_url_encode(k)}={special_url_encode(v)}" for k, v in sorted(qp.items())]

    # body 追加到最后
    parts.append(special_url_encode(body_str))

    sorted_query_string = "&".join(parts)

    string_to_sign = "&".join([
        method,
        secret_key,
        special_url_encode("/"),
        str(timestamp),
        special_url_encode(sorted_query_string),
    ])

    signature = md5(string_to_sign.encode("utf-8")).hexdigest()
    return special_url_encode(signature), body_str


def main():
    if len(sys.argv) < 3:
        print("用法: python3 ratel_sign.py '<完整URL>' '<JSON请求体>' [test]", file=sys.stderr)
        sys.exit(1)

    url = sys.argv[1]
    raw = sys.argv[2]
    is_test = len(sys.argv) >= 4 and sys.argv[3] == "test"

    app_key = APP_KEY_TEST if is_test else APP_KEY_PROD
    secret_key = SECRET_KEY_TEST if is_test else SECRET_KEY_PROD

    try:
        body = json.loads(raw)
    except json.JSONDecodeError as e:
        print(f"JSON 解析失败: {e}", file=sys.stderr)
        sys.exit(1)

    timestamp = int(time.time() * 1000)  # 毫秒级时间戳，对齐 JS Date.now()

    sign, body_str = generate_sign(
        url=url,
        method="POST",
        secret_key=secret_key,
        timestamp=timestamp,
        body_dict=body,
    )

    print(f"app-key: {app_key}")
    print(f"timestamp: {timestamp}")
    print(f"sign: {sign}")
    print(f"body: {body_str}")


if __name__ == "__main__":
    main()
