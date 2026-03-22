// 直接通过 Gateway 调用 Skills
const http = require('http');

const GATEWAY_URL = 'http://localhost:18789';
const TOKEN = '64a4ffec94093067b0fb0927527cffdb3e4e51cd15a46083';

function invokeTool(tool, action, args) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 18789,
      path: '/tools/invoke',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + TOKEN
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json);
        } catch (e) {
          reject(new Error('Invalid JSON: ' + data));
        }
      });
    });

    req.on('error', reject);
    req.write(JSON.stringify({ tool, action, args }));
    req.end();
  });
}

// 测试 Skills
async function testSkills() {
  console.log('=== 测试 Skills ===\n');

  // 1. 测试 llm-task
  console.log('1. 测试 llm-task...');
  try {
    const result = await invokeTool('llm-task', 'json', {
      prompt: '返回测试结果',
      input: { test: true },
      schema: { type: 'object', properties: { result: { type: 'string' } } }
    });
    console.log('✅ llm-task 正常:', JSON.stringify(result.details?.json || result).slice(0, 100));
  } catch (e) {
    console.log('❌ llm-task 失败:', e.message);
  }

  // 2. 测试 exec (运行命令)
  console.log('\n2. 测试 exec (node --version)...');
  try {
    const result = await invokeTool('exec', 'run', {
      command: 'node --version'
    });
    console.log('✅ exec 正常:', result.result?.content?.[0]?.text?.slice(0, 100));
  } catch (e) {
    console.log('❌ exec 失败:', e.message);
  }

  // 3. 测试 read (读取文件)
  console.log('\n3. 测试 read (SKILLS/cancel-work/SKILL.md)...');
  try {
    const result = await invokeTool('read', 'file', {
      path: 'C:\\Users\\admin\\.openclaw\\workspace\\SKILLS\\cancel-work\\SKILL.md'
    });
    console.log('✅ read 正常: 文件存在');
  } catch (e) {
    console.log('❌ read 失败:', e.message);
  }

  console.log('\n=== 测试完成 ===');
}

testSkills();
