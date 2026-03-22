#!/usr/bin/env python3
"""
Recording Intention Analysis Script

Calls the external workflow API to analyze recording files and determine user intention.
"""

import sys
import json
import argparse
import urllib.request
import urllib.error
from typing import Dict, Any, Optional


API_ENDPOINT = "https://test-ai.xiujiadian.com/zmn-ai-workflow/v1/bce999b25b9b4a1dac1cd938b035aeac/execute_flow"
API_TOKEN = "x76utyhsqdtirjcpp12sp9n2"


def analyze_recording(recording_url: str, data_map: str = "XXXX") -> Dict[str, Any]:
    """
    Analyze a recording file to determine user intention.

    Args:
        recording_url: URL or file path to the audio recording
        data_map: Additional context data (default: "XXXX")

    Returns:
        Parsed intention analysis result
    """
    headers = {
        "Content-Type": "application/json",
        "ak": f"Bearer {API_TOKEN}"
    }

    payload = {
        "inputs": {
            "recording": recording_url
        }
    }

    try:
        req = urllib.request.Request(
            API_ENDPOINT,
            data=json.dumps(payload).encode('utf-8'),
            headers=headers,
            method='POST'
        )

        with urllib.request.urlopen(req, timeout=60) as response:
            response_data = json.loads(response.read().decode('utf-8'))

        # Check API response status
        if response_data.get('code') != 200 or not response_data.get('success'):
            return {
                "error": True,
                "message": response_data.get('message', 'API call failed'),
                "code": response_data.get('code', -1)
            }

        # Extract and parse run_result
        run_result_raw = response_data.get('data', {}).get('run_result', '')
        if not run_result_raw:
            return {
                "error": True,
                "message": "No run_result in API response",
                "raw_response": response_data
            }

        # Parse the JSON content from markdown code block
        # Format: ```json\n{...}\n```
        if run_result_raw.startswith('```json'):
            json_content = run_result_raw[7:].strip()
            if json_content.endswith('```'):
                json_content = json_content[:-3].strip()
        else:
            json_content = run_result_raw.strip()

        intention_data = json.loads(json_content)

        return {
            "error": False,
            "task_id": response_data.get('data', {}).get('task_id'),
            "status": response_data.get('data', {}).get('status'),
            "intention": intention_data.get('intention', {}),
            "reasoning": intention_data.get('reasoning', {})
        }

    except urllib.error.HTTPError as e:
        return {
            "error": True,
            "message": f"HTTP Error {e.code}: {e.reason}",
            "code": e.code
        }
    except urllib.error.URLError as e:
        return {
            "error": True,
            "message": f"URL Error: {e.reason}",
            "code": -1
        }
    except json.JSONDecodeError as e:
        return {
            "error": True,
            "message": f"JSON Parse Error: {str(e)}",
            "code": -1
        }
    except Exception as e:
        return {
            "error": True,
            "message": f"Unexpected Error: {str(e)}",
            "code": -1
        }


def format_output(result: Dict[str, Any]) -> str:
    """Format the analysis result for display."""
    if result.get('error'):
        return f"❌ 分析失败: {result.get('message', 'Unknown error')}"

    intention = result.get('intention', {})
    reasoning = result.get('reasoning', {})

    output_lines = [
        "🎯 意图分析结果",
        "",
        f"**意图类别**: {intention.get('category', '未知')}",
        f"**置信度**: {intention.get('confidence', '未知')} ({intention.get('confidence_score', 'N/A')})",
        "",
        "📋 推理分析",
        ""
    ]

    overall = reasoning.get('overall_analysis', '')
    if overall:
        output_lines.append(overall)
        output_lines.append("")

    evidence = reasoning.get('key_evidence', [])
    if evidence:
        output_lines.append("🔍 关键证据:")
        for i, item in enumerate(evidence, 1):
            output_lines.append(f"\n**证据 {i}**:")
            if 'speaker' in item:
                output_lines.append(f"- 说话人: {item['speaker']}")
            if 'original_text' in item:
                output_lines.append(f"- 原文: {item['original_text']}")
            if 'corrected_understanding' in item:
                output_lines.append(f"- 理解: {item['corrected_understanding']}")
            if 'supporting_role' in item:
                output_lines.append(f"- 作用: {item['supporting_role']}")

    return "\n".join(output_lines)


def main():
    parser = argparse.ArgumentParser(description='Analyze recording intention')
    parser.add_argument('recording', help='URL or path to the recording file')
    parser.add_argument('--json', action='store_true', help='Output raw JSON')

    args = parser.parse_args()

    result = analyze_recording(args.recording, args.data_map)

    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        print(format_output(result))


if __name__ == '__main__':
    main()
