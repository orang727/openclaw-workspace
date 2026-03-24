/**
 * SKILL.md API 定义解析器
 * 从 SKILL.md 文件中提取 API 地址、请求参数、认证方式等信息
 */

const fs = require('fs');
const path = require('path');

/**
 * 解析 SKILL.md 中的 API 定义
 * @param {string} skillDir - SKILL 目录路径
 * @returns {Object} 解析出的 API 定义
 */
function parseSkillMd(skillDir) {
  const skillMdPath = path.join(skillDir, 'SKILL.md');
  if (!fs.existsSync(skillMdPath)) {
    return { error: `SKILL.md not found: ${skillMdPath}` };
  }

  const content = fs.readFileSync(skillMdPath, 'utf8');
  const lines = content.split('\n');

  const apis = [];
  let currentApi = null;
  let inCodeBlock = false;
  let codeBlockLines = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // 跟踪代码块
    if (line.trim().startsWith('```')) {
      if (inCodeBlock) {
        // 代码块结束
        inCodeBlock = false;
        if (currentApi && codeBlockLines.length > 0) {
          currentApi.codeBlocks.push(codeBlockLines.join('\n'));
        }
        codeBlockLines = [];
      } else {
        // 代码块开始
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockLines.push(line);
      continue;
    }

    // 检测 API 端点（URL 行）
    const urlMatch = line.match(/^(POST|GET|PUT|DELETE|PATCH)\s+(https?:\/\/[^\s]+)/i);
    if (urlMatch) {
      if (currentApi) {
        apis.push(currentApi);
      }
      currentApi = {
        method: urlMatch[1].toUpperCase(),
        url: urlMatch[2],
        parameters: [],
        fixedValues: {},
        step: detectStep(line, lines, i),
        codeBlocks: []
      };
      continue;
    }

    // 检测 API 端点（纯 URL 行，无方法前缀）
    const pureUrlMatch = line.match(/^https?:\/\/[^\s]+/);
    if (pureUrlMatch && currentApi) {
      // 这是在代码块外的 URL，可能是注释，继续
      continue;
    }

    // 检测固定值（如 applySource: 17, bizSource: 40）
    const fixedValueMatch = line.match(/\*\*[\u4e00-\u9fa5a-zA-Z]+\*\*\s*[:：]\s*(固定值\s*[:：]\s*)?(\d+)/g);
    if (fixedValueMatch) {
      for (const match of fixedValueMatch) {
        const kvMatch = match.match(/\*\*([^\*]+)\*\*[:：]?(?:固定值[:：])?(\d+)/);
        if (kvMatch && currentApi) {
          currentApi.fixedValues[kvMatch[1]] = parseInt(kvMatch[2]);
        }
      }
    }

    // 检测参数来源（如 bizId = trackWorkId）
    const sourceMatch = line.match(/\*\*([^\*]+)\*\*\s*=\s*([^\|]+)/);
    if (sourceMatch && currentApi) {
      currentApi.parameters.push({
        name: sourceMatch[1].trim(),
        source: sourceMatch[2].trim(),
        isFixed: isFixedValue(line)
      });
    }
  }

  if (currentApi) {
    apis.push(currentApi);
  }

  // 解析代码块中的请求体
  for (const api of apis) {
    for (const code of api.codeBlocks) {
      parseCodeBlock(api, code);
    }
  }

  return {
    skillDir,
    skillName: path.basename(skillDir),
    apis,
    extractedAt: new Date().toISOString()
  };
}

/**
 * 检测当前 API 所在的 Step
 */
function detectStep(line, lines, currentIndex) {
  // 向上查找 Step
  for (let i = currentIndex; i >= 0; i--) {
    const stepMatch = lines[i].match(/^##?\s*Step\s*(\d+)/i);
    if (stepMatch) {
      return parseInt(stepMatch[1]);
    }
    // 查找标题
    const titleMatch = lines[i].match(/^#+\s*(.+)/);
    if (titleMatch && titleMatch[1].includes('Step')) {
      const stepInTitle = titleMatch[1].match(/Step\s*(\d+)/i);
      if (stepInTitle) {
        return parseInt(stepInTitle[1]);
      }
    }
  }
  return null;
}

/**
 * 检测是否为固定值
 */
function isFixedValue(line) {
  return line.includes('固定值') || line.includes('必填');
}

/**
 * 解析代码块，提取请求体结构
 */
function parseCodeBlock(api, code) {
  // 提取 fetch URL
  const fetchUrlMatch = code.match(/fetch\(['"](https?:\/\/[^'"]+)['"]/);
  if (fetchUrlMatch) {
    api.url = fetchUrlMatch[1];
  }

  // 提取 fetch 方法
  const fetchMethodMatch = code.match(/method:\s*['"](POST|GET|PUT|DELETE|PATCH)['"]/i);
  if (fetchMethodMatch) {
    api.method = fetchMethodMatch[1].toUpperCase();
  }

  // 提取请求体中的字段
  const bodyMatch = code.match(/body:\s*JSON\.stringify\(\s*\{([^}]+)\}/s);
  if (bodyMatch) {
    const bodyContent = bodyMatch[1];
    const fieldMatches = bodyContent.matchAll(/([a-zA-Z_]+)\s*:/g);
    for (const match of fieldMatches) {
      const fieldName = match[1];
      if (!api.parameters.find(p => p.name === fieldName)) {
        api.parameters.push({
          name: fieldName,
          source: 'request_body',
          isFixed: false
        });
      }
    }

    // 检测固定值
    const fixedMatches = bodyContent.matchAll(/([a-zA-Z_]+):\s*(\d+|['"][^'"]*['"])/g);
    for (const match of fixedMatches) {
      const key = match[1];
      let value = match[2];

      // 去除引号
      if (value.startsWith("'") || value.startsWith('"')) {
        value = value.slice(1, -1);
      }

      // 检测是否为固定值（非变量引用）
      const isFixed = !value.includes('{') && !value.includes('(') && !value.includes('authConfig');

      if (isFixed) {
        api.fixedValues[key] = isNaN(parseInt(value)) ? value : parseInt(value);
      }
    }
  }
}

/**
 * 解析目录下所有 SKILL
 */
function parseAllSkills(skillsDir) {
  const results = {};

  if (!fs.existsSync(skillsDir)) {
    return { error: `Skills directory not found: ${skillsDir}` };
  }

  const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const skillPath = path.join(skillsDir, entry.name);
      const parsed = parseSkillMd(skillPath);
      if (!parsed.error) {
        results[entry.name] = parsed;
      }
    }
  }

  return results;
}

module.exports = {
  parseSkillMd,
  parseAllSkills
};
