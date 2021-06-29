import VideoElement from './video.js';
import FallbackController from './fallback.js';

const destination = {};

const parameteres = {
    fragmentDurationMs: 350,
    streamType: 4,
    reuseConnection: true
};

const BUFFER_TIME_SECONDS = 10;

export default class Stream {
    constructor(videoElement, cameraId, height, width, restartCount) {
        this.videoConnectionObserver = {
            videoConnectionReceivedFrame: this.receivedFragment.bind(this)
        }

        this.cameraId = cameraId;
        this.queue = [];
        this.onStreamError = function () { };
        this.onStreamReady = function () { };
        this.onReceiveFragment = function () { };
        this.onResize = function () { };
        this.onFallback = function () { };
        this.onPlayerStarted = function () { };
        this.onRestartStream = function () { };
        this.onStartVideoStuck = function () { };
        this.onChangeStreamDataType = function () { };

        this.canvas = document.createElement('canvas');
        this.canvasContext = this.canvas.getContext('2d');
        this.videoWidth = this.videoHeight = 0;
        this.width = width;
        this.height = height;

        this.liveEvents = 0;

        this.bufferTimestampRemoved = 0;
        this.firstIframeAdded = false;

        this.mediaSource = new MediaSource();
        this.mediaSource.addEventListener('sourceopen', this.onSourceOpen.bind(this), false);

        this.videoElement = new VideoElement(videoElement, this.mediaSource, cameraId);
        this.videoElement.onDestroy = this.destroy.bind(this);
        this.videoElement.onPlayerStarted = this.onVideoPlayerStarted.bind(this);
        this.videoElement.onPlayerEnded = this.onVideoPlayerEnded.bind(this);

        this.fallbackController = new FallbackController(this.videoElement, restartCount);
        this.fallbackController.fallback = this.fallback.bind(this);
        this.fallbackController.onClearVideoStuck = this.onEndVideoStuck.bind(this);
        this.fallbackController.onStartVideoStuck = this.onBeginVideoStuck.bind(this);

        this.requestStream = null;
    }

    onBeginVideoStuck() {
        this.onStartVideoStuck(this.videoConnection && this.videoConnection.videoId);
    }

    onEndVideoStuck() {
        this.onClearVideoStuck(this.videoConnection && this.videoConnection.videoId);
    }

    onVideoPlayerStarted() {
        this.onPlayerStarted(this.videoConnection && this.videoConnection.videoId);
    }

    onVideoPlayerEnded() {
        this.onRestartStream();
    }

    onSourceOpen() {
        try {
            if (this.mediaSource.readyState == "open") {
                this.buffer = this.mediaSource.addSourceBuffer('video/mp4; codecs="avc1.640028"'); // avc1.420028

                this.buffer.mode = 'sequence';
                this.buffer.addEventListener('update', this.onBufferUpdate.bind(this));
            }
        } catch (e) {
            this.fallbackController.codeException(e);
            this.onRestartStream();
            return;
        }
    }

    onBufferUpdate(e) {
        this.videoElement.sync();
        try {
            if (this.queue.length > 0 && !this.buffer.updating) {

                try {
                    this.buffer.appendBuffer(this.queue.shift());
                } catch (e) {
                    console.log(e);
                }
            }
        } catch (e) {
            this.fallbackController.codeException(e);
            this.onRestartStream();
            return;
        }
    }

    onContainerResize(dstSize) {
        if (this.videoConnection) {
            XPMobileSDK.changeStream(this.videoConnection, {}, dstSize);
            this.width = dstSize.width;
            this.height = dstSize.height;
        }
    }

    start(videoConnection) {
        destination.width = this.width || 670;
        destination.height = this.height || 380;

        this.fallbackController.onRestartStream = this.onRestartStream.bind(this);

        if (videoConnection) {
            if (!this.fallbackController.isDirectStreaminigSupported(videoConnection.request.parameters.StreamType)) {
                return;
            }
            this.videoConnection = videoConnection;
            this.videoConnection.addObserver(this.videoConnectionObserver);
        } else if (window.XPMobileSDK) {
            this.requestStream = XPMobileSDK.requestStream(this.cameraId, destination, parameteres, this.streamReady.bind(this), this.streamError.bind(this));
        }

        this.fallbackController.setWaitingVideoTimeout();
    }

    receivedFragment(fragment) {
        if (!this.buffer) {
            return;
        }

        if (fragment.stream && fragment.stream.dataType === "JPEG") {
            this.onChangeStreamDataType(fragment);
            return;
        }

        this.fallbackController.addFragment(fragment); // we need to notify the fallback controller that we receive frames even that they are not of the supported data types

        if (!this.fallbackController.isDataTypeSupported(fragment)) {
            return;
        }

        if (fragment.dataSize > 0) {

            try {
                if (!this.buffer.updating && (this.buffer.timestampOffset - this.bufferTimestampRemoved - 10 /*remove buffer each 10 seconds or more*/ > BUFFER_TIME_SECONDS)) {
                    this.buffer.remove(this.bufferTimestampRemoved, this.buffer.timestampOffset - BUFFER_TIME_SECONDS);
                    this.bufferTimestampRemoved = this.buffer.timestampOffset - BUFFER_TIME_SECONDS;
                }
                if (this.checkFragmetHash(fragment)) {
                    return;
                }

                if (this.buffer.updating || this.queue.length > 0) {
                    this.queue.push(fragment.data);
                } else if (!this.firstIframeAdded && fragment.stream.hasKeyFrame) {
                    this.buffer.appendBuffer(fragment.data);
                    this.firstIframeAdded = true;
                } else if (this.firstIframeAdded) {
                        this.buffer.appendBuffer(fragment.data);
                }
                this.onReceiveFragment(fragment);
                this.getSize(fragment);
            } catch (e) {
                this.fallbackController.codeException(e);
                this.onRestartStream();
                return;
            }
        }
        if (fragment.hasLiveInformation) {
            this.onLiveEvents(fragment.currentLiveEvents);
        }
    }

    getSize(fragment) {
        if (this.canvasContext && fragment.hasSizeInformation && (this.videoWidth != fragment.sizeInfo.destinationSize.width || this.videoHeight != fragment.sizeInfo.destinationSize.height)) {
            this.videoWidth = fragment.sizeInfo.destinationSize.width;
            this.videoHeight = fragment.sizeInfo.destinationSize.height;

            this.canvasContext.canvas.width = this.videoWidth;
            this.canvasContext.canvas.height = this.videoHeight;
            this.canvasContext.fillStyle = 'black';
            this.canvasContext.fillRect(0, 0, this.videoWidth, this.videoHeight);

            this.onResize(this.canvas.toDataURL(), this.videoWidth, this.videoHeight);
        }
    }

    checkFragmetHash(fragment) {
        if (!this.fragmentHash) {
            this.fragmentHash = this.createFragmentHash(fragment);
        } else if (this.fragmentHash != this.createFragmentHash(fragment)) {
            this.onRestartStream();
            return true;
        }
        return false;
    }

    createFragmentHash(fragment) {
        if (fragment) {
            return fragment.stream.profile + '-' + fragment.stream.level + '-' + fragment.sizeInfo.sourceSize.width + '-' + fragment.sizeInfo.sourceSize.height;
        }
        return false;
    }

    onLiveEvents(current) {
        var changed = this.liveEvents ^ current;

        if (changed & XPMobileSDK.library.ItemHeaderParser.LiveFlags.CameraConnectionLost) {
            if (current & XPMobileSDK.library.ItemHeaderParser.LiveFlags.CameraConnectionLost) {
                console.log('Camera connection lost');
                this.onRestartStream();
            }
        }

        this.liveEvents = current;
    }

    streamReady(videoConnection) {
        if (!this.videoConnection && !!this.cameraId) {
            this.videoConnection = videoConnection;
            this.videoConnection.addObserver(this.videoConnectionObserver);
            this.videoConnection.open();
        }

        this.requestStream = null;

        if (!this.cameraId) {
            videoConnection.close();
        }

        this.onStreamReady(videoConnection);
        this.onStreamReady = function () { };
    }

    streamError(error, response) {
        this.requestStream = null;
        console.log('requestStreamErrorCallback: ' + error.code);
        this.onStreamError(error, response);
    }

    fallback(msg) {
        this.onFallback(msg);
        this.destroy();
    }

    destroy(keepVideoConnection) {
        if (!keepVideoConnection && this.videoConnection) {
            this.videoConnection.removeObserver(this.videoConnectionObserver);
            this.videoConnection.close();
            this.videoConnection = null;
        }

        if (this.requestStream) {
            XPMobileSDK.cancelRequest(this.requestStream);
            this.requestStream = null;
        }

        this.videoElement.destroy(keepVideoConnection);
        this.fallbackController.destroy();

        this.mediaSource = null;
        this.buffer = null;

        this.canvas = null;
        this.canvasContext = null;
        this.cameraId = null;
    }
}