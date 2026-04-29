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
        this.sono.ws.send(JSON.stringify({ protocol, payload }));
    }

    onEvent(protocol, callback) {
        this.handlers[protocol] = callback;
    }

    async startChat() {
        try {
            this.updateStatus('Connecting to server...');

            // Get user media
            this.localStream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true
            });

            this.localVideo.srcObject = this.localStream;

            // Connect to sono server
            this.sono = new SonoClient('ws://localhost:8000/ws');

            // Register all event handlers
            this.onEvent('partner-found', (payload) => this.onPartnerFound(payload));
            this.onEvent('partner-disconnected', () => this.onPartnerDisconnected());
            this.onEvent('waiting', (payload) => this.updateStatus(payload.message));
            this.onEvent('video-offer', (payload) => this.onVideoOffer(payload));
            this.onEvent('video-answer', (payload) => this.onVideoAnswer(payload));
            this.onEvent('ice-candidate', (payload) => this.onIceCandidate(payload));

            // Set up single message handler that routes to correct callback
            this.sono.ws.onmessage = (event) => {
                const data = JSON.parse(event.data);
                const protocol = data.protocol;
                const payload = data.payload;

                if (protocol && this.handlers[protocol]) {
                    this.handlers[protocol](payload);
                }
            };

            // Wait for connection, then find partner
            this.sono.ws.onopen = () => {
                this.updateStatus('Connected! Finding a partner...');
                this.send('find-partner');
            };

            // Update UI
            this.startBtn.disabled = true;
            this.nextBtn.disabled = false;
            this.stopBtn.disabled = false;

        } catch (error) {
            console.error('Error starting chat:', error);
            this.updateStatus('Error: ' + error.message);
        }
    }

    findNext() {
        // Clean up current connection
        this.cleanupPeerConnection();
        this.remoteVideo.srcObject = null;
        this.partnerId = null;

        // Find new partner
        this.updateStatus('Finding new partner...');
        this.send('find-partner');
    }

    stopChat() {
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
        this.partnerId = payload.partnerId;
        this.updateStatus('Partner found! Setting up connection...');

        // Create peer connection and send offer
        this.createPeerConnection();
        this.createOffer();
    }

    onPartnerDisconnected() {
        this.updateStatus('Partner disconnected. Click "Next" to find a new partner.');
        this.cleanupPeerConnection();
        this.remoteVideo.srcObject = null;
        this.partnerId = null;
    }

    createPeerConnection() {
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
                this.peerConnection.addTrack(track, this.localStream);
            });
        }

        // Handle remote stream
        this.peerConnection.ontrack = (event) => {
            this.remoteVideo.srcObject = event.streams[0];
        };

        // Handle ICE candidates
        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate && this.partnerId) {
                this.send('ice-candidate', {
                    to: this.partnerId,
                    candidate: event.candidate
                });
            }
        };

        // Handle connection state
        this.peerConnection.onconnectionstatechange = () => {
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
    }

    async createOffer() {
        try {
            const offer = await this.peerConnection.createOffer();
            await this.peerConnection.setLocalDescription(offer);

            this.send('video-offer', {
                to: this.partnerId,
                offer: offer
            });
        } catch (error) {
            console.error('Error creating offer:', error);
        }
    }

    async onVideoOffer(payload) {
        const { offer, from } = payload;
        this.partnerId = from;

        this.createPeerConnection();

        try {
            await this.peerConnection.setRemoteDescription(offer);
            const answer = await this.peerConnection.createAnswer();
            await this.peerConnection.setLocalDescription(answer);

            this.send('video-answer', {
                to: from,
                answer: answer
            });
        } catch (error) {
            console.error('Error handling offer:', error);
        }
    }

    async onVideoAnswer(payload) {
        const { answer } = payload;

        try {
            await this.peerConnection.setRemoteDescription(answer);
        } catch (error) {
            console.error('Error handling answer:', error);
        }
    }

    async onIceCandidate(payload) {
        const { candidate } = payload;

        try {
            await this.peerConnection.addIceCandidate(candidate);
        } catch (error) {
            console.error('Error adding ICE candidate:', error);
        }
    }

    cleanupPeerConnection() {
        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }
    }

    stopLocalStream() {
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
            this.localVideo.srcObject = null;
        }
    }

    updateStatus(message) {
        this.status.textContent = message;
    }
}

// Initialize the app
new OmegleClone();