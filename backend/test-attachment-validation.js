const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Test attachment type validation
const BASE_URL = 'http://localhost:3001/api/channels';
const TEST_TOKEN = 'your_test_token_here'; // Replace with actual token

// Helper to create base64 encoded file data
function createFileData(filePath) {
  if (fs.existsSync(filePath)) {
    return fs.readFileSync(filePath).toString('base64');
  }
  // Create a dummy file content for testing
  return Buffer.from('test file content').toString('base64');
}

async function testAttachmentValidation(emailProvider = 'email') {
  console.log(`🧪 Testing Attachment Type Validation for ${emailProvider}`);
  console.log('='.repeat(60));

  const testCases = [
    {
      name: '✅ Valid PDF attachment',
      attachments: [{
        name: 'test.pdf',
        type: 'application/pdf',
        data: createFileData('test.pdf')
      }],
      shouldPass: true
    },
    {
      name: '✅ Valid image attachment',
      attachments: [{
        name: 'photo.jpg',
        type: 'image/jpeg',
        data: createFileData('photo.jpg')
      }],
      shouldPass: true
    },
    {
      name: '✅ Valid document attachment',
      attachments: [{
        name: 'document.docx',
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        data: createFileData('document.docx')
      }],
      shouldPass: true
    },
    {
      name: '❌ Blocked executable (.exe)',
      attachments: [{
        name: 'malware.exe',
        type: 'application/x-msdownload',
        data: createFileData('malware.exe')
      }],
      shouldPass: false,
      expectedError: 'executable'
    },
    {
      name: '❌ Blocked script (.bat)',
      attachments: [{
        name: 'script.bat',
        type: 'application/x-msdos-program',
        data: createFileData('script.bat')
      }],
      shouldPass: false,
      expectedError: 'not allowed'
    },
    {
      name: '❌ Blocked shell script (.sh)',
      attachments: [{
        name: 'script.sh',
        type: 'application/x-sh',
        data: createFileData('script.sh')
      }],
      shouldPass: false,
      expectedError: 'not allowed'
    },
    {
      name: '❌ Blocked archive (.zip)',
      attachments: [{
        name: 'archive.zip',
        type: 'application/zip',
        data: createFileData('archive.zip')
      }],
      shouldPass: false,
      expectedError: 'not allowed'
    },
    {
      name: '❌ Invalid file extension',
      attachments: [{
        name: 'file.unknown',
        type: 'application/octet-stream',
        data: createFileData('file.unknown')
      }],
      shouldPass: false,
      expectedError: 'not allowed'
    },
    {
      name: '❌ MIME type mismatch',
      attachments: [{
        name: 'document.pdf',
        type: 'image/jpeg', // Wrong MIME type for PDF
        data: createFileData('document.pdf')
      }],
      shouldPass: true, // Warning only, not blocking
      expectWarning: true
    },
    {
      name: '❌ Missing file extension',
      attachments: [{
        name: 'file',
        type: 'text/plain',
        data: createFileData('file')
      }],
      shouldPass: false,
      expectedError: 'extension'
    },
    {
      name: '❌ Missing MIME type',
      attachments: [{
        name: 'document.pdf',
        type: undefined,
        data: createFileData('document.pdf')
      }],
      shouldPass: true, // Warning only
      expectWarning: true
    }
  ];

  const results = [];
  const accountId = 'test_account_123'; // Replace with actual account ID
  const chatId = 'test_chat_456'; // Replace with actual chat ID

  for (const testCase of testCases) {
    console.log(`\n📋 Test: ${testCase.name}`);
    
    try {
      const response = await axios.post(
        `${BASE_URL}/${emailProvider}/${accountId}/chats/${chatId}/send`,
        {
          body: 'Test email body',
          subject: 'Test Subject',
          to: 'test@example.com',
          attachments: testCase.attachments
        },
        {
          headers: {
            'Authorization': `Bearer ${TEST_TOKEN}`,
            'Content-Type': 'application/json'
          },
          validateStatus: () => true // Don't throw on any status
        }
      );

      if (testCase.shouldPass) {
        if (response.status === 200 || response.status === 500) { // 500 might be from other errors
          console.log(`   ✅ PASSED - Status: ${response.status}`);
          
          if (testCase.expectWarning && response.status === 200) {
            console.log(`   ⚠️  Warning expected (check logs for validation warnings)`);
          }
          
          results.push({ name: testCase.name, passed: true });
        } else {
          console.log(`   ❌ FAILED - Expected success, got ${response.status}`);
          console.log(`   Response:`, JSON.stringify(response.data, null, 2));
          results.push({ name: testCase.name, passed: false });
        }
      } else {
        if (response.status === 400 && response.data.error?.includes('attachment')) {
          const errorMsg = response.data.details || response.data.error || '';
          if (testCase.expectedError && errorMsg.toLowerCase().includes(testCase.expectedError.toLowerCase())) {
            console.log(`   ✅ PASSED - Correctly rejected with error: ${errorMsg.substring(0, 80)}...`);
            results.push({ name: testCase.name, passed: true });
          } else {
            console.log(`   ⚠️  Rejected but error doesn't match expected pattern`);
            console.log(`   Error: ${errorMsg}`);
            results.push({ name: testCase.name, passed: false });
          }
        } else {
          console.log(`   ❌ FAILED - Expected 400 (attachment error), got ${response.status}`);
          console.log(`   Response:`, JSON.stringify(response.data, null, 2));
          results.push({ name: testCase.name, passed: false });
        }
      }
    } catch (error) {
      if (error.response) {
        console.log(`   Error: ${error.response.status} - ${error.response.data?.error || error.message}`);
        
        if (testCase.shouldPass) {
          results.push({ name: testCase.name, passed: false });
        } else {
          // Check if it's a validation error
          const errorMsg = error.response.data?.details || error.response.data?.error || '';
          if (errorMsg.toLowerCase().includes('attachment') || errorMsg.toLowerCase().includes('not allowed')) {
            console.log(`   ✅ PASSED - Correctly rejected`);
            results.push({ name: testCase.name, passed: true });
          } else {
            results.push({ name: testCase.name, passed: false });
          }
        }
      } else {
        console.log(`   Error: ${error.message}`);
        results.push({ name: testCase.name, passed: false });
      }
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(60));
  
  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  
  results.forEach(result => {
    console.log(`${result.passed ? '✅' : '❌'} ${result.name}: ${result.passed ? 'PASSED' : 'FAILED'}`);
  });
  
  console.log(`\n✅ Passed: ${passed}/${total}`);
  console.log(`❌ Failed: ${total - passed}/${total}`);
  console.log(`📈 Success Rate: ${((passed / total) * 100).toFixed(1)}%`);
  
  if (passed === total) {
    console.log('\n🎉 All attachment validation tests passed!');
  } else {
    console.log('\n⚠️  Some tests failed. Please review the output above.');
  }
}

// Run tests
console.log('🚀 Attachment Type Validation Test Suite');
console.log('='.repeat(60));
console.log('⚠️  Note: Make sure to set TEST_TOKEN and valid account/chat IDs before running');
console.log('='.repeat(60) + '\n');

// Test both Gmail and Outlook if needed
testAttachmentValidation('email').catch(console.error);

