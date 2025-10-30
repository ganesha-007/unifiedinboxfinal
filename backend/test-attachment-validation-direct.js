// Direct test of attachment validation service
const { 
  validateAttachment, 
  validateAttachments,
  getAllowedExtensions,
  getBlockedExtensions
} = require('./dist/services/attachmentValidation.service');

console.log('🧪 Direct Attachment Validation Test');
console.log('='.repeat(60));

// Test 1: Valid attachments
console.log('\n✅ Test 1: Valid attachments');
const validAttachments = [
  { name: 'document.pdf', type: 'application/pdf', data: Buffer.from('test').toString('base64') },
  { name: 'photo.jpg', type: 'image/jpeg', data: Buffer.from('test').toString('base64') },
  { name: 'spreadsheet.xlsx', type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', data: Buffer.from('test').toString('base64') }
];

const result1 = validateAttachments(validAttachments);
console.log(`   Result: ${result1.isValid ? '✅ PASSED' : '❌ FAILED'}`);
if (result1.errors.length > 0) {
  console.log(`   Errors:`, result1.errors);
}
if (result1.warnings.length > 0) {
  console.log(`   Warnings:`, result1.warnings);
}

// Test 2: Blocked executables
console.log('\n❌ Test 2: Blocked executables');
const blockedAttachments = [
  { name: 'malware.exe', type: 'application/x-msdownload', data: Buffer.from('test').toString('base64') },
  { name: 'script.bat', type: 'application/x-msdos-program', data: Buffer.from('test').toString('base64') },
  { name: 'script.sh', type: 'application/x-sh', data: Buffer.from('test').toString('base64') }
];

const result2 = validateAttachments(blockedAttachments);
console.log(`   Result: ${!result2.isValid ? '✅ PASSED (Correctly blocked)' : '❌ FAILED (Should be blocked)'}`);
console.log(`   Errors found: ${result2.errors.length}`);
result2.errors.forEach(err => {
  console.log(`   - ${err.filename}: ${err.error}`);
});

// Test 3: Mixed valid and invalid
console.log('\n⚠️  Test 3: Mixed valid and invalid attachments');
const mixedAttachments = [
  { name: 'document.pdf', type: 'application/pdf', data: Buffer.from('test').toString('base64') },
  { name: 'malware.exe', type: 'application/x-msdownload', data: Buffer.from('test').toString('base64') },
  { name: 'photo.jpg', type: 'image/jpeg', data: Buffer.from('test').toString('base64') }
];

const result3 = validateAttachments(mixedAttachments);
console.log(`   Result: ${!result3.isValid ? '✅ PASSED (Correctly identified invalid)' : '❌ FAILED'}`);
console.log(`   Errors found: ${result3.errors.length}`);
result3.errors.forEach(err => {
  console.log(`   - ${err.filename}: ${err.error}`);
});

// Test 4: Invalid file extensions
console.log('\n❌ Test 4: Invalid file extensions');
const invalidExtensions = [
  { name: 'file.unknown', type: 'application/octet-stream', data: Buffer.from('test').toString('base64') },
  { name: 'file.xyz', type: 'application/octet-stream', data: Buffer.from('test').toString('base64') }
];

const result4 = validateAttachments(invalidExtensions);
console.log(`   Result: ${!result4.isValid ? '✅ PASSED (Correctly blocked)' : '❌ FAILED'}`);
console.log(`   Errors found: ${result4.errors.length}`);
result4.errors.forEach(err => {
  console.log(`   - ${err.filename}: ${err.error}`);
});

// Test 5: Allowed extensions list
console.log('\n📋 Test 5: Allowed extensions');
const allowed = getAllowedExtensions();
console.log(`   Found ${allowed.length} allowed extensions`);
console.log(`   Examples: ${allowed.slice(0, 5).join(', ')}, ...`);

// Test 6: Blocked extensions list
console.log('\n📋 Test 6: Blocked extensions');
const blocked = getBlockedExtensions();
console.log(`   Found ${blocked.length} blocked extensions`);
console.log(`   Examples: ${blocked.slice(0, 5).join(', ')}, ...`);

// Summary
console.log('\n' + '='.repeat(60));
console.log('📊 TEST SUMMARY');
console.log('='.repeat(60));

const allTests = [
  { name: 'Valid attachments', passed: result1.isValid },
  { name: 'Blocked executables', passed: !result2.isValid && result2.errors.length === 3 },
  { name: 'Mixed valid/invalid', passed: !result3.isValid && result3.errors.length === 1 },
  { name: 'Invalid extensions', passed: !result4.isValid && result4.errors.length === 2 },
  { name: 'Allowed extensions list', passed: allowed.length > 0 },
  { name: 'Blocked extensions list', passed: blocked.length > 0 }
];

const passed = allTests.filter(t => t.passed).length;
const total = allTests.length;

allTests.forEach(test => {
  console.log(`${test.passed ? '✅' : '❌'} ${test.name}: ${test.passed ? 'PASSED' : 'FAILED'}`);
});

console.log(`\n✅ Passed: ${passed}/${total}`);
console.log(`❌ Failed: ${total - passed}/${total}`);
console.log(`📈 Success Rate: ${((passed / total) * 100).toFixed(1)}%`);

if (passed === total) {
  console.log('\n🎉 All attachment validation tests passed!');
  console.log('✅ Attachment type validation is working correctly.');
} else {
  console.log('\n⚠️  Some tests failed.');
}

