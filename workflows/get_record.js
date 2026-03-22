const fs = require('fs');
const authContent = fs.readFileSync('C:\\Users\\admin\\.openclaw\\workspace\\.auth\\xiujiadian', 'utf8');
const authConfig = {};
authContent.split('\n').forEach(line => {
  const idx = line.indexOf('=');
  if (idx > 0) authConfig[line.substring(0, idx).trim()] = line.substring(idx + 1).trim();
});

const servWorkId = '6127212414217358976';

// 查询通话录音 - 使用admin接口
fetch('https://test3-admin.xiujiadian.com/bfm-serv-work/serv/work/listCallRecord?servWorkId=' + servWorkId, {
  method: 'GET',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + authConfig.AK
  }
}).then(r => r.json()).then(d => {
  console.log('====== 录音查询响应 ======');
  console.log(JSON.stringify(d, null, 2));
  
  if (d.status === 0 && d.data && d.data.length > 0) {
    // 筛选工程师与用户的通话记录
    const filtered = d.data.filter(item => {
      return (item.callTypeName === '工程师' && item.peerTypeName === '用户') ||
             (item.callTypeName === '用户' && item.peerTypeName === '工程师');
    });
    
    // 按时间倒序取最近一条
    filtered.sort((a, b) => (b.startTime || 0) - (a.startTime || 0));
    const latest = filtered[0];
    
    console.log('====== 最新通话录音 ======');
    console.log('录音URL:', latest.tapeUrl || '无录音');
    console.log('通话类型:', latest.callTypeName);
    console.log('对方类型:', latest.peerTypeName);
    console.log('通话时长:', latest.duration, '秒');
    console.log('通话内容:', latest.callText || '无文本');
  } else {
    console.log('无通话记录');
  }
}).catch(e => console.log('ERROR: ' + e.message));
