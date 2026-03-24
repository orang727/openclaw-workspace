/**
 * Workflow.js API 调用解析器
 * 从 workflow.js 文件中提取实际的 API 调用
 */

const fs = require('fs');
const path = require('path');

/**
 * 解析 workflow.js 中的 API 调用
 * @param {string} workflowPath - workflow.js 文件路径
 * @returns {Object} 解析出的 API 调用
 */
function parseWorkflow(workflowPath) {
  if (!fs.existsSync(workflowPath)) {
    return { error: `Workflow file not found: ${workflowPath}` };
  }

  const content = fs.readFileSync(workflowPath, 'utf8');

  const functions = [];
  const functionPattern = /(?:async\s+)?function\s+(\w+)\s*\([^)]*\)\s*\{|(\w+)\s*:\s*(?:async\s+)?function\s*\([^)]*\)\s*\{/g;

  let match;
  while ((match = functionPattern.exec(content)) !== null) {
    const funcName = match[1] || match[2];
    if (funcName && !funcName.startsWith('_') && !['console', 'JSON', 'Object', 'Array'].includes(funcName)) {
      const funcBody = extractFunctionBody(content, match.index);
      const apiCalls = parseFunctionForApiCalls(funcBody, funcName);
      if (apiCalls.length > 0) {
        functions.push({
          name: funcName,
          apiCalls
        });
      }
    }
  }

  return {
    workflowPath,
    workflowName: path.basename(workflowPath),
    functions,
    extractedAt: new Date().toISOString()
  };
}

/**
 * 提取函数体
 */
function extractFunctionBody(content, startIndex) {
  let braceCount = 0;
  let started = false;
  let start = startIndex;

  // 找到函数开始的 {
  for (let i = start; i < content.length; i++) {
    if (content[i] === '{') {
      start = i;
      started = true;
      break;
    }
  }

  if (!started) return '';

  for (let i = start; i < content.length; i++) {
    if (content[i] === '{') braceCount++;
    else if (content[i] === '}') {
      braceCount--;
      if (braceCount === 0) {
        return content.substring(start, i + 1);
      }
    }
  }

  return content.substring(start);
}

/**
 * 解析函数体中的 API 调用
 */
function parseFunctionForApiCalls(funcBody, funcName) {
  const apiCalls = [];

  // 提取 fetch 调用
  const fetchRegex = /fetch\s*\(\s*['"]([^'"]+)['"]|fetch\s*\(\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*,/g;
  let match;

  // 查找所有 fetch 调用
  const fetchMatches = [...funcBody.matchAll(/fetch\s*\(\s*([^,]+)\s*,?\s*\{/gs)];

  for (const fetchMatch of fetchMatches) {
    const callStart = fetchMatch.index;
    const urlPart = fetchMatch[1]?.trim() || '';

    // 提取完整的 fetch 调用（包括配置）
    const fetchCall = extractFetchCall(funcBody, callStart);

    if (fetchCall) {
      const apiCall = parseFetchCall(fetchCall, funcName);
      if (apiCall) {
        apiCalls.push(apiCall);
      }
    }
  }

  // 提取请求体中的字段
  for (const call of apiCalls) {
    if (call.body) {
      const fields = extractBodyFields(call.body);
      call.fields = fields;
    }
  }

  return apiCalls;
}

/**
 * 提取完整的 fetch 调用
 */
function extractFetchCall(body, startIndex) {
  let braceCount = 0;
  let inString = false;
  let stringChar = '';
  let started = false;

  for (let i = startIndex; i < body.length; i++) {
    const char = body[i];

    if (!inString && (char === '"' || char === "'" || char === '`')) {
      inString = true;
      stringChar = char;
    } else if (inString && char === stringChar && body[i - 1] !== '\\') {
      inString = false;
    }

    if (!inString) {
      if (char === '{') {
        braceCount++;
        started = true;
      } else if (char === '}') {
        braceCount--;
        if (started && braceCount === 0) {
          return body.substring(startIndex, i + 1);
        }
      }
    }
  }

  return null;
}

/**
 * 解析单个 fetch 调用
 */
function parseFetchCall(fetchCall, funcName) {
  const apiCall = {
    functionName: funcName,
    url: null,
    method: 'POST',
    fields: {},
    fixedValues: {},
    line: null
  };

  // 提取 URL
  const urlMatch = fetchCall.match(/fetch\s*\(\s*(?:['"]([^'"]+)['"]|([a-zA-Z_$][a-zA-Z0-9_$]*))\s*/);
  if (urlMatch) {
    apiCall.url = urlMatch[1] || urlMatch[2];
  }

  // 提取方法
  const methodMatch = fetchCall.match(/method\s*:\s*['"](POST|GET|PUT|DELETE|PATCH)['"]/i);
  if (methodMatch) {
    apiCall.method = methodMatch[1].toUpperCase();
  }

  // 提取请求体
  const bodyMatch = fetchCall.match(/body\s*:\s*JSON\.stringify\(\s*(\{[^}]+\})/s);
  if (bodyMatch) {
    apiCall.body = bodyMatch[1];
    apiCall.fields = extractBodyFields(bodyMatch[1]);
  }

  return apiCall.url ? apiCall : null;
}

/**
 * 提取请求体中的字段
 */
function extractBodyFields(bodyStr) {
  const fields = {};
  const fieldMatches = bodyStr.matchAll(/([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:\s*([^,}]+)/g);

  for (const match of fieldMatches) {
    const key = match[1];
    let value = match[2].trim();

    // 去除结尾的逗号和空白
    value = value.replace(/,?\s*$/, '').trim();

    // 判断是否为固定值
    const isFixed = isFixedValue(value);

    fields[key] = {
      raw: value,
      isFixed,
      value: isFixed ? parseFixedValue(value) : null
    };
  }

  return fields;
}

/**
 * 判断是否为固定值
 */
function isFixedValue(value) {
  // 固定值：数字字面量、字符串字面量、布尔值
  if (/^-?\d+(\.\d+)?$/.test(value)) return true;
  if (/^['"].*['"]$/.test(value)) return true;
  if (value === 'true' || value === 'false') return true;
  return false;
}

/**
 * 解析固定值
 */
function parseFixedValue(value) {
  if (/^-?\d+(\.\d+)?$/.test(value)) return parseFloat(value);
  if (/^['"].*['"]$/.test(value)) return value.slice(1, -1);
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}

/**
 * 解析目录下所有 workflow
 */
function parseAllWorkflows(workflowsDir) {
  const results = {};

  if (!fs.existsSync(workflowsDir)) {
    return { error: `Workflows directory not found: ${workflowsDir}` };
  }

  const entries = fs.readdirSync(workflowsDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith('.js')) {
      const workflowPath = path.join(workflowsDir, entry.name);
      const parsed = parseWorkflow(workflowPath);
      if (!parsed.error) {
        results[entry.name] = parsed;
      }
    }
  }

  return results;
}

module.exports = {
  parseWorkflow,
  parseAllWorkflows
};
