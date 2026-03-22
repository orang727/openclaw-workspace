# 挂起任务单 Agent 工作流
# 基于 G1 工作流程文档 v1.0
# 创建时间：2026-03-16

name: 挂起任务处理工作流
args:
  task_id:
    type: string
    required: true
    description: 任务 ID
  work_order_id:
    type: string
    required: true
    description: 工单号
  audio_ref:
    type: string
    required: true
    description: 录音引用 ID
  confidence_threshold:
    type: number
    default: 0.75
    description: 意图识别置信度阈值

steps:
  # ==================== 阶段 A：理解与路由 ====================
  
  # Skill 1: 获取录音文件
  - id: skill1_fetch_audio
    name: 获取录音文件
    command: |
      openclaw.invoke --tool llm-task --action json --args-json '{
        "prompt": "根据 audio_ref 获取录音文件信息。如果录音不存在、拉取失败或文件损坏，返回 need_human_review=true。",
        "input": {
          "task_id": "${args.task_id}",
          "work_order_id": "${args.work_order_id}",
          "audio_ref": "${args.audio_ref}"
        },
        "schema": {
          "type": "object",
          "properties": {
            "audio_file_id": {"type": "string"},
            "audio_fetch_status": {"type": "string", "enum": ["success", "failed"]},
            "audio_url": {"type": "string"},
            "audio_duration": {"type": "number"},
            "audio_text": {"type": "string"},
            "audio_summary": {"type": "string"},
            "error_code": {"type": "string"},
            "error_message": {"type": "string"},
            "need_human_review": {"type": "boolean"}
          },
          "required": ["audio_fetch_status", "need_human_review"],
          "additionalProperties": false
        }
      }'
    output_parser: json
  
  # 检查录音获取是否成功
  - id: check_audio_status
    name: 检查录音状态
    condition: $skill1_fetch_audio.json.need_human_review == true
    command: |
      echo '{"status": "HUMAN_REVIEW", "reason": "录音获取失败", "audio_result": ' '$skill1_fetch_audio.json' '}''
    output_parser: json
  
  # Skill 2: 意图识别（仅在录音获取成功时执行）
  - id: skill2_intent_recognition
    name: 意图识别
    condition: $skill1_fetch_audio.json.need_human_review == false
    command: |
      openclaw.invoke --tool llm-task --action json --args-json '{
        "prompt": "识别用户意图，仅允许三类：confirm_visit(确认上门)、price_or_cancel(用户询价/取消)、other(其他意图)。返回置信度。",
        "input": {
          "audio_text": "${skill1_fetch_audio.json.audio_text}",
          "audio_summary": "${skill1_fetch_audio.json.audio_summary}",
          "work_order_id": "${args.work_order_id}"
        },
        "schema": {
          "type": "object",
          "properties": {
            "intent_name": {"type": "string", "enum": ["confirm_visit", "price_or_cancel", "other"]},
            "intent_judgement": {"type": "string"},
            "other_info": {"type": "object"},
            "confidence": {"type": "number"},
            "need_human_review": {"type": "boolean"},
            "low_confidence": {"type": "boolean"}
          },
          "required": ["intent_name", "confidence", "need_human_review"],
          "additionalProperties": false
        }
      }'
    output_parser: json
  
  # Skill 3: 结果路由
  - id: skill3_route_result
    name: 结果路由
    condition: $skill1_fetch_audio.json.need_human_review == false
    command: |
      openclaw.invoke --tool llm-task --action json --args-json '{
        "prompt": "根据意图识别结果进行路由决策。confirm_visit→改约(auto)、price_or_cancel→取消(manual 需审批)、other→生成跟单任务(auto)。置信度<0.75 强制 manual。",
        "input": {
          "intent_name": "${skill2_intent_recognition.json.intent_name}",
          "confidence": ${skill2_intent_recognition.json.confidence},
          "need_human_review": ${skill2_intent_recognition.json.need_human_review}
        },
        "schema": {
          "type": "object",
          "properties": {
            "route_type": {"type": "string", "enum": ["confirm_visit", "price_or_cancel", "other"]},
            "next_skills": {"type": "array", "items": {"type": "string"}},
            "need_human_review": {"type": "boolean"},
            "risk_tags": {"type": "array", "items": {"type": "string"}},
            "execution_mode": {"type": "string", "enum": ["auto", "manual"]},
            "need_approval": {"type": "boolean"},
            "approval_role": {"type": "string"}
          },
          "required": ["route_type", "execution_mode", "need_approval"],
          "additionalProperties": false
        }
      }'
    output_parser: json
  
  # ==================== 阶段 B：跟单与执行 ====================
  
  # Skill 4: 跟单处理（固定规则）
  - id: skill4_followup_process
    name: 跟单处理
    condition: $skill1_fetch_audio.json.need_human_review == false
    command: |
      openclaw.invoke --tool llm-task --action json --args-json '{
        "prompt": "执行固定跟单处理：跟单选项=111，打印跟单日志，完结挂起跟单申请。",
        "input": {
          "intent_name": "${skill2_intent_recognition.json.intent_name}",
          "intent_judgement": "${skill2_intent_recognition.json.intent_judgement}",
          "work_order_id": "${args.work_order_id}",
          "route_type": "${skill3_route_result.json.route_type}"
        },
        "schema": {
          "type": "object",
          "properties": {
            "followup_option": {"type": "string"},
            "followup_log": {"type": "string"},
            "hang_followup_closed": {"type": "boolean"},
            "operator": {"type": "string"},
            "processed_at": {"type": "string"}
          },
          "required": ["followup_option", "followup_log", "hang_followup_closed", "operator"],
          "additionalProperties": false
        }
      }'
    output_parser: json
  
  # Skill 5: 业务执行 - 路由 1: 确认上门 → 工单改约
  - id: skill5_reschedule
    name: 工单改约
    condition: $skill3_route_result.json.route_type == "confirm_visit"
    command: |
      openclaw.invoke --tool llm-task --action json --args-json '{
        "prompt": "执行工单改约：新预约时间=当前日期+2 天 09:00。",
        "input": {
          "task_id": "${args.task_id}",
          "work_order_id": "${args.work_order_id}"
        },
        "schema": {
          "type": "object",
          "properties": {
            "action_type": {"type": "string", "const": "work_order_reschedule"},
            "action_params": {
              "type": "object",
              "properties": {
                "new_appointment_time": {"type": "string"},
                "work_order_id": {"type": "string"}
              }
            },
            "operator": {"type": "string"},
            "need_approval": {"type": "boolean"},
            "final_status": {"type": "string"},
            "execution_mode": {"type": "string", "enum": ["auto", "manual"]}
          },
          "required": ["action_type", "operator", "need_approval", "final_status", "execution_mode"],
          "additionalProperties": false
        }
      }'
    output_parser: json
  
  # Skill 5: 业务执行 - 路由 2: 用户询价/取消 → 工单取消
  - id: skill5_cancel
    name: 工单取消
    condition: $skill3_route_result.json.route_type == "price_or_cancel"
    command: |
      openclaw.invoke --tool llm-task --action json --args-json '{
        "prompt": "执行工单取消：取消原因=用户不需要了，需要客服主管审批。",
        "input": {
          "task_id": "${args.task_id}",
          "work_order_id": "${args.work_order_id}"
        },
        "schema": {
          "type": "object",
          "properties": {
            "action_type": {"type": "string", "const": "work_order_cancel"},
            "action_params": {
              "type": "object",
              "properties": {
                "cancel_reason": {"type": "string"},
                "work_order_id": {"type": "string"}
              }
            },
            "operator": {"type": "string"},
            "need_approval": {"type": "boolean"},
            "approval_role": {"type": "string"},
            "final_status": {"type": "string"},
            "execution_mode": {"type": "string", "enum": ["auto", "manual"]}
          },
          "required": ["action_type", "operator", "need_approval", "final_status", "execution_mode"],
          "additionalProperties": false
        }
      }'
    output_parser: json
  
  # Skill 5: 业务执行 - 路由 3: 其他意图 → 生成挂起跟单任务
  - id: skill5_create_followup
    name: 生成跟单任务
    condition: $skill3_route_result.json.route_type == "other"
    command: |
      openclaw.invoke --tool llm-task --action json --args-json '{
        "prompt": "生成挂起跟单任务。",
        "input": {
          "task_id": "${args.task_id}",
          "work_order_id": "${args.work_order_id}"
        },
        "schema": {
          "type": "object",
          "properties": {
            "action_type": {"type": "string", "const": "create_followup_task"},
            "action_params": {
              "type": "object",
              "properties": {
                "task_type": {"type": "string"},
                "creator": {"type": "string"},
                "work_order_id": {"type": "string"}
              }
            },
            "operator": {"type": "string"},
            "need_approval": {"type": "boolean"},
            "final_status": {"type": "string"},
            "execution_mode": {"type": "string", "enum": ["auto", "manual"]}
          },
          "required": ["action_type", "operator", "need_approval", "final_status", "execution_mode"],
          "additionalProperties": false
        }
      }'
    output_parser: json
  
  # 审批门（需要审批时触发）
  - id: approval_gate
    name: 审批确认
    condition: $skill3_route_result.json.need_approval == true
    approval: required
    command: |
      echo '{"approved": true, "approved_at": "2026-01-01T00:00:00Z"}'
    output_parser: json
  
  # 最终状态汇总
  - id: finalize_task
    name: 任务归档
    command: |
      echo '{"task_id": "${args.task_id}", "final_status": "COMPLETED", "execution_summary": "Workflow completed"}'
    output_parser: json

# 输出最终结果
output:
  - $finalize_task.json
