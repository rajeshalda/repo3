const axios = require('axios');
const { formatInTimeZone } = require('date-fns-tz');

async function testTimezones() {
  console.log('🧪 Testing Timezone Configuration\n');
  
  const testUrls = [
    { name: 'Local Dev', url: 'http://localhost:8080/api/debug-timezone' },
    { name: 'Local Docker', url: 'http://localhost:8081/api/debug-timezone' }
  ];

  for (const { name, url } of testUrls) {
    try {
      console.log(`📍 Testing ${name} - ${url}`);
      const response = await axios.get(url, { timeout: 5000 });
      const data = response.data;
      
      console.log(`✅ ${name} Results:`);
      console.log(`   Server Time (IST): ${data.debugInfo.server.currentTimeIST}`);
      console.log(`   System Timezone: ${data.debugInfo.server.systemTimezone}`);
      console.log(`   Node Timezone: ${data.debugInfo.server.nodeTimezone}`);
      console.log(`   Process Timezone: ${data.debugInfo.server.processTimezone}`);
      console.log(`   Sample Meeting IST: ${data.debugInfo.testing.sampleMeetingIST}`);
      console.log('');
      
    } catch (error) {
      console.log(`❌ ${name} - Not available or error:`, error.message);
      console.log('   (This is expected if the server is not running)');
      console.log('');
    }
  }

  // Test the actual timezone conversion logic
  console.log('🔄 Testing Timezone Conversion Logic:');
  const testDate = new Date('2024-06-23T12:00:00.000Z');
  console.log(`   UTC Time: ${testDate.toISOString()}`);
  
  try {
    const istTime = formatInTimeZone(testDate, 'Asia/Kolkata', 'yyyy-MM-dd HH:mm:ss zzz');
    console.log(`   IST Time: ${istTime}`);
    console.log(`   Expected: 2024-06-23 17:30:00 IST`);
    console.log(`   Match: ${istTime.includes('17:30:00') ? '✅ Correct' : '❌ Incorrect'}`);
  } catch (error) {
    console.log(`   ❌ Error in timezone conversion: ${error.message}`);
  }
}

// Run the test
testTimezones().then(() => {
  console.log('🏁 Timezone testing completed!');
}).catch(error => {
  console.error('💥 Test failed:', error.message);
}); 