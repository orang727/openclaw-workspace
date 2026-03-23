/**
 * 意图后处理工作流 (MVP)
 * 修正版：调用 workflow-server.js
 */

const http = require('http');

const CONFIG = {
  workflowServer: 'http://localhost:3000'
};

/**
 * 调用工作流服务器
 */
async function runWorkflow(trackWorkId, useSandbox = true) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({ trackWorkId, useSandbox });
    const url = new URL('/execute', CONFIG.workflowServer);

    const options = {
      hostname: url.hostname,
      port: url.port || 80,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 120000
    };

    console.log(`📤 调用工作流服务器: ${CONFIG.workflowServer}/execute`);
    console.log(`📦 参数: trackWorkId=${trackWorkId}, useSandbox=${useSandbox}`);

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`解析失败: ${e.message}`));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('超时')); });
    req.write(postData);
    req.end();
  });
}

/**
 * 主入口
 */
async function main(input) {
  const { trackWorkId, useSandbox = true } = input;
  console.log('='.repeat(60));
  console.log('🚀 意图后处理工作流启动');
  console.log('='.repeat(60));

  try {
    const result = await runWorkflow(trackWorkId, useSandbox);
    console.log('📥 结果:', JSON.stringify(result, null, 2));
    console.log('='.repeat(60));
    console.log('✅ 完成');
    return result;
  } catch (error) {
    console.error('❌ 失败:', error.message);
    return { success: false, error: error.message };
  }
}

if (require.main === module) {
  if (process.argv.length < 3) {
    console.log('用法: node index.js \'{"trackWorkId": "xxx"}\'');
    process.exit(1);
  }
  main(JSON.parse(process.argv[2])).then(r => process.exit(r.success ? 0 : 1));
}

module.exports = main;
