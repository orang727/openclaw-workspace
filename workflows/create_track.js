const fs = require('fs');
const authContent = fs.readFileSync('C:\\Users\\admin\\.openclaw\\workspace\\.auth\\xiujiadian', 'utf8');
const authConfig = {};
authContent.split('\n').forEach(line => {
  const idx = line.indexOf('=');
  if (idx > 0) authConfig[line.substring(0, idx).trim()] = line.substring(idx + 1).trim();
});

const workId = '6127212414217358976';
const trackWorkId = '127212444893681280';

// 创建跟单任务
const body = {
  workId: workId,
  trackContentId: 1191,
  trackType: 1002,
  trackLevel: 4,
  reasonId: 1307,
  reasonName: '申请改约',
  remark: '无通话录音，无法自动识别用户意图，需人工处理'
};

fetch('https://test3-track.xiujiadian.com/amis/track/save', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + authConfig.AK
  },
  body: JSON.stringify(body)
}).then(r => r.text()).then(d => {
  console.log('====== 创建跟单响应 ======');
  console.log(d);
  
  const statusMatch = d.match(/<status>(\d+)<\/status>/);
  const msgMatch = d.match(/<msg>([^<]+)<\/msg>/);
  
  if (statusMatch && statusMatch[1] === '0') {
    const newTrackIdMatch = d.match(/<id>(\d+)<\/id>/);
    console.log('====== 创建成功 ======');
    console.log('新跟单ID:', newTrackIdMatch ? newTrackIdMatch[1] : 'N/A');
  } else {
    console.log('创建失败:', msgMatch ? msgMatch[1] : '未知错误');
  }
}).catch(e => console.log('ERROR: ' + e.message));
