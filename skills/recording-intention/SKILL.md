---
name: recording-intention
description: Analyze recording files to determine user intention. Use this skill when the user wants to analyze a recording/audio file to understand the speaker's intent, such as "analyze this recording", "识别录音意图", "判断用户意图", "分析通话录音", or when processing call center recordings, customer service audio, or any voice recordings that need intention classification. Also trigger when the user mentions audio files, voice recordings, or ASR transcription with intent analysis needs.
---

# Recording Intention Analysis Skill

This skill analyzes audio recording files to determine the speaker's intention using an external workflow API.

## How It Works

1. Takes a recording file URL/path as input
2. Calls the backend workflow API to transcribe and analyze the recording
3. Returns structured intention analysis including category, confidence, and reasoning

## Input Parameters

**Required:**
- `recording`: URL or file path to the audio recording file

## API Configuration

**Endpoint:** `https://test-ai.xiujiadian.com/zmn-ai-workflow/v1/bce999b25b9b4a1dac1cd938b035aeac/execute_flow`

**Headers:**
- `ak`: `Bearer x76utyhsqdtirjcpp12sp9n2`

**Request Body:**
```json
{
  "inputs": {
    "recording": "<recording_url_or_path>"
  }
}
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

1. **Extract Input**: Get the recording URL from user input
2. **Prepare Request**: Construct the API request with recording and dataMap
3. **Call API**: Use the provided script or direct HTTP call to the workflow endpoint
4. **Parse Response**: Extract the intention analysis from run_result
5. **Present Results**: Return formatted intention category, confidence, and key reasoning to user

### Using the Script

The skill includes a Python script for convenient API calls:

```bash
python scripts/analyze_recording.py <recording_url> [--json]
```

**Options:**
- `--json`: Output raw JSON instead of formatted text

### Direct API Call

If not using the script, make a POST request:

```bash
curl -X POST "https://test-ai.xiujiadian.com/zmn-ai-workflow/v1/bce999b25b9b4a1dac1cd938b035aeac/execute_flow" \
  -H "Content-Type: application/json" \
  -H "ak: Bearer x76utyhsqdtirjcpp12sp9n2" \
  -d '{
    "inputs": {
      "recording": "<recording_url>"
    }
  }'
```

## Usage Examples

**Example 1:**
Input: "分析这个录音文件：https://example.com/recording.mp3"
Output: 调用API分析录音，返回意图识别结果

**Example 2:**
Input: "判断这段通话的意图，录音地址是 /path/to/audio.wav"
Output: 调用API分析录音，返回意图识别结果

## Error Handling

- If API returns non-200 status: Report the error code and message
- If recording file is inaccessible: Inform user to check the URL/path
- If run_result parsing fails: Return raw response for debugging
