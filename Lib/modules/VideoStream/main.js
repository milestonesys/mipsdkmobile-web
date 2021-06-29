import Template from './js/template.js';
import Stream from './js/stream.js';

const videoFormat = {
    type: 'media-source',
    video: {
        contentType: 'video/mp4; codecs="avc1.640028"',
        width: 1920,
        height: 1080,
        bitrate: 2646242,
        framerate: '30'
    }
}
const CLEAR_VIDEO_RESTARTS = 20000; // in ms.
const MAX_RESTARTS_PLAYER_ON_VIDEO_STUCK = 4; // Maximum number of restarts for a given time controlled by the Web Component

class VideoStream extends HTMLElement {
    constructor() {
        super();
        this.shadow = this.attachShadow({ mode: 'open' });
        this.checkDecodingSupported();
        this.addEventListener('destroy', this.destroy.bind(this));
        this.addEventListener('start', (event) => {
            if (event.detail && event.detail.videoConnection) {
                this.startStream(event.detail.videoConnection);
            } else {
                this.startStream();
            }
             
        });
        this.numberOfStreamRestarts = 0;
        this.clearNumberOfRestarts = null;
        this.status = 'created';
    }

    get cameraId() {
        return this.getAttribute('cameraId') || '';
    }

    set cameraId(value) {
        if (value) {
            this.setAttribute('cameraId', value);
        } else {
            this.removeAttribute('cameraId');
        }
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

    get name() {
        return this.getAttribute('name') || '';
    }

    set name(value) {
        if (value) {
            this.setAttribute('name', value);
        } else {
            this.removeAttribute('name');
        }
    }

    get width() {
        return this.getAttribute('width') || 0;
    }

    set width(value) {
        if (value) {
            this.setAttribute('width', value);
        } else {
            this.removeAttribute('width');
        }
    }

    get height() {
        return this.getAttribute('height') || 0;
    }

    set height(value) {
        if (value) {
            this.setAttribute('height', value);
        } else {
            this.removeAttribute('height');
        }
    }

    static get observedAttributes() {
        return ['width', 'height'];
    }

    async checkDecodingSupported() {
        let checkPromise = navigator.mediaCapabilities.decodingInfo(videoFormat);
        this.support = await checkPromise;
    }

    startStream(videoConnection) {
        if (this.status == 'destroyed') {
            return;
        }

        this.status = 'started';
        if (!this.stream) {
            
            let videoElement = this.shadow.querySelector('video');

            if (!videoElement) {
                return;
            }

            this.stream = new Stream(videoElement, this.cameraId, this.height, this.width, this.numberOfStreamRestarts);
            this.stream.onStreamError = this.onStreamError.bind(this);
            this.stream.onFallback = this.onFallback.bind(this);
            this.stream.onResize = this.onResize.bind(this);
            this.stream.onPlayerStarted = this.onPlayerStarted.bind(this);
            this.stream.onStreamReady = this.onStreamReady.bind(this);
            this.stream.onRestartStream = this.restartStream.bind(this);
            this.stream.onStartVideoStuck = this.onBeginVideoStuck.bind(this);
            this.stream.onClearVideoStuck = this.onEndVideoStuck.bind(this);
            this.stream.onChangeStreamDataType = this.onChangeStreamDataType.bind(this);
            this.stream.start(videoConnection);
        } else {
            this.stream.start();
        }
        
    }

    onBeginVideoStuck(videoId) {
        this.dispatchEvent(new CustomEvent('beginVideoStuck', { detail: { cameraId: this.cameraId,videoId: videoId } }));
    }

    onEndVideoStuck(videoId) {
        this.dispatchEvent(new CustomEvent('endVideoStuck', { detail: { cameraId: this.cameraId,videoId: videoId  } }));
    }

    onStreamReady(videoConnection) {
        this.dispatchEvent(new CustomEvent('streamReady', { detail: { cameraId: this.cameraId,videoId: videoConnection.videoId , connection: videoConnection, numberOfStreamRestarts: this.numberOfStreamRestarts } }));
    }

    onStreamError(error, response) {
        this.dispatchEvent(new CustomEvent('errorConnect', { detail: { cameraId: this.cameraId, error: error, response: response } }));
    }

    onFallback(msg) {
        if (this.status !== 'destroyed') {
            this.status = 'fallback';
            this.dispatchEvent(new CustomEvent('fallback', { detail: { message: msg } }));
        }
    }

    onChangeStreamDataType(fragment) {
        this.dispatchEvent(new CustomEvent('changeStreamDataType', { detail: { fragment: fragment } }));
    }

    onResize(data, width, height) {
        this.dispatchEvent(new CustomEvent('resize', { detail: {data: data, width: width, height: height} }));
    }

    onPlayerStarted(videoId) {
        this.dispatchEvent(new CustomEvent('playerStarted', { detail: { cameraId: this.cameraId,videoId: videoId}}));
    }

    onRestartStream(videoConnection) {
        this.dispatchEvent(new CustomEvent('restartStream', { connection: videoConnection }));
    }

    restartStream() {
        if (this.containerResizeTimeout) {
            clearTimeout(this.containerResizeTimeout);
            this.containerResizeTimeout = null;
        }
        
        this.numberOfStreamRestarts++;
        let videoConnection = this.stream.videoConnection;
        this.stream && this.stream.destroy(true);
        this.stream = null;

        if (this.numberOfStreamRestarts > MAX_RESTARTS_PLAYER_ON_VIDEO_STUCK || !navigator.onLine) {
            this.startStream();
        } else {
            this.startStream(videoConnection);
        }
        
        if (this.clearNumberOfRestarts) {
            clearTimeout(this.clearNumberOfRestarts);
            this.clearNumberOfRestarts = null;
        }
        this.clearNumberOfRestarts = setTimeout(() => {
            this.numberOfStreamRestarts = 0;
            this.stream.fallbackController && (this.stream.fallbackController.restartCount = 0);
        }, CLEAR_VIDEO_RESTARTS);
    }

    attributeChangedCallback(name, oldValue, newValue) {
        if (oldValue === newValue) return;

        if (this.containerResizeTimeout) {
            clearTimeout(this.containerResizeTimeout);
            this.containerResizeTimeout = null;
        }

        this.containerResizeTimeout = setTimeout(() => {
            this.stream && this.stream.onContainerResize({ width: this.offsetParent ? this.offsetParent.offsetWidth : this.width, height: this.offsetParent ? this.offsetParent.offsetHeight : this.height });
        }, 500);
    }

    connectedCallback() {
        if (this.status !== 'destroyed') {
            this.status = 'connected';
            const template = new Template(this.name).get();
            this.shadow.appendChild(template.content.cloneNode(true));
        }
    }

    disconnectedCallback() {
    }

    destroy(event) {
        const keepVideoConnection = event.detail && event.detail.keepVideoConnection || false
        this.status = 'destroyed';
        this.stream && this.stream.destroy(keepVideoConnection);
    }
}

window.customElements.define('videos-stream', VideoStream);