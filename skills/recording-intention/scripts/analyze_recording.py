#!/usr/bin/env python3
"""
Recording Intention Analysis Script

Calls the external workflow API to analyze recording transcription data and determine user intention.
"""

import sys
import json
import argparse
import urllib.request
import urllib.error
from typing import Dict, Any, Optional


API_ENDPOINT = "https://test-ai.xiujiadian.com/zmn-ai-workflow/v1/961296a26366462b9fbef746ae4ea2cf/execute_flow"
API_TOKEN = "x76utyhsqdtirjcpp12sp9n2"


def analyze_recording(recording_data) -> Dict[str, Any]:
    """
    Analyze recording transcription data to determine user intention.

    Args:
        recording_data: JSON string or dict containing transcription data with items
                        (role, text, beginTime, endTime, silenceDuration).

    Returns:
        Parsed intention analysis result
    """
    # Ensure recording_data is a JSON string (not a dict/object)
    if isinstance(recording_data, dict):
        recording_json_str = json.dumps(recording_data, ensure_ascii=False)
    else:
        # Validate that it's valid JSON, then use it as-is
        try:
            json.loads(recording_data)
            recording_json_str = recording_data
        except json.JSONDecodeError:
            return {
                "error": True,
                "message": "Invalid JSON in recording data: not a valid JSON string",
                "code": -1
            }

    headers = {
        "Content-Type": "application/json",
        "ak": f"Bearer {API_TOKEN}"
    }

    # The recording value must be a JSON string (stringified JSON inside JSON)
    payload = {
        "inputs": {
            "recording": recording_json_str
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
    parser = argparse.ArgumentParser(description='Analyze recording transcription intention')
    parser.add_argument('recording', nargs='?', help='JSON string of recording transcription data')
    parser.add_argument('--file', help='Path to a JSON file containing recording transcription data')
    parser.add_argument('--json', action='store_true', help='Output raw JSON')

    args = parser.parse_args()

    # Read recording data from file or command line argument
    if args.file:
        with open(args.file, 'r', encoding='utf-8') as f:
            recording_data = f.read().strip()
    elif args.recording:
        recording_data = args.recording
    else:
        parser.error("Either provide recording JSON data as argument or use --file")

    result = analyze_recording(recording_data)

    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        print(format_output(result))


if __name__ == '__main__':
    main()
