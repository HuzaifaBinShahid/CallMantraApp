const {
  contextBridge,
  ipcRenderer,
  ipcMain
} = require("electron");

//THIS IS VERY IMPORTANT FOR CLICK 2 CALL WORK. donot change anything in this.
// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
// White-listed channels.

contextBridge.exposeInMainWorld(
  "api", {
      send: (channel, data) => {
          // whitelist channels
          let validChannels = ["toMain"];
          if (validChannels.includes(channel)) {
     
            ipcRenderer.send(channel, data);
          }
      },
      receive: (channel, func) => {
          let validChannels = ["fromMain"];
          if (validChannels.includes(channel)) {
              // Deliberately strip event as it includes `sender` 
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
 

function sendNotification(sbody)
{
  const NOTIFICATION_TITLE = 'CallMantra'
  const NOTIFICATION_BODY = sbody//'Notification from the Renderer process. Click to log to console.'
  new Notification(NOTIFICATION_TITLE, 
    { 
    body: NOTIFICATION_BODY,
    icon: __dirname + '/favicon.ico',
    tag: 'soManyNotification',
    hasReply: true
    })
}

if (Notification.permission === "granted") {
} else if (Notification.permission === "denied") {
  Notification.requestPermission()
};

