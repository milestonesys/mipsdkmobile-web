import Socket from './js/WebSocket.js';
import { VideoConnectionState } from './js/config.js';

class VideoConnection extends HTMLElement {
    constructor() {
        super();
        this.state = VideoConnectionState.notOpened;
        this.addEventListener('destroy', this.destroy.bind(this));
        this.addEventListener('start', this.startStream.bind(this));
        this.frames = [];
        this.span = 5000;
    }

    set state(value) {
        this.socket && this.socket.onStateChange(this.state);
    }

    get videoId() {
        return this.getAttribute('videoId') || '';
    }

    set videoId(value) {
        if (value) {
            this.setAttribute('videoId', value);
        } else {
            this.removeAttribute('videoId');
        }
    }

    get location() {
        return this.getAttribute('location') || '';
    }

    set location(value) {
        if (value) {
            this.setAttribute('location', value);
        } else {
            this.removeAttribute('location');
        }
    }

    get bps() {
        return this.getAttribute('bps') || '';
    }

    set bps(value) {
        if (value) {
            this.setAttribute('bps', value);
        } else {
            this.removeAttribute('bps');
        }
    }

    startStream() {
        if (this.status == 'destroyed') {
            return;
        }
        this.socket = new Socket(this.videoId, this.location);
        this.socket.start();
        this.socket.onReceivedFrame = this.onReceivedFrame.bind(this);
    }

    onReceivedFrame(frame) {
        this.frames.push({ time: frame.timestamp, size: frame.dataSize });
        this.dequeueOldFrames(frame.timestamp);
        this.dispatchEvent(new CustomEvent('onReceivedFrame', { detail: { frame: frame } }));
    }

    dequeueOldFrames(dateNow) {
        while ((this.frames.length > 0) &&
            ((dateNow - this.frames[0].time) > this.span || (dateNow - this.frames[0].time) < 0)) {
            this.frames.shift();
        }
        if (parseInt(dateNow.getTime() / 1000) % 10 == 0) {
            this.bps = this.frames.reduce((a, b) => a + b.size, 0);
        }
    }

    destroy() {
        this.state = VideoConnectionState.closed;
        this.socket && this.socket.destroy();
        this.socket = null;
    }
}

window.customElements.define('video-connection', VideoConnection);