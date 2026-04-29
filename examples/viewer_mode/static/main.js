import { SonoClient } from "../../src/sonoClient.js"
import { SonoRTC } from "../../src/sonoRTC.js"

const sono = new SonoClient('ws://localhost:8080/ws')
const videoGrid = document.getElementById('videoGrid')
const toggleBtn = document.getElementById('toggleCam')

// Local video in grid
const localVideoEl = document.createElement('video')
localVideoEl.autoplay = true
localVideoEl.playsInline = true
localVideoEl.muted = true
localVideoEl.style.cssText = 'width:100%;aspect-ratio:16/9;object-fit:cover;background:#000;border-radius:8px'
videoGrid.appendChild(localVideoEl)

// Init RTC in viewer mode
const rtc = new SonoRTC(
  'stun:stun2.l.google.com:19302',
  sono,
  localVideoEl,
  videoGrid,
  { audio: false, video: true },
  true
)

// Auto-connect: call startConnection so inRoom=true and offers are processed
sono.onconnection(() => {
  rtc.startConnection()
  sono.setViewerRole(true)
})

// Toggle camera
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
    localVideoEl.srcObject = null
  }
}

// Clean up
sono.on('clientleaving', (payload) => {
  const el = document.getElementById(payload.from)
  if (el) el.remove()
})