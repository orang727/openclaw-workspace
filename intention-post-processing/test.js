/**
 * 工作流测试脚本
 */

const main = require('./index');

// 测试用例1：确认上门场景
const testCase1 = {
  trackId: 'TEST-001',
  intentionContent: 'type1'
};

// 测试用例2：取消场景
const testCase2 = {
  trackId: 'TEST-002',
  intentionContent: 'type3'
};

// 测试用例3：询价场景
const testCase3 = {
  trackId: 'TEST-003',
  intentionContent: 'type2'
};

// 测试用例4：其他意图场景
const testCase4 = {
  trackId: 'TEST-004',
  intentionContent: 'type4'
};

async function runTests() {
  console.log('===== 测试用例1：确认上门 =====');
  const result1 = await main(testCase1);
  console.log(JSON.stringify(result1, null, 2));

  console.log('\n===== 测试用例2：取消 =====');
  const result2 = await main(testCase2);
  console.log(JSON.stringify(result2, null, 2));

  console.log('\n===== 测试用例3：询价 =====');
  const result3 = await main(testCase3);
  console.log(JSON.stringify(result3, null, 2));

  console.log('\n===== 测试用例4：其他意图 =====');
  const result4 = await main(testCase4);
  console.log(JSON.stringify(result4, null, 2));
}

runTests();
