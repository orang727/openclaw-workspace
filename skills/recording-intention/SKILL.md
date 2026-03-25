---
name: recording-intention
description: Analyze recording transcription data to determine user intention. Use this skill when the user wants to analyze a recording transcription to understand the speaker's intent, such as "analyze this recording", "识别录音意图", "判断用户意图", "分析通话录音", or when processing call center transcriptions, customer service dialogues, or any ASR transcription results that need intention classification. Also trigger when the user provides conversation/dialogue data with role and text fields for intent analysis.
---

# Recording Intention Analysis Skill

This skill analyzes recording transcription data (dialogue/conversation records) to determine the speaker's intention using an external workflow API.

## How It Works

1. Takes recording transcription data (JSON containing dialogue items with role, text, timestamps) as input
2. Calls the backend workflow API to analyze the transcription
3. Returns structured intention analysis including category, confidence, and reasoning

## Input Parameters

**Required:**
- `recording`: A **JSON string** containing transcription data. The JSON string includes:
  - `success`: boolean
  - `detect_record_id`: string
  - `total`: number (total dialogue items)
  - `fetched_count`: number
  - `page_count`: number
  - `items`: array of dialogue items, each containing:
    - `role`: speaker role (e.g., "工程师", "用户")
    - `text`: spoken text
    - `beginTime`: start time in milliseconds (string)
    - `endTime`: end time in milliseconds (string)
    - `silenceDuration`: silence duration (string)

**IMPORTANT:** The `recording` field value is a **JSON string** (not a JSON object). When constructing the request, the inner JSON must be serialized to a string first, then placed as the value of `inputs.recording`. This means the request body is JSON containing a stringified JSON value.

## API Configuration

**Endpoint:** `https://test-ai.xiujiadian.com/zmn-ai-workflow/v1/961296a26366462b9fbef746ae4ea2cf/execute_flow`

**Headers:**
- `ak`: `Bearer x76utyhsqdtirjcpp12sp9n2`

**Request Body:**
```json
{
  "inputs": {
    "recording": "{\"success\": true, \"detect_record_id\": \"...\", \"total\": 24, \"fetched_count\": 24, \"page_count\": 1, \"items\": [{\"role\": \"工程师\", \"text\": \"...\", \"beginTime\": \"0\", \"endTime\": \"780\", \"silenceDuration\": \"0\"}, ...]}"
  }
}
```

Note: The `recording` value above is a **stringified JSON**. When building the request programmatically:
```python
import json

recording_data = {
    "success": True,
    "detect_record_id": "1241784183863242752",
    "total": 24,
    "fetched_count": 24,
    "page_count": 1,
    "items": [
        {"role": "工程师", "text": "没休息。", "beginTime": "0", "endTime": "780", "silenceDuration": "0"},
        # ... more items
    ]
}

payload = {
    "inputs": {
        "recording": json.dumps(recording_data, ensure_ascii=False)  # Stringify the inner JSON
    }
}

# The outer json.dumps will properly escape the inner JSON string
request_body = json.dumps(payload, ensure_ascii=False)
```

## Output Format

The API returns a JSON response with the following structure:

```json
{
  "code": 200,
  "success": true,
  "message": "SUCCESS",
  "data": {
    "task_id": "...",
    "status": "SUCCEEDED",
    "run_result": "```json\n{...}\n```",
    "message": "流程执行成功"
  }
}
```

The `run_result` contains the parsed intention analysis:

```json
{
  "intention": {
    "category": "用户表示不需要服务",
    "confidence": "高",
    "confidence_score": 0.95
  },
  "reasoning": {
    "overall_analysis": "...",
    "key_evidence": [...]
  }
}
```

## Execution Steps

1. **Extract Input**: Get the recording transcription data from user input (JSON object or JSON string)
2. **Prepare Request**: If the recording data is a JSON object, serialize it to a JSON string using `json.dumps()`. Construct the API request with the stringified recording data as `inputs.recording`
3. **Call API**: Use the provided script or direct HTTP call to the workflow endpoint
4. **Parse Response**: Extract the intention analysis from run_result
5. **Present Results**: Return formatted intention category, confidence, and key reasoning to user

### Using the Script

The skill includes a Python script for convenient API calls:

```bash
python scripts/analyze_recording.py '<json_string_of_recording_data>' [--json]
```

Or pass a file containing the JSON data:
```bash
python scripts/analyze_recording.py --file recording_data.json [--json]
```

**Options:**
- `--json`: Output raw JSON instead of formatted text
- `--file`: Read recording data from a JSON file instead of command line argument

### Direct API Call

If not using the script, make a POST request:

```bash
curl -X POST "https://test-ai.xiujiadian.com/zmn-ai-workflow/v1/961296a26366462b9fbef746ae4ea2cf/execute_flow" \
  -H "Content-Type: application/json" \
  -H "ak: Bearer x76utyhsqdtirjcpp12sp9n2" \
  -d '{
    "inputs": {
      "recording": "{\"success\": true, \"detect_record_id\": \"1241784183863242752\", \"total\": 24, \"fetched_count\": 24, \"page_count\": 1, \"items\": [...]}"
    }
  }'
```

## Usage Examples

**Example 1:**
Input: "分析这段录音转写数据" + 提供包含 items 数组的 JSON 数据
Output: 将 JSON 数据序列化为字符串，调用 API 分析，返回意图识别结果

**Example 2:**
Input: "判断这段通话的意图" + 提供对话记录 JSON
Output: 调用 API 分析对话记录，返回意图识别结果

## Error Handling

- If API returns non-200 status: Report the error code and message
- If recording data is invalid JSON: Inform user to check the data format
- If run_result parsing fails: Return raw response for debugging
