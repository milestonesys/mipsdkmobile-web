import { VideoConnectionState } from './config.js';
import VideoFrame from './header.js'

let socketFailedTimestamp;

const videoStreamRestartMinimumInterval = 20000;

/**
 * This class is responsible for handling the WebSocket communicatio with mobile server
 * 
 * @param videoId GUID that is received from RequestStream command to mobile server
 */
export default class Socket {
    constructor(videoId, location) {
        this.videoId = videoId;
        this.videoConnectionState = VideoConnectionState.notOpened;
        this.location = this.generateURL(location);
        this.onSocketOpenFailed = () => { };
        this.onSocketError = () => { };
        this.onSocketClose = () => { };
        this.onSocketRestart = () => { };
        this.onReceivedFrame = () => { };
    }

    /**
     * Start the socket communication with mobile server
     */
    start() {
        if (this.socket) {
            return;
        }

        if (socketFailedTimestamp) {

            if (Date.now() - socketFailedTimestamp < videoStreamRestartMinimumInterval) {
                setTimeout(() => {
                    this.open();
                }, videoStreamRestartMinimumInterval);
            }
            else {
                this.onSocketRestart();
            }
        } else {
            this.open();
        }
    }

    /**
     * Opens socket communication to the mobile server in order to retreive video data
     */
    open() {
        try {
            this.socket = new WebSocket(this.location);
        }
        catch (exception) {
            this.onSocketOpenFailed();
            return;
        }

        this.socket.binaryType = "arraybuffer";
        this.socket.onerror = (exception) => {
            this.onSocketError(this.socket);
        };

        this.socket.onopen = this.onOpen.bind(this);
        // This event will be overwritten when successful WebSocket is espatblished. Otherwise will be restarted
        this.socket.onclose = function () {
            let socketReadyState = { readyState: this.socket.readyState, status: this.socket.status };

            if (!socketFailedTimestamp) {
                socketFailedTimestamp = new Date();
            }

            this.destroy();
            this.onSocketError(socketReadyState);
        }.bind(this);
    }

    /**
     * Callback that is fired when the WebSocket is opened.
     */
    onOpen() {

        this.socket.onmessage = this.onMessage.bind(this);
        this.socket.onerror = (error) => {
            console.error('WebSocket error', error);
        };
        this.socket.onclose = this.onClose.bind(this);

    }

    /**
     * Callback that is fired when a new video frames is received from mobile server
     * 
     * @param {event} event Stores the video data 
     */
    onMessage(event) {
        window.addEventListener('beforeunload', this.close);
        this.onReceivedFrame(new VideoFrame(event.data));
    }

    /**
     * Callback which is fired when socket communication with mobile server is closed
     * 
     * @param {event} event 
     */
    onClose(event) {
        this.socket.onopen = null;
        this.socket.onmessage = null;
        this.socket.onerror = null;
        this.socket.onclose = null
        this.socket = null;

        if (this.videoConnectionState == VideoConnectionState.running) {
            console.warn("Restarting socket.");
            this.start();
        }
    }

    /**
     * Generate WebSocket URL used to open a server socket communication
     * 
     * @param {string} location
     */
    generateURL(location) {
        if (!/^(http|ws)(s)?:/i.test(location)) {
            var protocol = window.location.protocol + '//';
            var hostname = document.location.hostname;
            var port = document.location.port && !/^:\d+/.test(location) ? ':' + document.location.port : '';

            location = protocol + hostname + port + location;
        }
        return location.replace(/^http(s)?:/i, 'ws$1:') + '/' + this.videoId;
    }

    /**
     * Set the state of the connection
     * @param {string} state
     */
    onStateChange(state) {
        this.videoConnectionState = state;
    }

    /**
     * Class destructor 
     */
    destroy() {
        if (!this.socket) {
            return;
        }

        this.socket.onopen = null;
        this.socket.onmessage = null;
        this.socket.onerror = null;
        this.socket.onclose = null;

        this.socket.close();
        this.socket = null;
        this.onSocketClose();
    }
}