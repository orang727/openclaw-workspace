const fs = require('fs');
const authContent = fs.readFileSync('C:\\Users\\admin\\.openclaw\\workspace\\.auth\\xiujiadian', 'utf8');
const authConfig = {};
authContent.split('\n').forEach(line => {
  const idx = line.indexOf('=');
  if (idx > 0) authConfig[line.substring(0, idx).trim()] = line.substring(idx + 1).trim();
});

const trackWorkId = '127212444893681280';

fetch('https://test3-track.xiujiadian.com/amis/track/list', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + authConfig.AK
  },
  body: JSON.stringify({ trackWorkId })
}).then(r => r.text()).then(d => {
  console.log('Raw response:', d);
  // 解析XML
  const statusMatch = d.match(/<status>(\d+)<\/status>/);
  const msgMatch = d.match(/<msg>([^<]+)<\/msg>/);
  
  if (statusMatch && statusMatch[1] === '0') {
    const workIdMatch = d.match(/<workId>(\d+)<\/workId>/);
    const trackTypeMatch = d.match(/<trackTypeName>([^<]+)<\/trackTypeName>/);
    const statusMatch2 = d.match(/<statusName>([^<]+)<\/statusName>/);
    const engineerNameMatch = d.match(/<engineerName>([^<]+)<\/engineerName>/);
    const trackContentMatch = d.match(/<trackContent>([^<]+)<\/trackContent>/);
    const reasonNameMatch = d.match(/<reasonName>([^<]+)<\/reasonName>/);
    const operateRemarkMatch = d.match(/<operateRemark>([^<]+)<\/operateRemark>/);
    
    console.log('====== 工单信息 ======');
    console.log('WORK_ID:', workIdMatch ? workIdMatch[1] : 'N/A');
    console.log('跟单类型:', trackTypeMatch ? trackTypeMatch[1] : 'N/A');
    console.log('跟单状态:', statusMatch2 ? statusMatch2[1] : 'N/A');
    console.log('工程师:', engineerNameMatch ? engineerNameMatch[1] : 'N/A');
    console.log('跟单内容:', trackContentMatch ? trackContentMatch[1] : 'N/A');
    console.log('原因:', reasonNameMatch ? reasonNameMatch[1] : 'N/A');
    console.log('操作备注:', operateRemarkMatch ? operateRemarkMatch[1] : 'N/A');
    console.log('Status:', statusMatch[1], 'Msg:', msgMatch ? msgMatch[1] : '');
  } else {
    console.log('ERROR: status=' + (statusMatch ? statusMatch[1] : 'unknown') + ', msg=' + (msgMatch ? msgMatch[1] : ''));
  }
}).catch(e => console.log('ERROR: ' + e.message));
