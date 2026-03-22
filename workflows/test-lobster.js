// 测试 openclaw.invoke 命令
const { spawn } = require('child_process');

const args = [
  'C:\\lobster\\bin\\lobster.js',
  'openclaw.invoke',
  '--tool', 'llm-task',
  '--action', 'json',
  '--args-json', '{"prompt":"返回测试结果","input":{"test":true},"schema":{"type":"object","properties":{"result":{"type":"string"}}}}'
];

const proc = spawn('node', args, {
  stdio: 'inherit',
  env: {
    ...process.env,
    OPENCLAW_URL: 'http://localhost:18789',
    OPENCLAW_TOKEN: '64a4ffec94093067b0fb0927527cffdb3e4e51cd15a46083',
    PATH: 'C:\\Users\\admin\\AppData\\Roaming\\npm;' + process.env.PATH
  }
});

proc.on('exit', code => process.exit(code));
