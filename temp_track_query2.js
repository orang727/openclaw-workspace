const fs = require('fs');
const authContent = fs.readFileSync('C:/Users/admin/.openclaw/workspace/skills/handle-track-work/.auth', 'utf8');
const authConfig = {};
authContent.split('\n').forEach(line => {
  const idx = line.indexOf('=');
  if (idx > 0) authConfig[line.substring(0, idx).trim()] = line.substring(idx + 1).trim();
});

const trackWorkId = '127320898734233217';
// 尝试不同的请求参数
fetch('https://test3-track.xiujiadian.com/amis/track/list', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + authConfig.AK
  },
  body: JSON.stringify({
    trackWorkId: parseInt(trackWorkId)
  })
}).then(r => r.json()).then(d => {
  console.log(JSON.stringify(d, null, 2));
}).catch(e => console.log('ERROR: ' + e.message));
