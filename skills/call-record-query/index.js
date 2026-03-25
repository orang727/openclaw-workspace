/**
 * call-record-query_v3
 * 根据跟单ID获取工单ID，再查询通话记录并获取语音转文字
 * 筛选规则：有detectRecordId + 时长>10秒 + 工程师→用户 + 取最晚一条
 * 支持测试/生产环境切换
 */

const fs = require('fs');
const path = require('path');

// 环境域名映射
const ENV_CONFIG = {
  test: {
    track: 'https://test3-track.xiujiadian.com',
    admin: 'https://test3-admin.xiujiadian.com'
  },
  prod: {
    track: 'https://track.xiujiadian.com',
    admin: 'https://ais.xiujiadian.com/public'
  }
};

// 读取认证配置
const authFilePath = path.join(__dirname, '.auth');
let authConfig = {};
try {
  const authContent = fs.readFileSync(authFilePath, 'utf8');
  authContent.split('\n').forEach(line => {
    const idx = line.indexOf('=');
    if (idx > 0) authConfig[line.substring(0, idx).trim()] = line.substring(idx + 1).trim();
  });
} catch (e) {
  console.error('读取认证文件失败:', e.message);
  process.exit(1);
}

const AK = authConfig.AK;
const trackWorkId = process.argv[2];
const env = (process.argv[3] || 'test').toLowerCase() === 'prod' ? 'prod' : 'test';
const envConfig = ENV_CONFIG[env];

console.log(`\n🌐 环境: ${env === 'prod' ? '生产' : '测试'}`);
console.log(`📡 域名: ${envConfig.admin}`);

if (!trackWorkId) {
  console.log('\n用法: node index.js <trackWorkId> [环境]');
  console.log('示例: node index.js 127325663565551233 test');
  console.log('示例: node index.js 127325663565551233 prod');
  process.exit(1);
}

// Step 1: 跟单ID → 工单ID
async function getWorkId() {
  console.log(`\n[Step 1] 查询工单ID，跟单ID=${trackWorkId}`);

  const url = `${envConfig.track}/amis/track/list`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + AK
    },
    body: JSON.stringify({ trackWorkId })
  });

  const text = await res.text();

  let workId = null;
  if (text.trim().startsWith('<')) {
    const match = text.match(/<workId>(\d+)<\/workId>/);
    workId = match ? match[1] : null;
  } else {
    try {
      const data = JSON.parse(text);
      if (data.data?.items?.[0]?.workId) {
        workId = data.data.items[0].workId;
      }
    } catch (e) {}
  }

  if (!workId) {
    throw new Error('未找到工单ID，响应: ' + text.substring(0, 200));
  }

  console.log(`[Step 1] ✅ 获取工单ID成功: ${workId}`);
  return workId;
}

// 计算通话时长（秒）
function getDurationSeconds(duration) {
  if (!duration) return 0;
  const parts = duration.split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 0;
}

// Step 2: 工单ID → 通话记录（筛选）
async function getCallRecord(workId) {
  console.log(`\n[Step 2] 查询通话记录，工单ID=${workId}`);

  const url = `${envConfig.admin}/bfm-serv-work/serv/work/listCallRecord?servWorkId=${workId}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: { 'Authorization': 'Bearer ' + AK }
  });

  const text = await res.text();
  let data = [];

  try {
    const json = JSON.parse(text);
    data = Array.isArray(json) ? json : (json.data || []);
  } catch (e) {}

  if (!Array.isArray(data) || data.length === 0) {
    console.log('[Step 2] ⚠️ 未找到通话记录');
    return { success: false, message: '未找到通话记录' };
  }

  console.log(`[Step 2] 📞 共有 ${data.length} 条通话记录`);
  console.log('[Step 2] 🔍 筛选规则: detectRecordId存在 + 时长>10秒 + 工程师→用户');

  const filtered = data.filter(item => {
    const hasDetectRecordId = !!item.detectRecordId;
    const durationSeconds = getDurationSeconds(item.callDuration);
    const isLongCall = durationSeconds > 10;
    const isEngineerToUser = item.callTypeName === '工程师' && item.peerTypeName === '用户';
    return hasDetectRecordId && isLongCall && isEngineerToUser;
  });

  console.log(`[Step 2] 🔍 筛选后剩余 ${filtered.length} 条记录`);

  if (filtered.length === 0) {
    return {
      success: false,
      message: '没有符合条件的通话记录（需满足：detectRecordId存在 + 时长>10秒 + 工程师→用户）'
    };
  }

  filtered.sort((a, b) => {
    const timeA = new Date(a.finishTime || '1970-01-01').getTime();
    const timeB = new Date(b.finishTime || '1970-01-01').getTime();
    return timeB - timeA;
  });

  const record = filtered[0];
  console.log(`[Step 2] ✅ 选择最新记录: ${record.callRecordId}`);
  console.log(`    通话时长: ${record.callDuration}, detectRecordId: ${record.detectRecordId}`);
  console.log(`    呼叫类型: ${record.callTypeName} → ${record.peerTypeName}`);

  return { success: true, record };
}

// Step 3: 获取语音转文字
async function getVoiceText(detectRecordId) {
  if (!detectRecordId) {
    console.log('\n[Step 3] ⏭️ 无 detectRecordId，跳过语音转文字');
    return null;
  }

  console.log(`\n[Step 3] 获取语音转文字，detectRecordId=${detectRecordId}`);

  let allItems = [];
  let pageIndex = 1;
  const pageSize = 100;
  let total = 0;

  try {
    while (true) {
      const url = `${envConfig.admin}/bfm-mds/detectRecord/voiceRecord/content?detectRecordId=${detectRecordId}&pageIndex=${pageIndex}&pageSize=${pageSize}`;
      const res = await fetch(url, {
        method: 'GET',
        headers: { 'Authorization': 'Bearer ' + AK }
      });

      const data = await res.json();
      if (data.status !== 0 || !data.data?.items) {
        console.log('[Step 3] ⚠️ 语音转文字接口返回异常');
        break;
      }

      if (pageIndex === 1) {
        total = data.data.total || 0;
      }

      const roleMap = { 1: '工程师', 2: '用户' };
      const items = data.data.items.map(item => ({
        role: roleMap[item.role] || '未知',
        text: item.text,
        beginTime: item.beginTime,
        endTime: item.endTime
      }));

      allItems = allItems.concat(items);

      if (data.data.items.length < pageSize || allItems.length >= total) {
        break;
      }
      pageIndex++;
    }

    console.log(`[Step 3] ✅ 获取语音转文字成功，共 ${allItems.length} 条`);
  } catch (e) {
    console.log(`[Step 3] ⚠️ 语音转文字获取失败: ${e.message}`);
  }

  return allItems.length > 0 ? { total, items: allItems } : null;
}

// 主流程
async function main() {
  console.log('═'.repeat(60));
  console.log('🎯 通话记录查询 v3（跟单ID版）');
  console.log('═'.repeat(60));

  try {
    const workId = await getWorkId();
    const callResult = await getCallRecord(workId);

    if (!callResult.success) {
      const result = {
        success: false,
        trackWorkId,
        workId,
        env,
        callRecord: null,
        voiceText: null,
        message: callResult.message
      };
      console.log('\n' + '='.repeat(60));
      console.log('📋 查询结果');
      console.log('='.repeat(60));
      console.log(JSON.stringify(result, null, 2));
      return result;
    }

    const callRecord = callResult.record;
    const voiceText = callRecord.detectRecordId
      ? await getVoiceText(callRecord.detectRecordId)
      : null;

    const result = {
      success: true,
      trackWorkId,
      workId,
      env,
      callRecord: {
        callRecordId: callRecord.callRecordId,
        detectRecordId: callRecord.detectRecordId,
        callTypeName: callRecord.callTypeName,
        peerTypeName: callRecord.peerTypeName,
        startTime: callRecord.startTime,
        finishTime: callRecord.finishTime,
        callDuration: callRecord.callDuration,
        tapeUrl: callRecord.tapeUrl
      },
      voiceText
    };

    console.log('\n' + '='.repeat(60));
    console.log('📋 查询结果');
    console.log('='.repeat(60));
    console.log(JSON.stringify(result, null, 2));

    if (voiceText && voiceText.items.length > 0) {
      console.log('\n💬 语音转文字内容：');
      voiceText.items.forEach(item => {
        console.log(`[${item.role}] ${item.text}`);
      });
    }

    console.log('\n✅ 查询完成');
    return result;
  } catch (e) {
    console.error('\n❌ 查询失败:', e.message);
    process.exit(1);
  }
}

main();
