import { SonoClient } from "../../src/sonoClient.js"
import { SonoRTC } from "../../src/sonoRTC.js"

const debugEl = document.getElementById('debug');
function log(...args) {
  const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ');
  console.log(msg);
  debugEl.innerHTML += `<div>[${new Date().toLocaleTimeString()}] ${msg}</div>`;
  debugEl.scrollTop = debugEl.scrollHeight;
}

const randomId = Math.random().toString(36).substring(2, 8);
log(`Starting client with random ID suffix: ${randomId}`);

const sono = new SonoClient('ws://localhost:8080/ws');

sono.onconnection(() => {
  log(`WebSocket connected (id suffix: ${randomId})`);
  sono.grab('myid');
  sono.grab('mychannel');
  sono.grab('mychannelclients');
});

sono.on('grab', (payload) => {
  const { type, message } = payload;
  if (type === 'myid') {
    const myId = message[0];
    document.getElementById('myId').textContent = myId;
    log(`My server ID: ${myId}`);
  }
  else if (type === 'mychannel') {
    document.getElementById('currentChannel').textContent = message[0];
    log(`My channel: ${message[0]}`);
  }
  else if (type === 'mychannelclients') {
    log(`Channel clients: [${message.join(', ')}]`);
  }
});

sono.on('message', (payload) => {
  log(`Message from ${payload.from}: ${JSON.stringify(payload.message)}`);
});

sono.on('viewerRoleSet', (payload) => {
  const role = payload.isViewer ? 'Viewer' : 'Broadcaster';
  document.getElementById('currentRole').textContent = role;
  document.getElementById('status').textContent = `Role set to: ${role}`;
  log(`Role changed to: ${role}`);
});

sono.on('clientjoining', (payload) => {
  log(`Client joined: ${payload.from}`);
});

sono.on('clientleaving', (payload) => {
  log(`Client left: ${payload.from}`);
});

const serverConfig = 'stun:stun2.l.google.com:19302';
const localVideo = document.getElementById('localVideo');
const constraints = { audio: false, video: true };
const remotevideocontainer = document.getElementById('remotevideocontainer');

const rtc = new SonoRTC(serverConfig, sono, localVideo, remotevideocontainer, constraints, false);

document.getElementById('setViewer').onclick = () => {
  rtc.setViewerMode(true);
  sono.setViewerRole(true);
  document.getElementById('start').disabled = true;
  log('Switched to Viewer mode');
};

document.getElementById('setBroadcaster').onclick = () => {
  rtc.setViewerMode(false);
  sono.setViewerRole(false);
  document.getElementById('start').disabled = false;
  log('Switched to Broadcaster mode');
};

document.getElementById('start').onclick = () => {
  if (rtc.viewerMode) {
    log('Cannot start camera in viewer mode');
    return;
  }
  rtc.startLocalMedia();
  document.getElementById('status').textContent = 'Camera started';
  log('Camera started');
};

document.getElementById('connectStream').onclick = () => {
  document.getElementById('currentChannel').textContent = 'stream';
  rtc.changeChannel('stream');
  document.getElementById('status').textContent = 'Connected to stream channel';
  log('Connected to stream channel');
};
