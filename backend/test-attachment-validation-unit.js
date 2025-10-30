// Unit test for attachment validation service
const { 
  validateAttachment, 
  validateAttachments,
  getAllowedExtensions,
  getBlockedExtensions
} = require('./dist/services/attachmentValidation.service');

console.log('🧪 Attachment Validation Service Unit Tests');
console.log('='.repeat(60));

const testResults = [];

// Test 1: Valid PDF attachment
console.log('\n✅ Test 1: Valid PDF attachment');
const test1 = validateAttachment({
  name: 'document.pdf',
  type: 'application/pdf',
  data: Buffer.from('test content').toString('base64')
});
if (test1.isValid) {
  console.log('   ✅ PASSED');
  testResults.push(true);
} else {
  console.log('   ❌ FAILED:', test1.error);
  testResults.push(false);
}

// Test 2: Blocked executable
console.log('\n❌ Test 2: Blocked executable (.exe)');
const test2 = validateAttachment({
  name: 'malware.exe',
  type: 'application/x-msdownload',
  data: Buffer.from('test content').toString('base64')
});
if (!test2.isValid && test2.error?.includes('not allowed')) {
  console.log('   ✅ PASSED - Correctly blocked');
  testResults.push(true);
} else {
  console.log('   ❌ FAILED:', test2.error || 'Should have been blocked');
  testResults.push(false);
}

// Test 3: Blocked script
console.log('\n❌ Test 3: Blocked script (.bat)');
const test3 = validateAttachment({
  name: 'script.bat',
  type: 'application/x-msdos-program',
  data: Buffer.from('test content').toString('base64')
});
if (!test3.isValid && test3.error?.includes('not allowed')) {
  console.log('   ✅ PASSED - Correctly blocked');
  testResults.push(true);
} else {
  console.log('   ❌ FAILED:', test3.error || 'Should have been blocked');
  testResults.push(false);
}

// Test 4: Invalid file extension
console.log('\n❌ Test 4: Invalid file extension');
const test4 = validateAttachment({
  name: 'file.unknown',
  type: 'application/octet-stream',
  data: Buffer.from('test content').toString('base64')
});
if (!test4.isValid && test4.error?.includes('not allowed')) {
  console.log('   ✅ PASSED - Correctly blocked');
  testResults.push(true);
} else {
  console.log('   ❌ FAILED:', test4.error || 'Should have been blocked');
  testResults.push(false);
}

// Test 5: Missing extension
console.log('\n❌ Test 5: Missing file extension');
const test5 = validateAttachment({
  name: 'file',
  type: 'text/plain',
  data: Buffer.from('test content').toString('base64')
});
if (!test5.isValid && test5.error?.includes('extension')) {
  console.log('   ✅ PASSED - Correctly blocked');
  testResults.push(true);
} else {
  console.log('   ❌ FAILED:', test5.error || 'Should have been blocked');
  testResults.push(false);
}

// Test 6: Valid image
console.log('\n✅ Test 6: Valid image (.jpg)');
const test6 = validateAttachment({
  name: 'photo.jpg',
  type: 'image/jpeg',
  data: Buffer.from('test content').toString('base64')
});
if (test6.isValid) {
  console.log('   ✅ PASSED');
  testResults.push(true);
} else {
  console.log('   ❌ FAILED:', test6.error);
  testResults.push(false);
}

// Test 7: MIME type mismatch (should warn but allow)
console.log('\n⚠️  Test 7: MIME type mismatch');
const test7 = validateAttachment({
  name: 'document.pdf',
  type: 'image/jpeg', // Wrong MIME type
  data: Buffer.from('test content').toString('base64')
});
if (test7.isValid && test7.warnings && test7.warnings.length > 0) {
  console.log('   ✅ PASSED - Allowed with warning:', test7.warnings[0]);
  testResults.push(true);
} else {
  console.log('   ⚠️  Result:', test7);
  testResults.push(false);
}

// Test 8: Bulk validation
console.log('\n📦 Test 8: Bulk validation');
const test8 = validateAttachments([
  { name: 'doc1.pdf', type: 'application/pdf', data: Buffer.from('test').toString('base64') },
  { name: 'malware.exe', type: 'application/x-msdownload', data: Buffer.from('test').toString('base64') },
  { name: 'photo.jpg', type: 'image/jpeg', data: Buffer.from('test').toString('base64') }
]);
if (!test8.isValid && test8.errors.length === 1 && test8.errors[0].filename.includes('malware.exe')) {
  console.log('   ✅ PASSED - Correctly identified invalid attachment');
  testResults.push(true);
} else {
  console.log('   ❌ FAILED:', test8);
  testResults.push(false);
}

// Test 9: Get allowed extensions
console.log('\n📋 Test 9: Get allowed extensions');
const allowed = getAllowedExtensions();
if (allowed.length > 0 && allowed.includes('.pdf') && allowed.includes('.jpg')) {
  console.log(`   ✅ PASSED - Found ${allowed.length} allowed extensions`);
  testResults.push(true);
} else {
  console.log('   ❌ FAILED');
  testResults.push(false);
}

// Test 10: Get blocked extensions
console.log('\n📋 Test 10: Get blocked extensions');
const blocked = getBlockedExtensions();
if (blocked.length > 0 && blocked.includes('.exe') && blocked.includes('.bat')) {
  console.log(`   ✅ PASSED - Found ${blocked.length} blocked extensions`);
  testResults.push(true);
} else {
  console.log('   ❌ FAILED');
  testResults.push(false);
}

// Summary
console.log('\n' + '='.repeat(60));
console.log('📊 TEST SUMMARY');
console.log('='.repeat(60));

const passed = testResults.filter(r => r).length;
const total = testResults.length;

console.log(`✅ Passed: ${passed}/${total}`);
console.log(`❌ Failed: ${total - passed}/${total}`);
console.log(`📈 Success Rate: ${((passed / total) * 100).toFixed(1)}%`);

if (passed === total) {
  console.log('\n🎉 All tests passed!');
} else {
  console.log('\n⚠️  Some tests failed.');
}

