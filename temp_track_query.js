const fs = require('fs');
const authContent = fs.readFileSync('C:/Users/admin/.openclaw/workspace/skills/handle-track-work/.auth', 'utf8');
const authConfig = {};
authContent.split('\n').forEach(line => {
  const idx = line.indexOf('=');
  if (idx > 0) authConfig[line.substring(0, idx).trim()] = line.substring(idx + 1).trim();
});

const trackWorkId = '127212582539728512';

fetch('https://test3-track.xiujiadian.com/amis/track/list', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + authConfig.AK
  },
  body: JSON.stringify({ trackWorkId })
}).then(r => r.json()).then(d => {
  if (d.status === 0 && d.data && d.data.items && d.data.items.length > 0) {
    const workId = d.data.items[0].workId;
    console.log('WORK_ID=' + workId);
  } else {
    console.log('ERROR: 未找到该跟单ID对应的工单，msg=' + (d.msg || ''));
  }
}).catch(e => console.log('ERROR: ' + e.message));
