# How to Switch to Simple Test Version

## Current Status
- ✅ Current code backed up as: `renderer.js.backup_current` and `main.js.backup_current`
- ✅ Simple test version created as: `renderer.js.simple_test`

## To Test the Simple Version:

### Step 1: Backup Current Files
```powershell
# Already done! Files are backed up as:
# - renderer.js.backup_current
# - main.js.backup_current
```

### Step 2: Switch to Simple Version
```powershell
# Rename current complex version
Rename-Item renderer.js renderer.js.complex

# Rename simple test version to active
Rename-Item renderer.js.simple_test renderer.js
```

### Step 3: Test Notifications
1. Restart the Electron app
2. Check console for FCM startup logs
3. Get the token from console
4. Send that token to backend
5. Ask backend to send a test notification
6. Check if notification arrives

### Step 4: Switch Back to Complex Version (if needed)
```powershell
# Rename simple version back
Rename-Item renderer.js renderer.js.simple_test

# Rename complex version back to active
Rename-Item renderer.js.complex renderer.js
```

## Differences Between Versions

### Simple Version:
- ✅ Minimal retry logic (simple 5-second retries)
- ✅ No complex health checks
- ✅ No extensive debugging functions
- ✅ Basic token handling
- ✅ Simple notification handling
- ✅ Less code = less potential for bugs

### Complex Version (Current):
- ⚠️ Complex retry logic with exponential backoff
- ⚠️ Extensive health checks every 60 seconds
- ⚠️ Many debugging functions
- ⚠️ Token tracking and comparison
- ⚠️ More code = more potential for issues

## What to Test

1. **FCM Startup**: Does it start without errors?
2. **Token Generation**: Is token generated correctly?
3. **Token Dispatch**: Does web app receive token?
4. **Notification Receipt**: Do notifications arrive?
5. **Notification Display**: Are notifications shown correctly?

## If Simple Version Works Better

This suggests the complex version has bugs or over-complicates things. We can then:
1. Keep the simple version
2. Add back only the features that are actually needed
3. Remove unnecessary complexity

## If Simple Version Also Doesn't Work

This suggests the issue is:
1. Backend not sending to correct token
2. FCM configuration issue
3. Network/firewall blocking
4. Backend notification sending failing



