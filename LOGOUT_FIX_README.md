# CallMantra Logout Authentication Fix

## Problem Description
When users logged out from the CallMantra application, the logout state was not properly persisted. Upon app restart, users would see the welcome screen briefly, then be redirected to the dialer screen even though they had previously logged out.

## Root Cause
The Electron app was not clearing the web session data (cookies, localStorage, sessionStorage, etc.) when logout occurred. The authentication state was managed by the web application at `https://dialer.callmantra.co`, but the Electron app didn't properly clear this cached authentication data.

## Solution Implemented

### 1. Aggressive Session Clearing on Startup
- **Always clear session data on app startup** to ensure a clean state
- This prevents any cached authentication data from persisting across app restarts

### 2. Enhanced Logout State Tracking
- Added a persistent logout state flag using `electron-store`
- The flag is set when logout is detected and cleared when login is successful
- **Critical fix**: App now redirects to login page if logout state is detected

### 3. Multiple Logout Detection Mechanisms
- **Navigation Monitoring**: Detects when user is redirected to login pages (`/login`, `/signin`, `/auth`)
- **DOM Ready Monitoring**: Checks if current page is a login page when DOM is ready
- **Redirect Monitoring**: Detects when dialer URL redirects to login pages
- **Content Analysis**: Analyzes page content for login indicators (password fields, login forms, etc.)
- **Periodic Checking**: Checks every 5 seconds for login indicators on dialer pages
- **IPC Message Handling**: Handles explicit logout messages from the web application

### 4. Comprehensive Session Data Clearing
- Clears all types of web storage: cookies, localStorage, sessionStorage, IndexedDB, etc.
- Ensures no cached authentication data remains after logout

### 5. Manual Logout Option
- Added "Force Logout" option to tray menu for testing and debugging
- Allows manual triggering of logout state for testing purposes

## Files Modified

### main.js
- **Always clear session data on startup** (major change)
- Added comprehensive logout detection in multiple events
- Added periodic logout detection every 5 seconds
- Added redirect monitoring
- Added content analysis for login indicators
- Added manual logout option in tray menu
- **Critical fix**: App redirects to login page if logout state detected

### welcome.html
- Added message listener for logout/login events from web application

### test_logout.js (new)
- Test script to verify logout state storage is working correctly

## How It Works

### 1. **On App Startup**:
   - **Always clears all session data** for clean state
   - Checks logout state flag
   - **If logout state detected**: Redirects to login page (dialer URL)
   - **If no logout state**: Loads dialer URL after delay

### 2. **During Logout Detection**:
   - Multiple mechanisms detect logout events
   - Session data is cleared immediately
   - Logout state flag is set
   - App redirects to login page

### 3. **During Login**:
   - Login success is detected
   - Logout state flag is cleared

## Testing Instructions

### Automated Test
```bash
node test_logout.js
```

### Manual Testing
1. **Start the app**
2. **Log in** to the application
3. **Log out** from the application
4. **Restart the app**
5. **Verify** that you are redirected to the login page (not dialer screen)

### Manual Logout Testing
1. Right-click the tray icon
2. Select "Force Logout"
3. Verify the app redirects to login page
4. Restart the app
5. Verify you are redirected to login page

## Debugging

### Console Logs to Watch For
- `"App starting - clearing session data for clean state"`
- `"Session data cleared on startup"`
- `"User was previously logged out, redirecting to login page"`
- `"Logout detected via [method]"`
- `"Session data cleared - [reason]"`

### Common Issues
1. **Still redirecting to dialer**: Check if logout state flag is being set correctly
2. **Not detecting logout**: Check console logs for logout detection messages
3. **Session not clearing**: Verify session clearing callbacks are executing

## Key Improvements in This Version

1. **Always clear session on startup** - Most important fix
2. **Redirect to login page** if logout state detected
3. **Multiple detection mechanisms** for robust logout detection
4. **Content analysis** to detect login pages even if URL doesn't change
5. **Manual logout option** for testing
6. **Comprehensive logging** for debugging

## Expected Behavior After Fix

- **After logout**: App redirects to login page
- **After restart**: App redirects to login page (no automatic login to dialer)
- **After login**: App loads dialer normally
- **After successful login restart**: App loads dialer normally 