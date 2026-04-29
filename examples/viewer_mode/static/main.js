import { SonoClient } from "../../src/sonoClient.js"
import { SonoRTC } from "../../src/sonoRTC.js"

const sono = new SonoClient('ws://localhost:8080/ws')
const videoGrid = document.getElementById('videoGrid')
const toggleBtn = document.getElementById('toggleCam')

// Hidden local video for camera
const localVideo = document.createElement('video')
localVideo.autoplay = true
localVideo.playsInline = true
localVideo.muted = true
localVideo.style.display = 'none'
document.body.appendChild(localVideo)

// Start as viewer (no camera)
const rtc = new SonoRTC(
  'stun:stun2.l.google.com:19302',
  sono,
  localVideo,
  videoGrid,
  { audio: false, video: true },
  true
)

// Auto-connect
sono.onconnection(() => {
  sono.grab('myid')
  sono.setViewerRole(true)
})

sono.on('grab', (payload) => {
  if (payload.type === 'myid') {
    document.getElementById('myId').textContent = `ID: ${payload.message[0]}`
  }
})

// Toggle camera on/off
toggleBtn.onclick = () => {
  if (rtc.viewerMode) {
    rtc.setViewerMode(false)
    rtc.startLocalMedia()
    sono.setViewerRole(false)
    toggleBtn.textContent = 'Disable Camera'
    toggleBtn.classList.add('active')
  } else {
    rtc.setViewerMode(true)
    sono.setViewerRole(true)
    toggleBtn.textContent = 'Enable Camera'
    toggleBtn.classList.remove('active')
  }
}