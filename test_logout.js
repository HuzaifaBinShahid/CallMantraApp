// Test script to verify logout functionality
const Store = require('electron-store');
const store = new Store();

const LOGOUT_STATE_KEY = 'user_logged_out';

console.log('=== CallMantra Logout Test ===');
console.log('Current logout state:', store.get(LOGOUT_STATE_KEY));

// Test setting logout state
console.log('\n1. Setting logout state...');
store.set(LOGOUT_STATE_KEY, true);
console.log('Logout state set to:', store.get(LOGOUT_STATE_KEY));

// Test persistence by reading again
console.log('\n2. Verifying persistence...');
const persistedState = store.get(LOGOUT_STATE_KEY);
console.log('Persisted logout state:', persistedState);

// Test clearing logout state
console.log('\n3. Clearing logout state...');
store.delete(LOGOUT_STATE_KEY);
console.log('Logout state after clearing:', store.get(LOGOUT_STATE_KEY));

// Test setting and reading multiple times
console.log('\n4. Testing multiple set/read operations...');
for (let i = 1; i <= 3; i++) {
  store.set(LOGOUT_STATE_KEY, true);
  console.log(`Set ${i}:`, store.get(LOGOUT_STATE_KEY));
}

console.log('\n=== Test completed ===');
console.log('If you see the logout state being set and read correctly, the storage is working.');
console.log('\nNow test the app by:');
console.log('1. Starting the app');
console.log('2. Logging in');
console.log('3. Logging out (or using Force Logout from tray menu)');
console.log('4. Restarting the app');
console.log('5. Check console logs for:');
console.log('   - "Checking logout state on startup: true"');
console.log('   - "User was previously logged out, redirecting to login page"');
console.log('6. Verify you are redirected to login page (not dialer screen)'); 