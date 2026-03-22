// 测试脚本 - 直接运行简单命令
const { spawn } = require('child_process');

const args = [
  'C:\\lobster\\bin\\lobster.js',
  'run',
  '--mode', 'tool',
  'exec --json echo hello'
];

const proc = spawn('node', args, {
  cwd: 'C:\\Users\\admin\\.openclaw\\workspace\\workflows',
  stdio: 'inherit',
  env: {
    ...process.env,
    OPENCLAW_URL: 'http://localhost:18789',
    OPENCLAW_TOKEN: '64a4ffec94093067b0fb0927527cffdb3e4e51cd15a46083',
    PATH: 'C:\\Users\\admin\\AppData\\Roaming\\npm;' + process.env.PATH
  }
});

proc.on('exit', code => process.exit(code));
