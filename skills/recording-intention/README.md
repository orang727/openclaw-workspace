# Recording Intention Analysis Skill

录音意图识别技能 - 分析录音文件并判定用户意图

## 功能

该技能接收录音文件地址（URL 或本地路径），调用后端工作流 API 进行语音识别和意图分析，返回结构化的意图判定结果。

## 触发场景

以下说法会触发该技能：
- "分析这个录音文件"
- "识别录音意图"
- "判断用户意图"
- "分析通话录音"
- "识别这段音频的意图"
- 任何涉及录音文件、语音文件、ASR 转写和意图分析的需求

## 使用方法

### 方式1：直接描述需求

```
分析这个录音文件：https://example.com/recording.mp3
```

### 方式2：使用脚本直接调用

```bash
python scripts/analyze_recording.py <录音文件URL> [--json]
```

## API 配置

- **Endpoint**: `https://test-ai.xiujiadian.com/zmn-ai-workflow/v1/bce999b25b9b4a1dac1cd938b035aeac/execute_flow`
- **鉴权**: `Authorization: Bearer x76utyhsqdtirjcpp12sp9n2`

## 请求参数

```json
{
  "inputs": {
    "recording": "录音文件URL或路径",
    "dataMap": "额外上下文数据（可选，默认XXXX）"
  }
}
```

## 返回结果

```json
{
  "intention": {
    "category": "意图类别",
    "confidence": "置信度等级（高/中/低）",
    "confidence_score": 0.95
  },
  "reasoning": {
    "overall_analysis": "整体分析说明",
    "key_evidence": [
      {
        "speaker": "说话人标识",
        "original_text": "原始文本",
        "corrected_understanding": "理解修正",
        "supporting_role": "证据作用"
      }
    ]
  }
}
```

## 文件结构

```
recording-intention/
├── SKILL.md              # 技能定义文件
├── README.md             # 本文件
├── evals/
│   └── evals.json        # 测试用例
└── scripts/
    └── analyze_recording.py  # API调用脚本
```

## 安装

将该技能目录复制到 OpenClaw 的 skills 目录：

```bash
cp -r recording-intention ~/.openclaw/workspace/skills/
```

## 注意事项

1. 录音文件需要是可访问的 URL 或本地路径
2. API 调用可能需要一定时间（语音识别 + 意图分析）
3. 默认 dataMap 值为 "XXXX"，如有特殊需求请指定
