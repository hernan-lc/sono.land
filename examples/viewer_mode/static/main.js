import { SonoClient } from "../../src/sonoClient.js"
import { SonoRTC } from "../../src/sonoRTC.js"

const sono = new SonoClient('ws://localhost:8080/ws')
const videoGrid = document.getElementById('videoGrid')
const toggleBtn = document.getElementById('toggleCam')

let localVideoEl = null
let rtc = null

// Create local video element in grid
function createLocalVideo() {
  if (localVideoEl) return
  localVideoEl = document.createElement('video')
  localVideoEl.autoplay = true
  localVideoEl.playsInline = true
  localVideoEl.muted = true
  localVideoEl.style.cssText = 'width:100%;aspect-ratio:16/9;object-fit:cover;background:#000;border-radius:8px'
  videoGrid.prepend(localVideoEl)
}

// Initialize RTC
function initRTC() {
  createLocalVideo()

  rtc = new SonoRTC(
    'stun:stun2.l.google.com:19302',
    sono,
    localVideoEl,
    videoGrid,
    { audio: false, video: true },
    true
  )

  // Override ontrack to show remote videos properly
  const origCreate = rtc.createRTCs.bind(rtc)
  rtc.createRTCs = function () {
    origCreate()

    Object.keys(rtc.peerconnection).forEach((id) => {
      const pc = rtc.peerconnection[id]
      if (pc._trackSetup) return
      pc._trackSetup = true

      pc.ontrack = (event) => {
        let remote = document.getElementById(`remote-${id}`)
        if (!remote) {
          remote = document.createElement('video')
          remote.id = `remote-${id}`
          remote.autoplay = true
          remote.playsInline = true
          remote.style.cssText = 'width:100%;aspect-ratio:16/9;object-fit:cover;background:#000;border-radius:8px'
          videoGrid.appendChild(remote)
        }
        if (!remote.srcObject) {
          remote.srcObject = new MediaStream()
        }
        remote.srcObject.addTrack(event.track)
      }
    })
  }
}

// Auto-connect
sono.onconnection(() => {
  initRTC()
  sono.grab('myid')
  sono.setViewerRole(true)
})

sono.on('grab', (payload) => {
  if (payload.type === 'myid') {
    document.getElementById('myId').textContent = `ID: ${payload.message[0]}`
  }
})

// Toggle camera
toggleBtn.onclick = () => {
  if (!rtc) return

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
    if (localVideoEl) localVideoEl.srcObject = null
  }
}

// Clean up on leave
sono.on('clientleaving', (payload) => {
  const el = document.getElementById(`remote-${payload.from}`)
  if (el) el.remove()
})