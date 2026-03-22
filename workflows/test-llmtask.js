// 直接测试 llm-task 工具
const http = require('http');

const options = {
  hostname: 'localhost',
  port: 18789,
  path: '/tools/invoke',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer 64a4ffec94093067b0fb0927527cffdb3e4e51cd15a46083'
  }
};

const req = http.request(options, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    console.log('Response:', data);
  });
});

req.on('error', (e) => {
  console.error('Error:', e.message);
});

req.write(JSON.stringify({
  tool: 'llm-task',
  action: 'json',
  args: {
    prompt: '返回测试结果',
    input: { test: true },
    schema: {
      type: 'object',
      properties: {
        result: { type: 'string' }
      }
    }
  }
}));

req.end();
