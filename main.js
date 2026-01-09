"use strict";
// $ npm install electron
// $ ./node_modules/.bin/electron .
const { app, nativeImage, Tray, Menu, ipcMain, BrowserWindow, remote, shell, session, powerMonitor } = require("electron");

//below link helps to implement auto-updates.
//https://philo.dev/electron-auto-update-explained/

// Module with utilities for working with file and directory paths.
const fs = require('fs');
const path = require('path')
const Store = require('electron-store');
const { setup: setupPushReceiver } = require('@cuj1559/electron-push-receiver');
const pushReceiverInternal = require('@cuj1559/electron-push-receiver/src/index.js');
const store = new Store();
const EventEmitter = require('events')
const loadingEvents = new EventEmitter()
const appDataPath = app.getPath('appData');
const AutoLaunch = require('auto-launch');

const FCM_CREDENTIAL_KEYS = ['fcm_credentials', 'persistentIds', 'fcm', 'credentials'];

// Safeguard function to prevent accidental clearing of FCM credentials
function protectFCMCredentials() {
  // This function ensures FCM credentials are never accidentally cleared
  // Override store.delete to prevent clearing FCM keys
  const originalDelete = store.delete.bind(store);
  store.delete = function(key) {
    if (FCM_CREDENTIAL_KEYS.includes(key)) {
      console.error('');
      console.error('❌❌❌ BLOCKED: Attempt to delete FCM credential key:', key);
      console.error('❌ FCM credentials must NEVER be deleted!');
      console.error('❌ FCM needs these credentials to establish WebSocket connection');
      console.error('❌ Deleting them would break notifications!');
      console.error('');
      return false; // Block the deletion
    }
    return originalDelete(key);
  };
  
  // Also protect store.clear() - don't clear FCM credentials
  const originalClear = store.clear.bind(store);
  store.clear = function() {
    console.error('');
    console.error('❌❌❌ BLOCKED: Attempt to clear all store data');
    console.error('❌ This would delete FCM credentials!');
    console.error('❌ FCM credentials are protected and will NOT be cleared');
    console.error('');
    
    // Clear everything EXCEPT FCM credentials
    const allKeys = Object.keys(store.store);
    allKeys.forEach(key => {
      if (!FCM_CREDENTIAL_KEYS.includes(key)) {
        originalDelete(key);
      }
    });
    console.log('✅ Cleared store data (FCM credentials preserved)');
  };
  
  console.log('✅ FCM credentials safeguard enabled - credentials will NOT be cleared');
}

// Enable safeguard
protectFCMCredentials();

let fcmWebContents = null;

// Add logout state tracking
const LOGOUT_STATE_KEY = 'user_logged_out';

// Loop through each file and delete it
try {
  const codeCacheJsPath = path.join(appDataPath, 'CallMantra', 'Code Cache', 'js');
  const files = fs.readdirSync(codeCacheJsPath);  // Get a list of all files in the Code Cache\js folder
  files.forEach((file) => {
    const filePath = path.join(codeCacheJsPath, file);
    fs.unlinkSync(filePath);
  });

} catch (_) { }

try {
  //  require('electron-reload')(__dirname);
  require('electron-reloader')(module, {
    debug: false,
    watchRenderer: false
  });
} catch (_) { console.log('Error'); }


const autoLaunch = new AutoLaunch({
  name: 'CallMantra',  // Name of your app
  path: app.getPath('exe') // Path to your app's executable
});

autoLaunch.enable()
  .then(() => {
  })
  .catch(err => {
    // console.log('Error enabling auto-launch:', err);
  });

const dialerURL = 'https://testdialer.callmantra.co';
//store.set('alwaysontop', 1);

let top = {}; // prevent gc to keep windows
app.setName('CallMantra');
app.disableHardwareAcceleration();

let deeplinkingUrl

// Force Single Instance Application
const gotTheLock = app.requestSingleInstanceLock()
if (gotTheLock) {

  app.on('second-instance', (e, argv) => {

    // Someone tried to run a second instance, we should focus our window.
    // logEverywhere('second-instance:' + argv)

    // argv: An array of the second instance's (command line / deep linked) arguments
    if (process.platform == 'win32') {      // Keep only command line / deep linked arguments
      session.defaultSession.clearCache();

      deeplinkingUrl = argv.slice(1)
      if (deeplinkingUrl.length > 0) {
        addclickedlink2call(deeplinkingUrl)
      }
    }

    if (top.win.isMinimized())
      top.win.restore();

    top.win.setAlwaysOnTop(true);
    top.win.focus();
    top.win.setAlwaysOnTop(false);

  })
} else {
  logEverywhere('gotTheLock false')
  app.quit()
} //end of single instance check.


app.on("ready", ev => {
  // Always clear session data on startup to ensure clean state
  console.log('App starting - clearing session data for clean state');

  top.win = new BrowserWindow({
    title: "CallMantra Softphone",
    icon: path.resolve(__dirname, 'logo256.ico'),
    width: 425, height: 665, center: true, minimizable: true, show: true, // Show immediately
    webPreferences: {
      nodeIntegration: true, // is default value after Electron v5
      contextIsolation: true, // protect against prototype pollution
      enableRemoteModule: false, // turn off remote
      devTools: true, // Disable dev tools in production
      preload: path.join(__dirname, "renderer.js") // use a preload script
    },
    setAlwaysOnTop: false,
    minWidth: 425,
    minHeight: 665
  });

  if (process.platform == 'win32') {
    app.setAppUserModelId('CallMantra');
  }

  top.win.setTitle("CallMantra")
  top.win.setVisibleOnAllWorkspaces(true)

  // === FCM CREDENTIALS CHECK - CRITICAL: NEVER CLEAR THESE ===
  // FCM library automatically uses credentials from electron-store
  // If credentials exist, FCM will:
  //   1. Load them automatically
  //   2. Extract token from credentials
  //   3. Establish WebSocket connection
  //   4. Notifications work perfectly!
  // 
  // DO NOT CLEAR credentials - let FCM reuse them!
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('🔍 CHECKING FCM CREDENTIALS IN ELECTRON-STORE');
  console.log('═══════════════════════════════════════════════════════════════');
  try {
    const fcmKeys = ['fcm_credentials', 'persistentIds', 'fcm', 'credentials'];
    let foundKeys = [];
    fcmKeys.forEach(key => {
      if (store.has(key)) {
        foundKeys.push(key);
        const value = store.get(key);
        const valueType = typeof value;
        const valueLength = valueType === 'string' ? value.length : 
                          valueType === 'object' ? JSON.stringify(value).length : 0;
        console.log(`  ✅ Found: ${key} (type: ${valueType}, size: ${valueLength} bytes)`);
      }
    });
    
    if (foundKeys.length > 0) {
      console.log('');
      console.log(`  ✅ Found ${foundKeys.length} FCM credential(s) in electron-store`);
      console.log('  ✅ FCM library will AUTOMATICALLY load and use these credentials');
      console.log('  ✅ FCM will extract token from credentials');
      console.log('  ✅ FCM will establish WebSocket connection using these credentials');
      console.log('  ✅ Notifications will work with the token from these credentials');
      console.log('');
      console.log('  ⚠️ CRITICAL: These credentials will NOT be cleared');
      console.log('  ⚠️ CRITICAL: FCM needs these to establish WebSocket connection');
      console.log('  ⚠️ CRITICAL: Clearing them would force new token generation (which fails if endpoint blocked)');
    } else {
      console.log('  ⚠️ No FCM credentials found in electron-store');
      console.log('  ⚠️ FCM will attempt to generate NEW token');
      console.log('  ⚠️ This requires Firebase installations endpoint to be accessible');
      console.log('  ⚠️ If endpoint is blocked, token generation will fail');
    }
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('');
  } catch (error) {
    console.error('❌ Error checking FCM credentials:', error);
    console.log('');
  }

  setupPushReceiver(top.win.webContents);
  fcmWebContents = top.win.webContents;

  top.win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url); // open url in a browser and prevent default
    return { action: 'deny' };
  });

  if (process.platform == 'win32' && deeplinkingUrl == "") {
    app.setAppUserModelId(app.name);
    deeplinkingUrl = process.argv.slice(1)
    if (deeplinkingUrl.length > 0) {
      addclickedlink2call(deeplinkingUrl)
      deeplinkingUrl = "";
    }
  }

  // Optimized session clearing with shorter timeout
  const sessionClearTimeout = setTimeout(() => {
    console.log('Session clearing timeout - proceeding with app load');
    loadWelcomeScreen();
  }, 2000); // Reduced to 2 seconds

  // Quick session clear for better performance
  top.win.webContents.session.clearCache((err) => {
    if (err) {
      console.error('Error clearing cache:', err);
    }
    console.log('Cache cleared, now clearing storage data...');

    // Only clear essential storage types for better performance
    top.win.webContents.session.clearStorageData({
      storages: ['cookies', 'localstorage', 'sessionstorage'], // Reduced scope
    }, (err) => {
      clearTimeout(sessionClearTimeout);
      if (err) {
        console.error('Error clearing storage data:', err);
      }
      console.log('Session data cleared on startup');
      loadWelcomeScreen();
    });
  });

  function loadWelcomeScreen() {
    // Load welcome screen first
    console.log('Loading welcome screen...');
    top.win.loadFile('welcome.html').then(() => {
      console.log('Welcome screen loaded successfully');
    }).catch((err) => {
      console.error('Error loading welcome screen:', err);
    });

    // Set up loading events with reduced delay
    loadingEvents.on('finished', () => {
      // Check if user was previously logged out
      const logoutState = store.get(LOGOUT_STATE_KEY);
      console.log('Checking logout state on startup:', logoutState);

      if (logoutState) {
        console.log('User was previously logged out, redirecting to login page');
        // Load dialer URL which will show the login page
        top.win.loadURL(dialerURL, { extraHeaders: 'pragma: no-cache\n' });
      } else {
        console.log('No logout state detected, loading dialer URL');
        // Reduced delay for better performance
        setTimeout(() => {
          top.win.loadURL(dialerURL, { extraHeaders: 'pragma: no-cache\n' });
        }, 200); // Reduced from 500ms to 200ms
      }
    });

    // Reduced delay for better performance
    setTimeout(() => loadingEvents.emit('finished'), 500); // Reduced from 1000ms to 500ms
  }

  top.win.once('ready-to-show', () => {
    top.win.show() //to prevent the white screen when loading the window, lets show it when it is ready
    top.win.focus() // Ensure window gets focus
  })

  // Ensure window is visible when app is activated
  app.on('activate', () => {
    if (top.win) {
      top.win.show()
      top.win.focus()
    }
  })

  // Handle second instance launch (when app is already running)
  app.on('second-instance', () => {
    if (top.win) {
      // Focus the existing window
      if (top.win.isMinimized()) {
        top.win.restore();
      }
      top.win.show();
      top.win.focus();
    }
  });

  top.win.webContents.on("did-fail-load", function () {
    top.win.loadURL(dialerURL);
  });

  // Monitor for redirects that indicate logout
  top.win.webContents.on('did-redirect-navigation', (event, url) => {
    console.log('Redirect detected:', url);
    if (url.includes('dialer.callmantra.co') &&
      (url.includes('/login') || url.includes('/signin') || url.includes('/auth'))) {
      console.log('Logout detected via redirect to login page');
      store.set(LOGOUT_STATE_KEY, true);
      console.log('Logout state flag set to:', store.get(LOGOUT_STATE_KEY));
      // No need to redirect again since we're already going to login page
    }
  });

  top.win.webContents.on('dom-ready', () => {
    top.win.webContents.send('app-version', app.getVersion());

    // Check if current page is a login page (indicating logout)
    const currentUrl = top.win.webContents.getURL();
    console.log('DOM ready, current URL:', currentUrl);
    if (currentUrl.includes('dialer.callmantra.co') &&
      (currentUrl.includes('/login') || currentUrl.includes('/signin') || currentUrl.includes('/auth'))) {
      console.log('Logout detected via DOM ready - login page detected');
      // User has been logged out, clear session data
      top.win.webContents.session.clearCache(() => {
        top.win.webContents.session.clearStorageData({
          storages: ['appcache', 'cookies', 'filesystem', 'indexdb', 'localstorage', 'shadercache', 'websql', 'serviceworkers', 'cachestorage'],
        }, () => {
          console.log('Session data cleared - user logged out');
          // Set logout state flag
          store.set(LOGOUT_STATE_KEY, true);
        });
      });
    } else if (currentUrl.includes('dialer.callmantra.co')) {
      // Check if the dialer page shows login content
      top.win.webContents.executeJavaScript(`
        (function() {
          const loginIndicators = [
            document.querySelector('input[type="password"]'),
            document.querySelector('input[name="password"]'),
            document.querySelector('input[name="email"]'),
            document.querySelector('input[name="username"]'),
            document.querySelector('.login'),
            document.querySelector('#login'),
            document.querySelector('[data-testid="login"]'),
            document.querySelector('form[action*="login"]'),
            document.querySelector('form[action*="signin"]'),
            document.querySelector('form[action*="auth"]')
          ];
          
          const hasLoginIndicator = loginIndicators.some(indicator => indicator !== null);
          return hasLoginIndicator;
        })()
      `).then((hasLoginIndicator) => {
        if (hasLoginIndicator) {
          console.log('Logout detected via DOM ready - dialer page shows login content');
          store.set(LOGOUT_STATE_KEY, true);
          console.log('Logout state flag set to:', store.get(LOGOUT_STATE_KEY));
          // No need to redirect - we're already on the login page
        }
      }).catch(err => {
        // Ignore errors
      });
    }
  });

  // Monitor navigation to detect logout redirects
  top.win.webContents.on('did-navigate', (event, url) => {
    console.log('Navigation detected:', url);
    if (url.includes('dialer.callmantra.co') &&
      (url.includes('/login') || url.includes('/signin') || url.includes('/auth'))) {
      console.log('Logout detected via navigation to login page');
      // User has been redirected to login page, clear session data
      top.win.webContents.session.clearCache(() => {
        top.win.webContents.session.clearStorageData({
          storages: ['appcache', 'cookies', 'filesystem', 'indexdb', 'localstorage', 'shadercache', 'websql', 'serviceworkers', 'cachestorage'],
        }, () => {
          console.log('Session data cleared - navigation to login page detected');
          // Set logout state flag
          store.set(LOGOUT_STATE_KEY, true);
          console.log('Logout state flag set to:', store.get(LOGOUT_STATE_KEY));
        });
      });
    }
  });

  let lastLogoutCheckTime = 0;
  let logoutCheckInProgress = false;

  setInterval(() => {
    if (logoutCheckInProgress) return;
    if (Date.now() - lastLogoutCheckTime < 30000) return;

    if (top.win && top.win.webContents) {
      const currentUrl = top.win.webContents.getURL();
      if (currentUrl.includes('dialer.callmantra.co') && !currentUrl.includes('/login') && !currentUrl.includes('/signin') && !currentUrl.includes('/auth')) {
        logoutCheckInProgress = true;
        lastLogoutCheckTime = Date.now();

        top.win.webContents.executeJavaScript(`
          (function() {
            const loginIndicators = [
              document.querySelector('input[type="password"]'),
              document.querySelector('input[name="password"]'),
              document.querySelector('input[name="email"]'),
              document.querySelector('input[name="username"]'),
              document.querySelector('.login'),
              document.querySelector('#login'),
              document.querySelector('[data-testid="login"]'),
              window.location.pathname.includes('/login'),
              window.location.pathname.includes('/signin'),
              window.location.pathname.includes('/auth')
            ];
            
            const hasLoginIndicator = loginIndicators.some(indicator => indicator !== null);
            return hasLoginIndicator;
          })()
        `).then((hasLoginIndicator) => {
          logoutCheckInProgress = false;
          if (hasLoginIndicator) {
            const currentLogoutState = store.get(LOGOUT_STATE_KEY);
            if (!currentLogoutState) {
              console.log('Logout detected via periodic check - login indicators found');
              store.set(LOGOUT_STATE_KEY, true);
            }
          }
        }).catch(err => {
          logoutCheckInProgress = false;
        });
      } else {
        logoutCheckInProgress = false;
      }
    }
  }, 30000);

  // Handle window close event properly
  top.win.on("close", ev => {
    try {
      top.win.hide()
      ev.preventDefault() // prevent quit process
    } catch (error) {
      console.error('Error handling window close:', error);
    }
  });


  const icon = nativeImage.createFromPath(path.join(__dirname, "logo256.ico"))
  top.tray = new Tray(icon)
  const menu = Menu.buildFromTemplate([
    {
      label: "Open Softphone", click: (item, window, event) => {
        top.win.show();
      }
    },
    { type: "separator" },
    {
      label: "Force Logout", click: (item, window, event) => {
        console.log('Manual logout triggered from tray menu');
        store.set(LOGOUT_STATE_KEY, true);
        console.log('Logout state flag set to:', store.get(LOGOUT_STATE_KEY));
        top.win.webContents.session.clearCache(() => {
          top.win.webContents.session.clearStorageData({
            storages: ['appcache', 'cookies', 'filesystem', 'indexdb', 'localstorage', 'shadercache', 'websql', 'serviceworkers', 'cachestorage'],
          }, () => {
            console.log('Session data cleared - manual logout');
            // Redirect to login page instead of welcome screen
            top.win.loadURL(dialerURL, { extraHeaders: 'pragma: no-cache\n' });
          });
        });
      }
    },
    { type: "separator" },
    {
      label: "Backoffice", click: (item, window, event) => {
        shell.openExternal("https://backoffice.callmantra.co")
      }
    },
    {
      label: "Website", click: (item, window, event) => {
        shell.openExternal("https://callmantra.co")
      }
    },
    { type: "separator" },
    {
      label: "Version", submenu: [
        { label: app.getVersion() }
      ]
    },
    { role: "quit" }, // "role": system prepared action menu
  ]);

  top.tray.setToolTip("CallMantra Softphone");
  top.tray.setContextMenu(menu);

  top.tray.on('right-click', () => {
    top.tray.popUpContextMenu();
  })
  top.tray.on('click', () => {
    RestoreWin()

    // restore overlay icon when going back from tray
    //setOverlayIcon(icon);
  });
  top.tray.on('double-click', () => {
    RestoreWin()

    // restore overlay icon when going back from tray
    //setOverlayIcon(icon);
  });

  powerMonitor.on('suspend', () => {
    console.log('System going to sleep');
    if (top.win && top.win.webContents) {
      top.win.webContents.send('system-suspend');
    }
  });

  let powerEventTimeout = null;

  powerMonitor.on('resume', () => {
    console.log('System resumed from sleep');
    if (top.win && top.win.webContents) {
      if (powerEventTimeout) {
        clearTimeout(powerEventTimeout);
      }
      powerEventTimeout = setTimeout(() => {
        top.win.webContents.send('system-resume');
      }, 3000);
    }
  });

  powerMonitor.on('lock-screen', () => {
    console.log('System screen locked');
    if (top.win && top.win.webContents) {
      top.win.webContents.send('system-lock');
    }
  });

  powerMonitor.on('unlock-screen', () => {
    console.log('System unlocked by user');
    if (top.win && top.win.webContents) {
      if (powerEventTimeout) {
        clearTimeout(powerEventTimeout);
      }
      powerEventTimeout = setTimeout(() => {
        top.win.webContents.send('system-unlock');
      }, 1000);
    }
  });

  powerMonitor.on('user-did-become-active', () => {
    console.log('User became active again');
    if (top.win && top.win.webContents) {
      if (powerEventTimeout) {
        clearTimeout(powerEventTimeout);
      }
      powerEventTimeout = setTimeout(() => {
        top.win.webContents.send('system-resume');
      }, 2000);
    }
  });

}); //end of "ON"

function handleInfromRenderer(event, title) {
  //logEverywhere('Main received# ' + title)

  if (title.includes('COUNT')) {
    var counter = 0
    try {
      counter = parseInt(title.replace('COUNT:', ''))
      //logEverywhere('Main received# ' + counter)
      if (counter > 0) {
        app.setBadgeCount(counter)
        setBadgeCount(counter)
      } else {
        app.setBadgeCount(0)
        setBadgeCount(0)
      }
    } catch (e) {
      app.setBadgeCount(0)
      setBadgeCount(0)
    }
  } else if (title.includes('FOCUSWIN')) {
    FocusWin()
  } else if (title === 'REFRESH') {
    // === NEW: Forward REFRESH to web page ===
    if (top.win && top.win.webContents) {
      top.win.webContents.send("fromMain", "REFRESH");
    }
  } else if (title == 'INCOMINGCALL') {
    top.win.setAlwaysOnTop(true);
    top.win.show()
    top.win.setAlwaysOnTop(false);
  } else if (title.includes('OFFLINE-WEB')) {
    top.win.loadFile('welcome.html')
  } else if (title.includes('ONLINE-WEB')) {
    top.win.loadURL(dialerURL);
  } else if (title.includes('LOGOUT')) {
    // Clear all session data when logout occurs
    top.win.webContents.session.clearCache(() => {
      top.win.webContents.session.clearStorageData({
        storages: ['appcache', 'cookies', 'filesystem', 'indexdb', 'localstorage', 'shadercache', 'websql', 'serviceworkers', 'cachestorage'],
      }, () => {
        console.log('Session data cleared on logout');
        // Set logout state flag
        store.set(LOGOUT_STATE_KEY, true);
        console.log('Logout state flag set to:', store.get(LOGOUT_STATE_KEY));
        // Redirect to login page instead of welcome screen
        top.win.loadURL(dialerURL, { extraHeaders: 'pragma: no-cache\n' });
      });
    });
  } else if (title.includes('LOGIN_SUCCESS')) {
    // User has successfully logged in, clear logout state
    console.log('Login success detected, clearing logout state');
    store.delete(LOGOUT_STATE_KEY);
    console.log('Logout state flag cleared, current value:', store.get(LOGOUT_STATE_KEY));
  } else {
    top.win.setAlwaysOnTop(false);
  }
}


// Set the badge count by setting the tray icon's image with the overlay
function setBadgeCount(count) {
  if (count > 0) {
    const overlayImage = nativeImage.createFromPath(path.join(__dirname, "icon_unread.png"))
    top.tray.setImage(overlayImage);
  } else {
    const overlayImage = nativeImage.createFromPath(path.join(__dirname, "favicon.png"))
    top.tray.setImage(overlayImage);
  }
}

function FocusWin() {
  if (top.win) {
    if (top.win.isMinimized()) {
      top.win.restore();
    }

    top.win.show();
    top.win.setAlwaysOnTop(true);
    top.win.focus();

    // Bring window to front briefly
    setTimeout(() => {
      top.win.setAlwaysOnTop(false);
    }, 100);

    //top.win.webContents.send("fromMain", "REFRESH");
  }
}
function RestoreWin() {
  if (top.win && !top.win.isVisible()) {
    // Only perform operations if window is not visible
    top.win.show();
    top.win.focus();

    const shouldStayOnTop = store.get('alwaysontop') == 1;
    if (shouldStayOnTop) {
      top.win.setAlwaysOnTop(true);
    }

    //top.win.webContents.send("fromMain", "REFRESH");
  }
}

app.whenReady().then(() => {
  ipcMain.on('toMain', handleInfromRenderer)


  // Stop FCM service (for restart) - does NOT clear credentials
  // This allows FCM to be restarted while preserving token and Installation ID
  ipcMain.on('stop-fcm-service', () => {
    try {
      if (pushReceiverInternal.resetFCMService) {
        pushReceiverInternal.resetFCMService();
        console.log('✅ FCM service stopped (credentials preserved - will be reused on restart)');
      }
    } catch (err) {
      console.error('Failed to stop FCM service:', err);
    }
  });

  // Force restart FCM service (for dead connection recovery) - does NOT clear credentials
  // This is the CORRECT way to recover from dead connections
  // Reuses existing token and Installation ID, just reconnects the socket
  ipcMain.on('force-restart-fcm', () => {
    try {
      if (fcmWebContents && !fcmWebContents.isDestroyed()) {
        if (pushReceiverInternal.resetFCMService) {
          pushReceiverInternal.resetFCMService();
        }
        console.log('✅ FCM service reset in main process (credentials preserved)');
        console.log('✅ Token and Installation ID will be reused on restart');
      }
    } catch (err) {
      console.error('Failed to reset FCM service:', err);
    }
  });

  ipcMain.on('test-notification', (event, title, body, type) => {
    try {
      if (top.win && top.win.webContents && !top.win.webContents.isDestroyed()) {
        const { NOTIFICATION_RECEIVED } = require('@cuj1559/electron-push-receiver/src/constants');
        const testPayload = {
          notification: {
            title: title || 'Test Notification',
            body: body || 'This is a test notification',
          }
        };
        if (type === 'missed') {
          testPayload.notification.title = 'Missed Call';
        } else if (type === 'voice') {
          testPayload.notification.title = 'Voice Message';
        } else if (type === 'text') {
          testPayload.notification.title = 'Text Message';
        }
        top.win.webContents.send(NOTIFICATION_RECEIVED, testPayload);
        console.log('Test notification sent:', testPayload);
      }
    } catch (err) {
      console.error('Failed to send test notification:', err);
    }
  });

  ipcMain.on('notification-click', (event, data) => {
    logEverywhere('notification clicked:' + data)
  });

})

if (!app.isDefaultProtocolClient('CallMantra')) {
  // Define custom protocol handler. Deep linking works on packaged versions of the application!
  app.setAsDefaultProtocolClient('CallMantra')
}

app.on("before-quit", ev => {
  // BrowserWindow "close" event spawn after quit operation,
  // it requires to clean up listeners for "close" event
  top.win.removeAllListeners("close");
  // release windows
  top = null;
  
  // ✅ CRITICAL: FCM credentials are NOT cleared on app close
  // This is the CORRECT behavior:
  // - FCM tokens are stable and designed to persist
  // - Credentials will be reused on next startup
  // - FCM will automatically load credentials and establish WebSocket connection
  // - Same token is VALID and will work (tokens don't expire on app restart)
  // - If connection is dead, health check will restart FCM service (not regenerate token)
  // - Only regenerate token if restart fails AND Firebase endpoints are reachable
});

// Log both at dev console and at running node console instance
function logEverywhere(s) {
  if (top.win && top.win.webContents) {
    top.win.webContents.executeJavaScript(`console.log("${s}")`)
  }
}

function dummy() {
  let str1 = "--allow-file-access-from-files,tel:+1%20313%20581-1577";
  logEverywhere("str1:" + str1);
  if (str1.length != 0) {
    str1 = str1.toString().replace("--allow-file-access-from-files,", "").replace("tel:", "").replace("sip:", "").replace(".", "").trim();
    str1 = str1.toString().replace("(", "").replace(")", "");
    str1 = str1.toString().replace("-", "").replace("-", "").replace("-", "").replace("+", "")
    str1 = str1.toString().replace(" ", "").replace(" ", "").replace(" ", "").trim();
    str1 = str1.toString().replace("/", "").replace("/", "").replace("/", "").trim();
    str1 = str1.toString().replace("%20", "").replace("%20", "").replace("%20", "").trim();
    logEverywhere("str1:" + str1);
  }
}

function addclickedlink2call(str1) {
  if (str1.length != 0) {
    str1 = str1.toString().replace("--allow-file-access-from-files,", "")
    str1 = str1.replace("tel:", "")
    str1 = str1.replace("sip:", "")
    str1 = str1.replace(".", "").trim()
    str1 = str1.toString().replace("(", "").replace(")", "")
    str1 = str1.toString().replace("-", "").replace("-", "").replace("-", "").replace("+", "")
    str1 = str1.toString().replace("allowfile-access-from-files", "")
    str1 = str1.toString().replace(" ", "").replace(" ", "").replace(" ", "").trim()
    str1 = str1.toString().replace("/", "").replace("/", "").replace("/", "").trim()
    str1 = str1.toString().replace("%20", "").replace("%20", "").replace("%20", "").trim()

    var ani = str1
    if (ani.length > 0) {
      top.win.webContents.send("fromMain", ani)
      str1 = ""
      ani = ""
    }
    return true;
  }
  else {
    return false;
  }
}

function sendNotification(sbody) {
  const NOTIFICATION_TITLE = 'CallMantra'
  const NOTIFICATION_BODY = sbody//'Notification from the Renderer process. Click to log to console.'

  new Notification(NOTIFICATION_TITLE,
    {
      body: NOTIFICATION_BODY,
      icon: '../images/callmantrafavicon.ico',
      tag: 'soManyNotification',
      hasReply: true
    })

}

//https://github.com/oikonomopo/electron-deep-linking-mac-win/blob/master/main.js  taken help from here
//https://github.com/electron/electron/issues/9920 taken help for ipcmain
