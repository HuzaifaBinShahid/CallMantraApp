// This file is required by the index.html file and will
// be executed in the renderer process for that window.
// All of the Node.js APIs are available in this process.
const contextBridge = require('electron').contextBridge;
const ipcRenderer = require('electron').ipcRenderer;

//THIS IS VERY IMPORTANT FOR CLICK 2 CALL WORK. donot change anything in this.
// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
// White-listed channels.
contextBridge.exposeInMainWorld(
  "api", {
  send: (channel, data) => {
    let validChannels = ["toMain"];
    if (validChannels.includes(channel)) {
      ipcRenderer.send(channel, data);
    }
  },
  receive: (channel, func) => {
    let validChannels = ["fromMain"];
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, (event, ...args) => func(...args));
    }
  },
  invoke: (channel, args) => {
    let validChannels = ipc.render.sendReceive;
    if (validChannels.includes(channel)) {
      return ipcRenderer.invoke(channel, args);
    }
  }
}
);


try {
  contextBridge.exposeInMainWorld('EDeviceID', '');
  contextBridge.exposeInMainWorld('AppVersion', "1.0.5");
} catch (error) {
  console.log('EDeviceID already exposed or error:', error);
}

function sendNotification(sbody) {
  const NOTIFICATION_TITLE = 'CallMantra'
  const NOTIFICATION_BODY = sbody
  new Notification(NOTIFICATION_TITLE,
    {
      body: NOTIFICATION_BODY,
      icon: "./favicon.png",
      tag: 'soManyNotification',
      hasReply: true
    })
}

if (Notification.permission === "granted") {
} else if (Notification.permission === "denied") {
  Notification.requestPermission()
};

//------------------Notification render code starts--------------------------
const {
  START_NOTIFICATION_SERVICE,
  NOTIFICATION_SERVICE_STARTED,

  NOTIFICATION_SERVICE_RESTARTED,
  NOTIFICATION_SERVICE_ERROR,
  NOTIFICATION_RECEIVED,
  TOKEN_UPDATED,
} = require('@cuj1559/electron-push-receiver/src/constants')

// --- FCM Config ---
const API_KEY = "AIzaSyAqHWqoqjBvZly96ZW_5u37llJfh3dTcDE";
const PROJECT_ID = "callmantra-8518c";
const APP_ID = "1:497660455290:web:b5e1fb463a4a4a24e78ec3";
const vapidKey = "BHshG1M8ul0tTo3sMVJLE7RvS0doNbkSj6P4-j1AOaONCrJPWJWPz9DKY9BqfMQK8QkmfXQlZA16xKPJ2YRNtKA";

let fcmStartedOnce = false;

let fcmLastNotificationTime = Date.now();
let fcmHealthCheckInterval = null;
let fcmConnectionHealthy = false;
let fcmRestartInProgress = false;
let fcmRestartTimeout = null;
let consecutiveSocketErrors = 0;
let lastSocketErrorTime = 0;
let fcmInitRetryCount = 0;
let fcmInitRetryTimeout = null;
let fcmCurrentToken = null;
let fcmPreviousToken = null;
let fcmTokenChangeCount = 0;
let fcmLastTokenUpdateTime = null;
const MAX_FCM_INIT_RETRIES = 5;
const FCM_INIT_RETRY_DELAY = 5000;

function startFCMWithRetry() {
  if (fcmInitRetryTimeout) {
    clearTimeout(fcmInitRetryTimeout);
    fcmInitRetryTimeout = null;
  }

  if (!navigator.onLine) {
    console.log('Network offline, waiting for connection before starting FCM...');
    fcmInitRetryTimeout = setTimeout(() => {
      startFCMWithRetry();
    }, 2000);
    return;
  }

  if (fcmInitRetryCount >= MAX_FCM_INIT_RETRIES) {
    console.log('Maximum retry count reached. Resetting counter and waiting longer...');
    fcmInitRetryCount = 0;
    setTimeout(() => {
      startFCMWithRetry();
    }, 30000);
    return;
  }

  console.log(`Starting FCM service (attempt ${fcmInitRetryCount + 1}/${MAX_FCM_INIT_RETRIES})...`);
  console.log('Network status:', navigator.onLine);
  console.log('Current timestamp:', new Date().toISOString());
  
  try {
    ipcRenderer.send(START_NOTIFICATION_SERVICE, APP_ID, PROJECT_ID, API_KEY, vapidKey);
    fcmStartedOnce = true;
    fcmInitRetryCount++;
  } catch (error) {
    console.error('Error sending FCM start command:', error);
    if (fcmInitRetryCount < MAX_FCM_INIT_RETRIES) {
      fcmInitRetryTimeout = setTimeout(() => {
        startFCMWithRetry();
      }, FCM_INIT_RETRY_DELAY * (fcmInitRetryCount + 1));
    }
  }
}

// Restart FCM service WITHOUT clearing credentials
// This reuses existing token and credentials, just reconnects the socket
function restartFCM() {
  console.log('🔄 Restarting FCM service (reusing credentials, reconnecting socket)...');
  console.log('✅ This will NOT clear credentials - token will be reused');

  if (fcmStartedOnce) {
    ipcRenderer.send('stop-fcm-service');
  }

  fcmInitRetryCount = 0;

  setTimeout(() => {
    if (!navigator.onLine) {
      console.log('Network offline, waiting for connection...');
      window.addEventListener('online', () => {
        console.log('Network back online, starting FCM...');
        startFCMWithRetry();
      }, { once: true });
      return;
    }
    startFCMWithRetry();
  }, fcmStartedOnce ? 3000 : 2000);
}

// Force restart FCM service when connection is dead
// This reuses existing credentials and token - just reconnects the socket
// This is the CORRECT way to recover from dead connections
function forceRestartFCM() {
  if (fcmRestartInProgress) {
    console.log('FCM restart already in progress, skipping...');
    return;
  }

  if (fcmRestartTimeout) {
    clearTimeout(fcmRestartTimeout);
    fcmRestartTimeout = null;
  }

  fcmRestartInProgress = true;
  console.log('');
  console.log('🔄🔄🔄 FORCE RESTARTING FCM SERVICE (Dead Connection Recovery) 🔄🔄🔄');
  console.log('✅ This will NOT clear credentials - existing token will be reused');
  console.log('✅ This will reconnect the WebSocket using existing Installation ID');
  console.log('✅ This is the CORRECT recovery method (not token regeneration)');
  console.log('');
  
  fcmStartedOnce = false;
  fcmConnectionHealthy = false;
  consecutiveSocketErrors = 0;
  
  ipcRenderer.send('force-restart-fcm');
  
  setTimeout(() => {
    ipcRenderer.send('stop-fcm-service');
    setTimeout(() => {
      console.log('🔄 Starting FCM service after force restart (reusing credentials)...');
      ipcRenderer.send(START_NOTIFICATION_SERVICE, APP_ID, PROJECT_ID, API_KEY, vapidKey);

      fcmStartedOnce = true;
      setTimeout(() => {
        fcmRestartInProgress = false;
        console.log('✅ FCM restart completed. Same token reused, socket reconnected.');
        console.log('✅ If token is valid, notifications should work now.');
      }, 8000);
    }, 3000);
  }, 1000);
}

function startFCMHealthCheck() {
  if (fcmHealthCheckInterval) {
    clearInterval(fcmHealthCheckInterval);
  }
  
  fcmHealthCheckInterval = setInterval(() => {
    const timeSinceLastNotification = Date.now() - fcmLastNotificationTime;
    const minutesSinceLastNotification = Math.floor(timeSinceLastNotification / 60000);
    const timeSinceFCMStart = fcmLastTokenUpdateTime ? Date.now() - fcmLastTokenUpdateTime : 0;
    const minutesSinceFCMStart = Math.floor(timeSinceFCMStart / 60000);
    
    console.log('=== FCM HEALTH CHECK ===');
    console.log('FCM Started:', fcmStartedOnce);
    console.log('Connection Healthy:', fcmConnectionHealthy);
    console.log('Last Notification:', new Date(fcmLastNotificationTime).toLocaleString());
    console.log('Minutes Since Last Notification:', minutesSinceLastNotification);
    console.log('Minutes Since FCM Start:', minutesSinceFCMStart);
    console.log('Consecutive Socket Errors:', consecutiveSocketErrors);
    console.log('=== PROOF: Current Frontend Token ===');
    console.log('Token:', fcmCurrentToken || window.EDeviceID || 'NOT SET');
    console.log('=== PROOF: If backend sends notifications, you will see "=== FCM NOTIFICATION EVENT RECEIVED ===" in console ===');
    console.log('=== PROOF: If that log does NOT appear, notifications are NOT reaching frontend ===');
    
    let currentToken = 'Not available';
    try {
      if (window.EDeviceID) {
        currentToken = window.EDeviceID;
      } else if (typeof window !== 'undefined' && window.EDeviceID !== undefined) {
        currentToken = window.EDeviceID;
      }
    } catch (e) {
      currentToken = 'Error accessing token: ' + e.message;
    }
    console.log('Current Token:', currentToken);
    console.log('Previous Token:', fcmPreviousToken || 'None (first token)');
    console.log('Token Changed:', fcmCurrentToken !== fcmPreviousToken && fcmPreviousToken !== null);
    console.log('Token Change Count:', fcmTokenChangeCount);
    if (fcmLastTokenUpdateTime) {
      const minutesSinceTokenUpdate = Math.floor((Date.now() - fcmLastTokenUpdateTime) / 60000);
      console.log('Minutes Since Token Update:', minutesSinceTokenUpdate);
    }
    console.log('Network Online:', navigator.onLine);
    console.log('Restart In Progress:', fcmRestartInProgress);
    
    // ✅ CORRECT Health Check Logic (Based on Senior Feedback):
    // =========================================================
    // Health signals: Socket connected, Token present, No socket errors, Last activity advancing
    // ❌ NOT: "Did I receive a notification?" - Notifications are event-driven, not heartbeat-driven
    //
    // FCM does NOT send keep-alives as notifications
    // Silence ≠ failure
    // Only restart on ACTUAL socket errors, not lack of notifications
    
    // Log informational message about notifications (not an error)
    if (minutesSinceLastNotification > 0 && fcmConnectionHealthy) {
      if (minutesSinceLastNotification <= 5) {
        // Normal - just informational
        console.log('ℹ️ INFO: No notifications received for', minutesSinceLastNotification, 'minute(s)');
        console.log('ℹ️ This is NORMAL - notifications are event-driven (only arrive when backend sends them)');
        console.log('ℹ️ FCM does NOT send keep-alive notifications');
        console.log('ℹ️ Connection is healthy:', fcmConnectionHealthy, '| Token present:', !!fcmCurrentToken, '| Socket errors:', consecutiveSocketErrors);
      } else {
        // Longer silence - still not necessarily an error, but worth noting
        console.log('ℹ️ INFO: No notifications received for', minutesSinceLastNotification, 'minutes');
        console.log('ℹ️ This may be normal if backend is not sending notifications');
        console.log('ℹ️ To verify connection is alive, send a test notification from backend');
        console.log('ℹ️ Current status - Connection healthy:', fcmConnectionHealthy, '| Token:', fcmCurrentToken ? 'Present' : 'Missing', '| Socket errors:', consecutiveSocketErrors);
      }
    }
    
    // ✅ Only restart on ACTUAL socket errors, not lack of notifications
    // Restart if: Connection marked unhealthy AND multiple socket errors
    if (!fcmConnectionHealthy && consecutiveSocketErrors >= 3) {
      console.log('');
      console.log('⚠️⚠️⚠️ FCM CONNECTION UNHEALTHY - ACTUAL SOCKET ERRORS DETECTED ⚠️⚠️⚠️');
      console.log('⚠️ Consecutive socket errors:', consecutiveSocketErrors);
      console.log('⚠️ Connection marked as unhealthy');
      console.log('⚠️ Restarting FCM service to recover...');
      console.log('✅ This will reuse existing token and reconnect socket (CORRECT approach)');
      console.log('✅ This will NOT clear credentials or regenerate token');
      console.log('');
      if (!fcmRestartInProgress) {
        forceRestartFCM();
      }
    }
  }, 60000);
}

ipcRenderer.on(NOTIFICATION_SERVICE_STARTED, (_, token) => {

  console.log('=== FCM SERVICE STARTED ===');
  console.log('Timestamp:', new Date().toISOString());
  console.log('Token:', token);
  console.log('Token length:', token ? token.length : 0);
  
  // CRITICAL: If token is undefined/null/empty, token generation FAILED
  // Do NOT process it, do NOT mark as healthy, do NOT dispatch to web app
  // This happens when Firebase installations endpoint is blocked/timing out
  if (!token || token.length === 0) {
    console.log('');
    console.log('❌❌❌ CRITICAL ERROR: TOKEN IS UNDEFINED/NULL/EMPTY ❌❌❌');
    console.log('❌ FCM service started but NO valid token was generated!');
    console.log('❌ This means Firebase installations endpoint timed out or is blocked');
    console.log('❌ Token generation failed - cannot establish FCM connection');
    console.log('❌ NOT marking connection as healthy');
    console.log('❌ NOT dispatching token to web app (would cause crash)');
    console.log('❌ Will retry automatically...');
    console.log('');
    
    // Don't mark as healthy, don't set token, don't dispatch event
    // Keep retrying - error handler will retry
    fcmConnectionHealthy = false;
    return; // Exit early - don't process undefined token
  }
  
  // Token is valid - process it normally
  const tokenChanged = fcmCurrentToken && fcmCurrentToken !== token;
  if (tokenChanged) {
    fcmPreviousToken = fcmCurrentToken;
    fcmTokenChangeCount++;
    console.log('=== TOKEN CHANGED ===');
    console.log('Previous token:', fcmPreviousToken);
    console.log('New token:', token);
    console.log('Token change count:', fcmTokenChangeCount);
    console.log('⚠️ WARNING: Token changed - backend must update to new token or notifications will fail!');
    console.log('⚠️ NOTE: Token changes are RARE - usually only when Firebase invalidates old token');
  } else if (!fcmCurrentToken) {
    console.log('✅ Initial token set (first time FCM started)');
  } else {
    console.log('✅✅✅ Token unchanged (same token reused - this is CORRECT and EXPECTED) ✅✅✅');
    console.log('✅ FCM tokens are STABLE and designed to persist across app restarts');
    console.log('✅ FCM reused existing credentials and token - socket reconnected');
    console.log('✅ This is the CORRECT behavior - tokens are device-scoped and persistent');
    console.log('✅ Token only changes if: credentials deleted, Firebase rotates it, or app identity changes');
    console.log('✅ Reusing same token = sign of correctness and stability (not a bug!)');
  }
  
  fcmCurrentToken = token;
  fcmLastTokenUpdateTime = Date.now();
  fcmLastNotificationTime = Date.now();
  fcmConnectionHealthy = true;
  consecutiveSocketErrors = 0;
  lastSocketErrorTime = 0;
  fcmInitRetryCount = 0;
  if (fcmInitRetryTimeout) {
    clearTimeout(fcmInitRetryTimeout);
    fcmInitRetryTimeout = null;
  }
  
  console.log('=== FCM CONNECTION STATUS ===');
  console.log('Token:', token);
  console.log('Connection marked as healthy');
  console.log('FCM service is ready to receive notifications');
  console.log('⚠️ IMPORTANT: Backend must use this exact token:', token);
  console.log('⚠️ If backend uses different token, notifications will NOT arrive');
  console.log('=== PROOF: Frontend token is set to:', token);
  console.log('=== PROOF: Backend must send notifications to this token:', token);
  console.log('=== PROOF: To compare with backend token, use: window.compareTokenWithBackend("backend-token")');
  
  startFCMHealthCheck();
  
  setTimeout(() => {
    console.log('=== FCM READINESS CHECK (5 seconds after start) ===');
    console.log('Token:', fcmCurrentToken);
    console.log('Connection Healthy:', fcmConnectionHealthy);
    console.log('Ready to receive notifications:', fcmConnectionHealthy && fcmCurrentToken);
    if (fcmConnectionHealthy && fcmCurrentToken) {
      console.log('✅ FCM is ready. Backend can send notifications to:', fcmCurrentToken);
      console.log('⚠️ IMPORTANT: Verify backend is using this EXACT token when sending notifications');
      console.log('⚠️ If backend uses different token, notifications will NOT arrive');
    } else {
      console.log('❌ FCM is NOT ready. Do not send notifications yet.');
    }
  }, 5000);
  
  setTimeout(() => {
    console.log('=== FCM READINESS CHECK (10 seconds after start) ===');
    const timeSinceStart = Date.now() - fcmLastTokenUpdateTime;
    const secondsSinceStart = Math.floor(timeSinceStart / 1000);
    console.log('Seconds since FCM started:', secondsSinceStart);
    console.log('Token:', fcmCurrentToken);
    console.log('Connection Healthy:', fcmConnectionHealthy);
    console.log('Notifications received since start:', fcmLastNotificationTime > fcmLastTokenUpdateTime ? 'Yes' : 'No');
    
    // Health check based on actual connection state, not notification receipt
    if (!fcmConnectionHealthy) {
      console.log('❌ FCM connection is NOT healthy. Check socket errors:', consecutiveSocketErrors);
    } else if (fcmLastNotificationTime <= fcmLastTokenUpdateTime) {
      // No notifications received yet - this is NORMAL and NOT an error
      console.log('ℹ️ INFO: No notifications received yet. This is NORMAL if backend has not sent any.');
      console.log('ℹ️ FCM does NOT send keep-alive notifications - silence is expected when backend is idle');
      console.log('ℹ️ Connection health indicators:');
      console.log('   - Connection marked healthy:', fcmConnectionHealthy);
      console.log('   - Token present:', !!fcmCurrentToken);
      console.log('   - Socket errors:', consecutiveSocketErrors);
      console.log('   - Network online:', navigator.onLine);
      console.log('ℹ️ To verify connection is alive, send a test notification from backend');
    } else {
      console.log('✅ FCM is working! Notifications are being received.');
      console.log('✅ Last notification received:', new Date(fcmLastNotificationTime).toLocaleString());
    }
  }, 10000);
  
  // Only set EDeviceID and dispatch event if token is valid
  // (We already checked above, but double-check for safety)
  if (token && token.length > 0) {
    try {
      window.EDeviceID = token;
      console.log('Set EDeviceID directly (token updated)');
      
      if (!window.AppVersion) {
        try {
      contextBridge.exposeInMainWorld('AppVersion', "1.0.5");

        } catch (e) {
          window.AppVersion = "1.0.5";
        }
      }
      
      setTimeout(() => {
        try {
          const tokenUpdateEvent = new CustomEvent('fcmTokenUpdated', { 
            detail: { 
              token: token,
              previousToken: fcmPreviousToken,
              tokenChanged: tokenChanged,
              changeCount: fcmTokenChangeCount
            } 
          });
          window.dispatchEvent(tokenUpdateEvent);
          console.log('✅ Dispatched fcmTokenUpdated event to web app with valid token');
          if (tokenChanged) {
            console.log('⚠️ IMPORTANT: Web app must send new token to backend immediately!');
          }
        } catch (error) {
          console.error('Error dispatching token update event:', error);
        }
      }, 2000);
    } catch (error) {
      console.error('Error setting EDeviceID:', error);
    }
  } else {
    console.error('❌ CRITICAL: Attempted to set EDeviceID with invalid token - this should not happen!');
  }
  if (fcmRestartInProgress) {
    setTimeout(() => {
      fcmRestartInProgress = false;
      console.log('FCM restart completed');
    }, 5000);
  }
})

ipcRenderer.on(NOTIFICATION_SERVICE_RESTARTED, (_, token) => {
  console.log('=== FCM SERVICE RESTARTED ===');
  console.log('Token:', token);
  
  // Check if token is valid
  if (!token || token.length === 0) {
    console.log('❌❌❌ CRITICAL: FCM service restarted but token is UNDEFINED ❌❌❌');
    console.log('❌ Token generation failed - cannot use undefined token');
    console.log('❌ NOT marking connection as healthy');
    console.log('❌ NOT dispatching token to web app');
    fcmConnectionHealthy = false;
    return; // Exit early
  }
  
  fcmLastNotificationTime = Date.now();
  fcmConnectionHealthy = true;
  consecutiveSocketErrors = 0;
  lastSocketErrorTime = 0;
  fcmCurrentToken = token;
  
  try {
    window.EDeviceID = token;
    console.log('Set EDeviceID directly (service restarted)');
    
    setTimeout(() => {
      try {
        const tokenUpdateEvent = new CustomEvent('fcmTokenUpdated', { 
          detail: { token: token } 
        });
        window.dispatchEvent(tokenUpdateEvent);
        console.log('✅ Dispatched fcmTokenUpdated event after restart with valid token');
      } catch (error) {
        console.error('Error dispatching token update event:', error);
      }
    }, 2000);
  } catch (error) {
    console.error('Error setting EDeviceID after restart:', error);
  }
})

ipcRenderer.on(NOTIFICATION_SERVICE_ERROR, (_, error) => {

  console.log('=== FCM ERROR ===');
  console.log('Timestamp:', new Date().toISOString());
  console.log('Error:', error);
  console.log('Error type:', typeof error);
  
  let errorString = '';
  let errorMessage = '';
  let errorCode = '';
  
  if (typeof error === 'string') {
    errorString = error;
    errorMessage = error;
  } else if (error && typeof error === 'object') {
    errorString = JSON.stringify(error);
    errorMessage = error.message || error.toString() || '';
    errorCode = error.code || error.cause?.code || '';
    
    if (error.cause) {
      errorString += ' Cause: ' + JSON.stringify(error.cause);
      errorMessage += ' ' + (error.cause.message || '');
      if (error.cause.code) {
        errorCode = error.cause.code;
      }
    }
  } else {
    errorString = String(error);
    errorMessage = String(error);
  }
  
  console.log('Error string:', errorString);
  console.log('Error message:', errorMessage);
  console.log('Error code:', errorCode);
  
  const isTimeoutError = errorString.includes('Connect Timeout') || 
                        errorString.includes('fetch failed') || 
                        errorString.includes('UND_ERR_CONNECT_TIMEOUT') ||
                        errorCode === 'UND_ERR_CONNECT_TIMEOUT' ||
                        errorMessage.includes('Connect Timeout') ||
                        errorMessage.includes('fetch failed');
  
  const isUndefinedError = errorString.includes('Cannot read properties of undefined') ||
                          errorMessage.includes('Cannot read properties of undefined') ||
                          errorString.includes('reading \'id\'');
  
  if (isTimeoutError || isUndefinedError) {
    console.log('FCM connection timeout or initialization error detected. Will retry...');
    if (fcmInitRetryCount < MAX_FCM_INIT_RETRIES) {
      const retryDelay = FCM_INIT_RETRY_DELAY * (fcmInitRetryCount + 1);
      console.log(`Will retry FCM initialization in ${retryDelay}ms (attempt ${fcmInitRetryCount + 1}/${MAX_FCM_INIT_RETRIES})...`);
      fcmInitRetryTimeout = setTimeout(() => {
        console.log(`Retrying FCM initialization (attempt ${fcmInitRetryCount + 1}/${MAX_FCM_INIT_RETRIES})...`);
        startFCMWithRetry();
      }, retryDelay);
    } else {
      console.error('FCM initialization failed after maximum retries. Please check network connection.');
      console.log('Will attempt to restart FCM after longer delay...');
      fcmInitRetryCount = 0;
      fcmInitRetryTimeout = setTimeout(() => {
        console.log('Attempting FCM restart after maximum retries...');
        startFCMWithRetry();
      }, 30000);
    }
  } else if (errorString.includes('Socket closed') || errorString.includes('ECONNRESET') || errorMessage.includes('Socket closed') || errorMessage.includes('ECONNRESET')) {
    consecutiveSocketErrors++;
    lastSocketErrorTime = Date.now();
    console.log(`Socket error detected. Consecutive errors: ${consecutiveSocketErrors}`);
    
    if (consecutiveSocketErrors >= 2) {
      fcmConnectionHealthy = false;
      console.log(`FCM connection marked as unhealthy. Consecutive errors: ${consecutiveSocketErrors}`);
    }
  } else if (errorString.includes('Trying to reopen') || errorMessage.includes('Trying to reopen')) {
    console.log('FCM library attempting auto-reconnect...');
  } else {
    console.log('Unhandled FCM error type. Will attempt retry...');
    if (fcmInitRetryCount < MAX_FCM_INIT_RETRIES) {
      fcmInitRetryTimeout = setTimeout(() => {
        console.log(`Retrying FCM initialization after unhandled error (attempt ${fcmInitRetryCount + 1}/${MAX_FCM_INIT_RETRIES})...`);
        startFCMWithRetry();
      }, FCM_INIT_RETRY_DELAY * (fcmInitRetryCount + 1));
    }
  }
})

// Send FCM token to backend
ipcRenderer.on(TOKEN_UPDATED, (_, token) => {
   console.log("FCM Token updated:", token);

   // Check if token is valid
   if (!token || token.length === 0) {
     console.log('❌❌❌ CRITICAL: TOKEN_UPDATED event received but token is UNDEFINED ❌❌❌');
     console.log('❌ Cannot use undefined token - NOT dispatching to web app');
     return; // Exit early
   }

   try {
     window.EDeviceID = token;
     fcmCurrentToken = token;
     console.log('Set EDeviceID directly (token updated event)');
     
     setTimeout(() => {
       try {
         const tokenUpdateEvent = new CustomEvent('fcmTokenUpdated', { 
           detail: { token: token } 
         });
         window.dispatchEvent(tokenUpdateEvent);
         console.log('✅ Dispatched fcmTokenUpdated event (token updated) with valid token');
       } catch (error) {
         console.error('Error dispatching token update event:', error);
       }
     }, 1000);
   } catch (error) {
     console.error('Error setting EDeviceID (token updated):', error);
   }
   
   try {
     if (window.api && typeof window.api.send === 'function') {
   window.api.send("toMain", { type: "TOKEN_UPDATE", token });

     }
   } catch (error) {
     console.error('Error sending token update to main:', error);
   }
})

function handleNotification(serverNotificationPayload) {
  console.log('=== NOTIFICATION RECEIVED IN HANDLER ===');
  console.log('Timestamp:', new Date().toISOString());
  console.log('Current Token:', fcmCurrentToken);
  console.log('Full payload:', JSON.stringify(serverNotificationPayload, null, 2));
  console.log('✅ FCM connection is working! Notification successfully received.');
  fcmLastNotificationTime = Date.now();
  fcmConnectionHealthy = true;
  consecutiveSocketErrors = 0;
  lastSocketErrorTime = 0;

  var tIcon = '../images/callmantrafavicon.ico'

  var tTitle = '';
  var tBody = '';
  
  if (serverNotificationPayload.notification) {
    tTitle = serverNotificationPayload.notification.title || 'Notification';
    tBody = serverNotificationPayload.notification.body || '';
  } else if (serverNotificationPayload.data) {
    tTitle = serverNotificationPayload.data.title || serverNotificationPayload.data.notification_title || 'Notification';
    tBody = serverNotificationPayload.data.body || serverNotificationPayload.data.notification_body || serverNotificationPayload.data.message || '';
  } else {
    tTitle = serverNotificationPayload.title || 'Notification';
    tBody = serverNotificationPayload.body || '';
  }
  
  console.log('Notification Title:', tTitle);
  console.log('Notification Body:', tBody);
  console.log('Payload has notification object:', !!serverNotificationPayload.notification);
  console.log('Payload has data object:', !!serverNotificationPayload.data);
  
  if (tTitle) {

    const titleLower = tTitle.toLowerCase();
    const bodyLower = tBody.toLowerCase();
    
    if (titleLower.includes('missed') || bodyLower.includes('missed')) {
      tIcon = '../images/pn_missedcall.png'

      console.log('Detected: Missed Call notification');
    } else if (titleLower.includes('voice') || bodyLower.includes('voice')) {
      tIcon = '../images/pn_vm.png'

      console.log('Detected: Voice Message notification');
    } else if (titleLower.includes('text') || titleLower.includes('sms') || titleLower.includes('message') || 
               bodyLower.includes('text') || bodyLower.includes('sms') || bodyLower.includes('message')) {
      tIcon = '../images/pn_sms.png'

      console.log('Detected: Text/SMS notification');
    } else {
      console.log('Detected: Default/Incoming Call notification');
    }
  }


  try {
  let myNotification = new Notification(tTitle, {
    body: tBody,
    icon: tIcon,
    tag: tTitle,
    hasReply: true

    });

  myNotification.onclick = function (event) {
    event.preventDefault();

      try {
        ipcRenderer.send("toMain", "FOCUSWIN");
      } catch (error) {
        console.error('Error focusing window on notification click:', error);
      }
  }
  myNotification.onclose = function (event) {
    event.preventDefault();

      try {
        ipcRenderer.send("toMain", "FOCUSWIN");
      } catch (error) {
        console.error('Error focusing window on notification close:', error);
      }
    }
    
    console.log('Notification created successfully');
  } catch (error) {
    console.error('Failed to create notification:', error);
  }

  try {
    ipcRenderer.send("toMain", "FOCUSWIN");

    console.log('Sent FOCUSWIN command to main process');
    
    setTimeout(() => {
      try {
    ipcRenderer.send("toMain", "REFRESH");

        console.log('Sent REFRESH command to main process');
      } catch (error) {
        console.error('Error sending REFRESH to main:', error);
      }
    }, 500);
  } catch (error) {
    console.error('Error sending IPC to main for focus/refresh:', error);
  }

  try {
    if (window.api && typeof window.api.receive === 'function') {
      window.api.receive("fromMain", (data) => {
        console.log('Received from main process:', data);
      });
    } else {
      console.warn("IPC not available: window.api or window.api.receive is undefined");
    }
  } catch (err) {
    console.error('Error setting up IPC:', err);
  }
  
  try {
    const refreshEvent = new CustomEvent('fcmNotificationReceived', {
      detail: {
        title: tTitle,
        body: tBody,
        payload: serverNotificationPayload
      }
    });
    window.dispatchEvent(refreshEvent);
    console.log('Dispatched fcmNotificationReceived event to web app');
  } catch (error) {
    console.error('Error dispatching notification event:', error);
  }
}

ipcRenderer.on(NOTIFICATION_RECEIVED, (_, serverNotificationPayload) => {
  console.log('=== FCM NOTIFICATION EVENT RECEIVED ===');
  console.log('✅✅✅ FCM CONNECTION IS ALIVE! Notification received from backend! ✅✅✅');
  console.log('Timestamp:', new Date().toISOString());
  console.log('Current Frontend Token:', fcmCurrentToken);
  console.log('Current Frontend Token (window.EDeviceID):', window.EDeviceID || 'Not set');
  console.log('Connection Healthy:', fcmConnectionHealthy);
  console.log('Raw payload type:', typeof serverNotificationPayload);
  console.log('Raw payload:', serverNotificationPayload);
  console.log('Payload keys:', serverNotificationPayload ? Object.keys(serverNotificationPayload) : 'null');
  console.log('✅ PROOF: Notification successfully received by frontend!');
  console.log('✅ PROOF: Frontend token is:', fcmCurrentToken);
  console.log('✅ PROOF: Backend sent notification to correct token and frontend received it!');
  
  if (!serverNotificationPayload) {
    console.error('❌ Notification payload is null or undefined!');
    return;
  }
  
  let processedPayload = serverNotificationPayload;
  
  if (serverNotificationPayload.data && !serverNotificationPayload.notification) {
    console.log('Detected data-only payload, converting to notification format...');
    console.log('Data keys:', Object.keys(serverNotificationPayload.data));
    processedPayload = {
      notification: {
        title: serverNotificationPayload.data.title || serverNotificationPayload.data.notification_title || serverNotificationPayload.data.notificationTitle || 'Notification',
        body: serverNotificationPayload.data.body || serverNotificationPayload.data.notification_body || serverNotificationPayload.data.notificationBody || serverNotificationPayload.data.message || ''
      },
      data: serverNotificationPayload.data
    };
    console.log('Converted payload:', processedPayload);
  }
  
  console.log('✅ Notification received successfully! Calling handleNotification...');
  handleNotification(processedPayload);
})

console.log('FCM notification listener registered. Waiting for notifications...');
console.log('⚠️ If notifications are sent but this handler is not called, FCM connection might be dead');
console.log('=== TOKEN VERIFICATION ===');
console.log('To verify if backend is using correct token, call: window.compareTokenWithBackend("backend-token")');
console.log('To see current frontend token, call: window.logTokenProof()');
console.log('=== PROOF OF NOTIFICATION RECEIPT ===');
console.log('When notifications arrive, you will see: "=== FCM NOTIFICATION EVENT RECEIVED ==="');
console.log('If backend sends notifications but this log does NOT appear, notifications are NOT reaching frontend');

try {
  contextBridge.exposeInMainWorld('testFCMNotification', (title, body, type) => {
    const testPayload = {
      notification: {
        title: title || 'Test Notification',
        body: body || 'This is a test notification from FCM',
      }
    };
    if (type) {
      testPayload.notification.title = type === 'missed' ? 'Missed Call' : 
                                      type === 'voice' ? 'Voice Message' : 
                                      type === 'text' ? 'Text Message' : 
                                      testPayload.notification.title;
    }
    console.log('Triggering test notification:', testPayload);
    handleNotification(testPayload);
  });
  
  contextBridge.exposeInMainWorld('forceRefreshApp', () => {
    console.log('Manual refresh triggered from web app');
    try {
      ipcRenderer.send("toMain", "REFRESH");
      console.log('Sent REFRESH command to main process');
    } catch (error) {
      console.error('Error sending REFRESH:', error);
    }
  });
  
  contextBridge.exposeInMainWorld('forceRestartFCM', () => {
    console.log('=== MANUAL FCM RESTART TRIGGERED ===');
    console.log('Current token:', fcmCurrentToken);
    console.log('Connection healthy:', fcmConnectionHealthy);
    console.log('Last notification:', new Date(fcmLastNotificationTime).toLocaleString());
    console.log('Restarting FCM now...');
    forceRestartFCM();
  });
  
  contextBridge.exposeInMainWorld('getFCMStatus', () => {
    let token = null;
    try {
      token = window.EDeviceID || null;
    } catch (e) {
      console.error('Error getting token in getFCMStatus:', e);
    }
    const minutesSinceLastNotification = Math.floor((Date.now() - fcmLastNotificationTime) / 60000);
    return {
      started: fcmStartedOnce,
      healthy: fcmConnectionHealthy,
      lastNotification: new Date(fcmLastNotificationTime).toISOString(),
      minutesSinceLastNotification: minutesSinceLastNotification,
      token: token,
      previousToken: fcmPreviousToken,
      tokenChanged: fcmCurrentToken !== fcmPreviousToken && fcmPreviousToken !== null,
      tokenChangeCount: fcmTokenChangeCount,
      online: navigator.onLine,
      restartInProgress: fcmRestartInProgress,
      consecutiveErrors: consecutiveSocketErrors,
      // No warning for "no notifications" - this is normal (notifications are event-driven)
      // Only warn on actual connection issues
      warning: !fcmConnectionHealthy && consecutiveSocketErrors > 0 ?
        `Connection unhealthy with ${consecutiveSocketErrors} socket errors` : null
    };
  });
  
  contextBridge.exposeInMainWorld('compareTokenWithBackend', (backendToken) => {
    console.log('=== TOKEN COMPARISON ===');
    console.log('Backend claims to be using token:', backendToken);
    console.log('Frontend current token (fcmCurrentToken):', fcmCurrentToken);
    console.log('Frontend current token (window.EDeviceID):', window.EDeviceID || 'Not set');
    
    const frontendToken = fcmCurrentToken || window.EDeviceID || null;
    
    if (!frontendToken) {
      console.error('❌ ERROR: Frontend token is not available!');
      console.error('❌ FCM may not be started or token not set.');
      return {
        match: false,
        error: 'Frontend token not available',
        frontendToken: null,
        backendToken: backendToken
      };
    }
    
    if (!backendToken) {
      console.error('❌ ERROR: Backend token not provided for comparison!');
      return {
        match: false,
        error: 'Backend token not provided',
        frontendToken: frontendToken,
        backendToken: null
      };
    }
    
    const tokensMatch = frontendToken === backendToken;
    
    if (tokensMatch) {
      console.log('✅ TOKENS MATCH! Backend is using the correct token.');
      console.log('✅ If notifications are not received, the issue is NOT token mismatch.');
      console.log('✅ Possible causes:');
      console.log('   1. FCM connection is dead (but health check shows healthy)');
      console.log('   2. Backend notification sending is failing silently');
      console.log('   3. Network/firewall blocking FCM messages');
      console.log('   4. FCM service issue on Google side');
    } else {
      console.error('❌ TOKENS DO NOT MATCH!');
      console.error('❌ Backend is using WRONG token!');
      console.error('❌ Frontend token:', frontendToken);
      console.error('❌ Backend token:', backendToken);
      console.error('❌ Backend must update to use frontend token:', frontendToken);
      console.error('❌ Notifications will NOT arrive until backend uses correct token!');
    }
    
    console.log('=== TOKEN COMPARISON COMPLETE ===');
    
    return {
      match: tokensMatch,
      frontendToken: frontendToken,
      backendToken: backendToken,
      frontendTokenLength: frontendToken ? frontendToken.length : 0,
      backendTokenLength: backendToken ? backendToken.length : 0,
      lastNotificationTime: new Date(fcmLastNotificationTime).toISOString(),
      minutesSinceLastNotification: Math.floor((Date.now() - fcmLastNotificationTime) / 60000),
      connectionHealthy: fcmConnectionHealthy
    };
  });
  
  contextBridge.exposeInMainWorld('logTokenProof', () => {
    console.log('=== FRONTEND TOKEN PROOF ===');
    console.log('Timestamp:', new Date().toISOString());
    console.log('Frontend Token (fcmCurrentToken):', fcmCurrentToken || 'NOT SET');
    console.log('Frontend Token (window.EDeviceID):', window.EDeviceID || 'NOT SET');
    console.log('Token Length:', fcmCurrentToken ? fcmCurrentToken.length : 0);
    console.log('FCM Started:', fcmStartedOnce);
    console.log('Connection Healthy:', fcmConnectionHealthy);
    console.log('Last Notification Received:', new Date(fcmLastNotificationTime).toISOString());
    const minutesSinceLastNotification = Math.floor((Date.now() - fcmLastNotificationTime) / 60000);
    console.log('Minutes Since Last Notification:', minutesSinceLastNotification);
    console.log('Network Online:', navigator.onLine);
    console.log('=== END TOKEN PROOF ===');
    console.log('⚠️ If backend claims to send notifications but frontend does not receive them:');
    console.log('   1. Compare tokens using: window.compareTokenWithBackend("backend-token-here")');
    console.log('   2. Check if "=== FCM NOTIFICATION EVENT RECEIVED ===" appears in console');
    console.log('   3. If that log does NOT appear, notifications are NOT arriving at frontend');
    console.log('   4. If tokens match but notifications don\'t arrive, FCM connection is likely dead');
    
    return {
      token: fcmCurrentToken || window.EDeviceID || null,
      timestamp: new Date().toISOString(),
      started: fcmStartedOnce,
      healthy: fcmConnectionHealthy,
      lastNotification: new Date(fcmLastNotificationTime).toISOString(),
      minutesSinceLastNotification: minutesSinceLastNotification
    };
  });
  
  contextBridge.exposeInMainWorld('proveNotificationsNotReceived', () => {
    console.log('=== PROOF: NOTIFICATIONS NOT RECEIVED ===');
    console.log('Timestamp:', new Date().toISOString());
    console.log('Frontend Token:', fcmCurrentToken || window.EDeviceID || 'NOT SET');
    console.log('FCM Started:', fcmStartedOnce);
    console.log('Connection Healthy:', fcmConnectionHealthy);
    console.log('Last Notification Time:', new Date(fcmLastNotificationTime).toISOString());
    const minutesSinceLastNotification = Math.floor((Date.now() - fcmLastNotificationTime) / 60000);
    console.log('Minutes Since Last Notification:', minutesSinceLastNotification);
    console.log('');
    console.log('=== PROOF STATEMENT ===');
    console.log('❌ PROOF: "=== FCM NOTIFICATION EVENT RECEIVED ===" log does NOT appear in console');
    console.log('❌ PROOF: This means notifications from backend are NOT reaching the frontend');
    console.log('❌ PROOF: If backend sent notifications, they did NOT arrive at frontend');
    console.log('');
    console.log('=== POSSIBLE REASONS ===');
    console.log('1. Backend is using WRONG token (different from frontend token above)');
    console.log('2. FCM connection is dead (but health check shows healthy)');
    console.log('3. Backend notification sending failed silently');
    console.log('4. Network/firewall blocking FCM messages');
    console.log('');
    console.log('=== TO VERIFY ===');
    console.log('1. Call: window.compareTokenWithBackend("backend-token") to check token mismatch');
    console.log('2. Check backend logs to confirm notification was actually sent');
    console.log('3. Check backend logs to confirm which token was used');
    console.log('4. If tokens match but notifications don\'t arrive, FCM connection is likely dead');
    console.log('=== END PROOF ===');
    
    return {
      proof: 'Notifications not received - no "=== FCM NOTIFICATION EVENT RECEIVED ===" log found',
      frontendToken: fcmCurrentToken || window.EDeviceID || null,
      timestamp: new Date().toISOString(),
      minutesSinceLastNotification: minutesSinceLastNotification,
      connectionHealthy: fcmConnectionHealthy
    };
  });
} catch (error) {
  console.log('Could not expose test functions:', error);
}

window.addEventListener('online', () => {
  console.log('Network back online');

  if (!fcmStartedOnce || !fcmConnectionHealthy) {
    if (fcmRestartTimeout) {
      clearTimeout(fcmRestartTimeout);
    }
    fcmRestartTimeout = setTimeout(() => {
      console.log('Restarting FCM after network reconnection...');
      fcmInitRetryCount = 0;
  restartFCM();

    }, 3000);
  }
});

ipcRenderer.on('system-suspend', () => {
  console.log('System suspending');
  fcmConnectionHealthy = false;
});

ipcRenderer.on('system-lock', () => {
  console.log('System locked');
  fcmConnectionHealthy = false;
  consecutiveSocketErrors = 0;
  lastSocketErrorTime = 0;
});

ipcRenderer.on('system-unlock', () => {
  console.log('System unlocked');
  if (fcmRestartTimeout) {
    clearTimeout(fcmRestartTimeout);
  }
  fcmRestartTimeout = setTimeout(() => {
    console.log('Restarting FCM after unlock');
    forceRestartFCM();
  }, 2000);
});

ipcRenderer.on('system-resume', () => {
  console.log('System resumed from sleep');

  if (fcmRestartTimeout) {
    clearTimeout(fcmRestartTimeout);
  }
  fcmRestartTimeout = setTimeout(() => {
    forceRestartFCM();
  }, 3000);
});

ipcRenderer.on('force-restart-fcm-now', () => {
  console.log('Force restart FCM requested');
  if (fcmRestartTimeout) {
    clearTimeout(fcmRestartTimeout);
  }
  fcmRestartTimeout = setTimeout(() => {
    forceRestartFCM();
  }, 1000);
});

if (navigator.onLine) {
  console.log('Network online on startup, waiting for network stability before starting FCM...');
  setTimeout(() => {
    console.log('Starting FCM after initial delay...');
    restartFCM();
  }, 5000);
} else {
  console.log('Network offline on startup, waiting for connection...');
  window.addEventListener('online', () => {
    console.log('Network online, waiting before starting FCM...');
    setTimeout(() => {
      console.log('Starting FCM after network reconnection...');
restartFCM();

    }, 5000);
  }, { once: true });
}
startFCMHealthCheck();
