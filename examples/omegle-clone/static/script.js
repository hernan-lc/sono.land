import { SonoClient } from '../../src/sonoClient.js';

class OmegleClone {
    constructor() {
        this.sono = null;
        this.localStream = null;
        this.peerConnection = null;
        this.partnerId = null;
        this.handlers = {};

        this.localVideo = document.getElementById('localVideo');
        this.remoteVideo = document.getElementById('remoteVideo');
        this.startBtn = document.getElementById('startBtn');
        this.nextBtn = document.getElementById('nextBtn');
        this.stopBtn = document.getElementById('stopBtn');
        this.status = document.getElementById('status');

        this.setupEventListeners();
    }

    setupEventListeners() {
        this.startBtn.addEventListener('click', () => this.startChat());
        this.nextBtn.addEventListener('click', () => this.findNext());
        this.stopBtn.addEventListener('click', () => this.stopChat());
    }

    send(protocol, payload = {}) {
        const message = JSON.stringify({ protocol, payload });
        console.log(`[CLIENT] Sending:`, message);
        this.sono.ws.send(message);
    }

    onEvent(protocol, callback) {
        this.handlers[protocol] = callback;
    }

    async startChat() {
        try {
            this.updateStatus('Connecting to server...');
            console.log('[CLIENT] Starting chat...');

            // Get user media
            this.localStream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true
            });

            this.localVideo.srcObject = this.localStream;
            console.log('[CLIENT] Got user media');

            // Connect to sono server
            this.sono = new SonoClient('ws://localhost:8000/ws');
            console.log('[CLIENT] SonoClient created');

            // Register all event handlers
            this.onEvent('partner-found', (payload) => this.onPartnerFound(payload));
            this.onEvent('partner-disconnected', () => this.onPartnerDisconnected());
            this.onEvent('waiting', (payload) => this.onWaiting(payload));
            this.onEvent('video-offer', (payload) => this.onVideoOffer(payload));
            this.onEvent('video-answer', (payload) => this.onVideoAnswer(payload));
            this.onEvent('ice-candidate', (payload) => this.onIceCandidate(payload));

            // Set up single message handler that routes to correct callback
            this.sono.ws.onmessage = (event) => {
                console.log('[CLIENT] Received:', event.data);
                const data = JSON.parse(event.data);
                const protocol = data.protocol;
                const payload = data.payload;

                console.log(`[CLIENT] Protocol: ${protocol}, Handler exists: ${!!this.handlers[protocol]}`);

                if (protocol && this.handlers[protocol]) {
                    console.log(`[CLIENT] Calling handler for: ${protocol}`);
                    this.handlers[protocol](payload);
                } else {
                    console.log(`[CLIENT] No handler for protocol: ${protocol}`);
                }
            };

            // Wait for connection, then find partner
            this.sono.ws.onopen = () => {
                console.log('[CLIENT] WebSocket connected');
                this.updateStatus('Connected! Finding a partner...');
                this.send('find-partner');
            };

            this.sono.ws.onerror = (error) => {
                console.error('[CLIENT] WebSocket error:', error);
            };

            this.sono.ws.onclose = () => {
                console.log('[CLIENT] WebSocket closed');
            };

            // Update UI
            this.startBtn.disabled = true;
            this.nextBtn.disabled = false;
            this.stopBtn.disabled = false;

        } catch (error) {
            console.error('[CLIENT] Error starting chat:', error);
            this.updateStatus('Error: ' + error.message);
        }
    }

    findNext() {
        console.log('[CLIENT] Finding next partner...');
        // Clean up current connection
        this.cleanupPeerConnection();
        this.remoteVideo.srcObject = null;
        this.partnerId = null;

        // Find new partner
        this.updateStatus('Finding new partner...');
        this.send('find-partner');
    }

    stopChat() {
        console.log('[CLIENT] Stopping chat...');
        // Clean up everything
        this.cleanupPeerConnection();
        this.stopLocalStream();

        if (this.sono) {
            this.send('stop-chat');
        }

        // Reset UI
        this.startBtn.disabled = false;
        this.nextBtn.disabled = true;
        this.stopBtn.disabled = true;
        this.updateStatus('Chat stopped. Click "Start Chat" to begin again.');
    }

    onPartnerFound(payload) {
        console.log('[CLIENT] Partner found:', payload);
        this.partnerId = payload.partnerId;
        this.isInitiator = payload.isInitiator;
        this.updateStatus('Partner found! Setting up connection...');

        // Create peer connection
        this.createPeerConnection();

        // Only the initiator creates and sends the offer
        if (this.isInitiator) {
            console.log('[CLIENT] I am the initiator, creating offer');
            this.createOffer();
        } else {
            console.log('[CLIENT] I am the answerer, waiting for offer');
            this.updateStatus('Partner found! Waiting for offer...');
        }
    }

    onWaiting(payload) {
        console.log('[CLIENT] Waiting:', payload);
        this.updateStatus(payload.message);
    }

    onPartnerDisconnected() {
        console.log('[CLIENT] Partner disconnected');
        this.updateStatus('Partner disconnected. Click "Next" to find a new partner.');
        this.cleanupPeerConnection();
        this.remoteVideo.srcObject = null;
        this.partnerId = null;
    }

    createPeerConnection() {
        console.log('[CLIENT] Creating peer connection');
        this.cleanupPeerConnection();

        const config = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ]
        };

        this.peerConnection = new RTCPeerConnection(config);

        // Add local stream tracks to peer connection
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => {
                console.log('[CLIENT] Adding track:', track.kind);
                this.peerConnection.addTrack(track, this.localStream);
            });
        }

        // Handle remote stream
        this.peerConnection.ontrack = (event) => {
            console.log('[CLIENT] Got remote track:', event.track.kind);
            this.remoteVideo.srcObject = event.streams[0];
        };

        // Handle ICE candidates
        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate && this.partnerId) {
                console.log('[CLIENT] Sending ICE candidate');
                this.send('ice-candidate', {
                    to: this.partnerId,
                    candidate: event.candidate
                });
            }
        };

        // Handle connection state
        this.peerConnection.onconnectionstatechange = () => {
            console.log('[CLIENT] Connection state:', this.peerConnection.connectionState);
            switch (this.peerConnection.connectionState) {
                case 'connected':
                    this.updateStatus('Connected! You can now chat.');
                    break;
                case 'disconnected':
                    this.onPartnerDisconnected();
                    break;
                case 'failed':
                    this.updateStatus('Connection failed. Click "Next" to try again.');
                    break;
            }
        };

        this.peerConnection.oniceconnectionstatechange = () => {
            console.log('[CLIENT] ICE connection state:', this.peerConnection.iceConnectionState);
        };
    }

    async createOffer() {
        try {
            console.log('[CLIENT] Creating offer');
            const offer = await this.peerConnection.createOffer();
            await this.peerConnection.setLocalDescription(offer);
            console.log('[CLIENT] Local description set, sending offer');

            this.send('video-offer', {
                to: this.partnerId,
                offer: offer
            });
        } catch (error) {
            console.error('[CLIENT] Error creating offer:', error);
        }
    }

    async onVideoOffer(payload) {
        console.log('[CLIENT] Received video offer:', payload);
        const { offer, from } = payload;
        this.partnerId = from;

        this.createPeerConnection();

        try {
            console.log('[CLIENT] Setting remote description');
            await this.peerConnection.setRemoteDescription(offer);
            console.log('[CLIENT] Creating answer');
            const answer = await this.peerConnection.createAnswer();
            await this.peerConnection.setLocalDescription(answer);
            console.log('[CLIENT] Sending answer');

            this.send('video-answer', {
                to: from,
                answer: answer
            });
        } catch (error) {
            console.error('[CLIENT] Error handling offer:', error);
        }
    }

    async onVideoAnswer(payload) {
        console.log('[CLIENT] Received video answer:', payload);
        const { answer } = payload;

        try {
            console.log('[CLIENT] Setting remote description');
            await this.peerConnection.setRemoteDescription(answer);
        } catch (error) {
            console.error('[CLIENT] Error handling answer:', error);
        }
    }

    async onIceCandidate(payload) {
        console.log('[CLIENT] Received ICE candidate');
        const { candidate } = payload;

        try {
            await this.peerConnection.addIceCandidate(candidate);
            console.log('[CLIENT] ICE candidate added');
        } catch (error) {
            console.error('[CLIENT] Error adding ICE candidate:', error);
        }
    }

    cleanupPeerConnection() {
        if (this.peerConnection) {
            console.log('[CLIENT] Cleaning up peer connection');
            this.peerConnection.close();
            this.peerConnection = null;
        }
    }

    stopLocalStream() {
        if (this.localStream) {
            console.log('[CLIENT] Stopping local stream');
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
            this.localVideo.srcObject = null;
        }
    }

    updateStatus(message) {
        console.log('[CLIENT] Status:', message);
        this.status.textContent = message;
    }
}

// Initialize the app
new OmegleClone();