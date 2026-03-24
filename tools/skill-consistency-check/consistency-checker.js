/**
 * SKILL 与 Workflow API 一致性检查器
 * 对比 SKILL.md 中定义的 API 与 workflow.js 中实际调用的 API
 */

const { parseAllSkills } = require('./skill-parser');
const { parseAllWorkflows } = require('./workflow-parser');
const path = require('path');

// SKILL 到 Workflow 函数的映射
const SKILL_TO_FUNCTION_MAP = {
  'cancel-work': 'skill3_cancelWork',
  'create-track-task': 'skill4_createTrackTask',
  'modify-duty-time': 'skill2_modifyDuty',
  'handle-track-work': 'skill1_handleTrack',
  'get-call-record': 'skill0_routeResult'
};

/**
 * 主检查函数
 */
function checkConsistency(skillsDir, workflowsDir, options = {}) {
  const {
    verbose = false,
    outputFormat = 'console', // console | json | markdown
    onlyErrors = false
  } = options;

  console.log('🔍 开始 SKILL 与 Workflow API 一致性检查...\n');

  // 解析 SKILL 和 Workflow
  const skills = parseAllSkills(skillsDir);
  const workflows = parseAllWorkflows(workflowsDir);

  if (skills.error) {
    console.error(`❌ 错误: ${skills.error}`);
    return { success: false, error: skills.error };
  }

  if (workflows.error) {
    console.error(`❌ 错误: ${workflows.error}`);
    return { success: false, error: workflows.error };
  }

  const results = {
    checkedAt: new Date().toISOString(),
    totalSkills: Object.keys(skills).length,
    totalWorkflows: Object.keys(workflows).length,
    checks: [],
    summary: {
      total: 0,
      passed: 0,
      failed: 0,
      warnings: 0
    }
  };

  // 对每个 SKILL 进行检查
  for (const [skillName, skillData] of Object.entries(skills)) {
    console.log(`📋 检查 SKILL: ${skillName}`);

    const check = performCheck(skillName, skillData, workflows, verbose);
    results.checks.push(check);
    results.summary.total++;

    if (check.status === 'passed') {
      results.summary.passed++;
      console.log(`   ✅ 通过`);
    } else if (check.status === 'warning') {
      results.summary.warnings++;
      console.log(`   ⚠️  警告`);
    } else {
      results.summary.failed++;
      console.log(`   ❌ 失败`);
    }

    if (verbose) {
      printCheckDetails(check);
    }
  }

  // 打印汇总
  printSummary(results, outputFormat);

  return results;
}

/**
 * 执行单个 SKILL 的检查
 */
function performCheck(skillName, skillData, workflows, verbose) {
  const check = {
    skillName,
    skillDir: skillData.skillDir,
    status: 'passed',
    issues: [],
    urlIssues: [],
    paramIssues: [],
    valueIssues: []
  };

  // 查找对应的 workflow 函数
  const functionName = SKILL_TO_FUNCTION_MAP[skillName];
  let workflowFunc = null;
  let workflowFile = null;

  for (const [wfName, wfData] of Object.entries(workflows)) {
    for (const func of wfData.functions) {
      if (func.name === functionName) {
        workflowFunc = func;
        workflowFile = wfName;
        break;
      }
    }
    if (workflowFunc) break;
  }

  if (!workflowFunc) {
    check.status = 'warning';
    check.issues.push({
      type: 'no_workflow',
      message: `未找到对应的 workflow 函数: ${functionName || '(未配置映射)'}`,
      severity: 'warning'
    });
    return check;
  }

  check.workflowFunction = functionName;
  check.workflowFile = workflowFile;

  // 检查 API URL
  if (skillData.apis.length > 0) {
    const skillUrl = skillData.apis[0].url;
    const workflowUrl = workflowFunc.apiCalls[0]?.url;

    if (skillUrl && workflowUrl) {
      if (normalizeUrl(skillUrl) !== normalizeUrl(workflowUrl)) {
        check.urlIssues.push({
          severity: 'error',
          skillUrl,
          workflowUrl,
          message: `API 地址不一致`
        });
        check.status = 'failed';
      }
    }

    // 检查方法
    const skillMethod = skillData.apis[0].method;
    const workflowMethod = workflowFunc.apiCalls[0]?.method;
    if (skillMethod && workflowMethod && skillMethod !== workflowMethod) {
      check.urlIssues.push({
        severity: 'warning',
        message: `HTTP 方法不一致: SKILL=${skillMethod}, Workflow=${workflowMethod}`
      });
    }
  }

  // 检查参数
  if (skillData.apis.length > 0 && workflowFunc.apiCalls.length > 0) {
    const skillFields = skillData.apis[0].fields || extractFieldsFromCodeBlock(skillData.apis[0]);
    const workflowFields = workflowFunc.apiCalls[0]?.fields || {};

    // 从 SKILL 代码块中提取字段
    const skillDefinedFields = new Set();
    for (const api of skillData.apis) {
      for (const param of api.parameters) {
        skillDefinedFields.add(param.name);
      }
      if (api.fixedValues) {
        Object.keys(api.fixedValues).forEach(k => skillDefinedFields.add(k));
      }
    }

    // 检查 workflow 中多出的字段
    for (const fieldName of Object.keys(workflowFields)) {
      if (!skillDefinedFields.has(fieldName) && fieldName !== 'Content-Type') {
        check.paramIssues.push({
          severity: 'warning',
          type: 'extra_field',
          field: fieldName,
          value: workflowFields[fieldName]?.value,
          message: `Workflow 中有 SKILL 未定义的字段: ${fieldName}`
        });
      }
    }

    // 检查 workflow 中缺失的必填字段
    for (const fieldName of skillDefinedFields) {
      if (!workflowFields[fieldName]) {
        check.paramIssues.push({
          severity: 'error',
          type: 'missing_field',
          field: fieldName,
          message: `Workflow 中缺少 SKILL 定义的字段: ${fieldName}`
        });
        check.status = 'failed';
      }
    }
  }

  // 检查固定值
  if (skillData.apis.length > 0 && workflowFunc.apiCalls.length > 0) {
    const skillFixedValues = skillData.apis[0].fixedValues || {};
    const workflowFields = workflowFunc.apiCalls[0]?.fields || {};

    for (const [fieldName, expectedValue] of Object.entries(skillFixedValues)) {
      const actualField = workflowFields[fieldName];
      if (actualField) {
        if (actualField.value !== expectedValue) {
          check.valueIssues.push({
            severity: 'error',
            field: fieldName,
            expected: expectedValue,
            actual: actualField.value,
            message: `字段 ${fieldName} 值不一致: 期望=${expectedValue}, 实际=${actualField.value}`
          });
          check.status = 'failed';
        }
      }
    }
  }

  if (check.urlIssues.length > 0 || check.paramIssues.length > 0 || check.valueIssues.length > 0) {
    check.issues = [...check.urlIssues, ...check.paramIssues, ...check.valueIssues];
  }

  return check;
}

/**
 * 规范化 URL（去除环境差异）
 */
function normalizeUrl(url) {
  if (!url) return '';
  // 去除协议差异
  let normalized = url.replace(/^https?:\/\//, '');
  // 去除 test 前缀差异
  normalized = normalized.replace(/^test3?-/g, '');
  return normalized;
}

/**
 * 从 SKILL 代码块中提取字段
 */
function extractFieldsFromCodeBlock(api) {
  const fields = {};
  for (const code of api.codeBlocks) {
    const bodyMatch = code.match(/body\s*:\s*JSON\.stringify\(\s*\{([^}]+)\}/s);
    if (bodyMatch) {
      const fieldMatches = bodyMatch[1].matchAll(/([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g);
      for (const match of fieldMatches) {
        fields[match[1]] = { raw: match[0], isFixed: false, value: null };
      }
    }
  }
  return fields;
}

/**
 * 打印检查详情
 */
function printCheckDetails(check) {
  if (check.urlIssues.length > 0) {
    console.log('   📌 URL 问题:');
    for (const issue of check.urlIssues) {
      console.log(`      - ${issue.message}`);
      if (issue.skillUrl) console.log(`        SKILL: ${issue.skillUrl}`);
      if (issue.workflowUrl) console.log(`        Workflow: ${issue.workflowUrl}`);
    }
  }

  if (check.paramIssues.length > 0) {
    console.log('   📌 参数问题:');
    for (const issue of check.paramIssues) {
      console.log(`      - [${issue.severity.toUpperCase()}] ${issue.message}`);
    }
  }

  if (check.valueIssues.length > 0) {
    console.log('   📌 值问题:');
    for (const issue of check.valueIssues) {
      console.log(`      - [${issue.severity.toUpperCase()}] ${issue.message}`);
    }
  }
}

/**
 * 打印汇总
 */
function printSummary(results, format) {
  console.log('\n' + '='.repeat(60));
  console.log('📊 检查汇总');
  console.log('='.repeat(60));
  console.log(`   检查时间: ${results.checkedAt}`);
  console.log(`   检查的 SKILL 数: ${results.totalSkills}`);
  console.log(`   检查的 Workflow 数: ${results.totalWorkflows}`);
  console.log(`   ─────────────────────`);
  console.log(`   ✅ 通过: ${results.summary.passed}`);
  console.log(`   ⚠️  警告: ${results.summary.warnings}`);
  console.log(`   ❌ 失败: ${results.summary.failed}`);

  // 列出失败的检查
  const failedChecks = results.checks.filter(c => c.status === 'failed');
  if (failedChecks.length > 0) {
    console.log('\n' + '-'.repeat(60));
    console.log('❌ 失败的检查:');
    for (const check of failedChecks) {
      console.log(`\n   SKILL: ${check.skillName}`);
      console.log(`   Workflow 函数: ${check.workflowFunction || '未找到'}`);
      printCheckDetails(check);
    }
  }

  // 列出警告
  const warningChecks = results.checks.filter(c => c.status === 'warning');
  if (warningChecks.length > 0) {
    console.log('\n' + '-'.repeat(60));
    console.log('⚠️  警告的检查:');
    for (const check of warningChecks) {
      console.log(`   - ${check.skillName}: ${check.issues[0]?.message}`);
    }
  }

  console.log('\n' + '='.repeat(60));

  if (results.summary.failed > 0) {
    console.log('❌ 检查失败: 存在不一致的 API 定义，请修复后再继续。');
    process.exitCode = 1;
  } else if (results.summary.warnings > 0) {
    console.log('⚠️  检查通过但有警告。');
  } else {
    console.log('✅ 所有检查通过！');
  }
}

/**
 * 生成 JSON 格式报告
 */
function generateJsonReport(results) {
  return JSON.stringify(results, null, 2);
}

/**
 * 生成 Markdown 格式报告
 */
function generateMarkdownReport(results) {
  let md = `# SKILL 与 Workflow API 一致性检查报告\n\n`;
  md += `**检查时间**: ${results.checkedAt}\n\n`;
  md += `## 汇总\n\n`;
  md += `| 指标 | 值 |\n`;
  md += `|------|-----|\n`;
  md += `| 检查的 SKILL 数 | ${results.totalSkills} |\n`;
  md += `| 检查的 Workflow 数 | ${results.totalWorkflows} |\n`;
  md += `| 通过 | ${results.summary.passed} |\n`;
  md += `| 警告 | ${results.summary.warnings} |\n`;
  md += `| 失败 | ${results.summary.failed} |\n\n`;

  if (results.summary.failed > 0) {
    md += `## 失败的检查\n\n`;
    for (const check of results.checks.filter(c => c.status === 'failed')) {
      md += `### ${check.skillName}\n\n`;
      md += `- **Workflow 函数**: ${check.workflowFunction || '未找到'}\n`;
      if (check.urlIssues.length > 0) {
        md += `- **URL 问题**:\n`;
        for (const issue of check.urlIssues) {
          md += `  - ${issue.message}\n`;
          if (issue.skillUrl) md += `  - SKILL: \`${issue.skillUrl}\`\n`;
          if (issue.workflowUrl) md += `  - Workflow: \`${issue.workflowUrl}\`\n`;
        }
      }
      if (check.paramIssues.length > 0) {
        md += `- **参数问题**:\n`;
        for (const issue of check.paramIssues) {
          md += `  - [${issue.severity.toUpperCase()}] ${issue.message}\n`;
        }
      }
      if (check.valueIssues.length > 0) {
        md += `- **值问题**:\n`;
        for (const issue of check.valueIssues) {
          md += `  - [${issue.severity.toUpperCase()}] ${issue.message}\n`;
        }
      }
      md += '\n';
    }
  }

  return md;
}

module.exports = {
  checkConsistency,
  generateJsonReport,
  generateMarkdownReport
};
