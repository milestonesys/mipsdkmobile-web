export default class VideoElement {
    constructor(videoElement, mediaSource, cameraId) {
        this.videoStuckTimeout = null;

        this.onDestroy = function () { };
        this.onPlayerStarted = function () { };
        this.onPlayerEnded = function () { };
        this.cameraId = cameraId;

        this.bufferSeekInterval = 2;
        this.isVideoStuck = false;

        this.videoElement = videoElement;
        this._onCanPlayThrough = this.onCanPlayThrough.bind(this);
        this._onPlay = this.onPlay.bind(this);
        this._onEnded = this.onEnded.bind(this);

        this.videoElement.preload = "none";

        this.videoElement.addEventListener('canplaythrough', this._onCanPlayThrough, false);
        //this.videoElement.addEventListener('play', this._onPlay, false); //Removed for now until we decide if we need to calculate the buffer time
        this.videoElement.addEventListener('ended', this._onEnded, false);
        this.videoElement.addEventListener('playing', this.onPlaying.bind(this), false);
        this.videoElement.addEventListener('stalled', () => {this.play(1000)}, false);


        this.videoElement.src = window.URL.createObjectURL(mediaSource);
    }

    onPlaying(event) {
        this.play();
    }


    onPlay(event) {
        let bufferTime = (new Date().getTime() - this.startDate) / 1000;
        if (Math.ceil(bufferTime) > this.bufferSeekInterval) {
            this.bufferSeekInterval = Math.ceil(bufferTime) + 2; // Set the seek interval to be 2 seconds more than the time the player needs to buffer the video before playing
        }
        this.videoElement.removeEventListener('play', this._onPlay, false);
    }

    onCanPlayThrough() {
        this.play();

        this.videoElement.removeEventListener('canplaythrough', this._onCanPlayThrough, false);

        this.onPlayerStarted();
    }

    onEnded() {
        this.play(1000);
        // Kepp the restart logic for now in case we have to go back to it in this release
        //this.onPlayerEnded();
    }


    onPlayPromiseReject(event) {
        // do nothing for now
        // This gets rid of "DOMException: The play() request was interrupted by a call to pause()."
    }

    play(timeout = 0) {
        setTimeout(() => {
            let playPromise = this.videoElement.play();

            if (playPromise !== undefined) {
                playPromise.catch(this.onPlayPromiseReject.bind(this));
            }
        }, timeout);
    }

    sync() {
        if (!this.startDate) {
            this.startDate = Date.now();
        }

        try {
            // Set the current video time to be no more than 2 seconds behind the buffered
            if ((!this.isVideoStuck
                && this.bufferSeekInterval
                && this.videoElement.currentTime > this.bufferSeekInterval
                && this.videoElement.buffered.end(0) > this.videoElement.currentTime + this.bufferSeekInterval)
                || document.hidden /*Check if browser is on focus*/) {

                this.videoElement.currentTime = this.videoElement.buffered.end(0) - 1;

                if (this.videoElement.paused === true) {
                    this.play();
                }
            }
        } catch (e) {
            console.log(e);
        }
    }

    destroy(keepVideoConnection) {
        this.videoElement.pause();

        // This fixes browser memory leak
        if (!keepVideoConnection) {
            // Fix for the "green screen" bug. 
            // Allows time for DOM manipulations (hide video element) to be done prior to cleaning the src
            setTimeout(function () {
                this.videoElement.src = "";
            }.bind(this), 3);
        } else {
            this.videoElement.src = "";
        }

        this.videoElement.removeEventListener('ended', this._onEnded);
    }
}