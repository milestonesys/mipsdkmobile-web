import { AudioControllerPrototype as audioController, AudioControllerInterface as audioInterface } from './AudioControllerPrototype.js';

let AudioControllerPrototype = audioController;
let AudioControllerInterface = audioInterface;

var AudioControllerWebAudioAPI = function (params) {
    var noAvailableMics = XPMobileSDK.library.AudioAvailability.noAvailableMics(params.microphones);
    var noAvailableSpeakers = XPMobileSDK.library.AudioAvailability.noAvailableSpeakers(params.speakers);

    if (!params.player || (noAvailableMics && noAvailableSpeakers)) {
        return new AudioControllerInterface();
    }

    AudioControllerPrototype.call(this, params);

    var self = this;
    var mediaSource = new MediaSource;
    var sourceBuffer;
    var url;
    var resBodyReader;
    var resBody;
    var abortController;

    this.initialize = function () {

        mediaSource.addEventListener("sourceopen", sourceOpen);
        mediaSource.addEventListener("sourceended", signalEndOfStream);
        this.player.addEventListener("pause", stopAudioStream);
        this.player.addEventListener("stop", stopAudioStream);
        this.player.addEventListener('canplay', onCanPlay, false);

        this.stopAudioStream = stopAudioStream;
    }.bind(this);

    var sourceOpen = function (event) {

        sourceBuffer = mediaSource.addSourceBuffer(XPMobileSDK.library.AudioAvailability.mimecodec)
        sourceBuffer.mode = "sequence";

        abortController = new AbortController();
        var signal = abortController.signal;

        fetchWithTimeout(3000, fetch(url, { signal: signal }), self.isLive)
            // return 'ReadableStream' of 'response'
            .then(getReader)
            .then(playStream)
            .catch(onPlayError);
    };

    var fetchWithTimeout = function (ms, promise, toSetTimeout) {

        var didTimeOut = false;
        var fetchTimeout = false;

        var promiseCallback = function (resolve, reject) {
            if (toSetTimeout) {
                fetchTimeout = setTimeout(function () {
                    didTimeOut = true;
                    reject(new Error("fetch timed out"));
                }, ms);
            }

            var catchFunc = function (err) {
                // Rejection already happened with setTimeout
                if (didTimeOut) return;

                // Reject with error
                reject(err);
            };

            var thenFunc = function (response) {

                if (fetchTimeout) {
                    // Clear the timeout as cleanup
                    clearTimeout(fetchTimeout);
                }

                if (!didTimeOut) {
                    resolve(response);
                }
            };

            promise.then(thenFunc).catch(catchFunc);

        };

        return new Promise(promiseCallback);
    };

    var getReader = function (response) {

        if (response.status != 200) {
            throw new TypeError();
        }

        resBody = response.body;
        resBodyReader = response.body.getReader();

        return resBodyReader;
    }.bind(this);

    var playStream = function (reader) {

        var processStream = function (data) {

            if (data.done) {
                return;
            }

            if (mediaSource.readyState == "open") {
                // append chunk of stream to 'sourceBuffer'
                sourceBuffer.appendBuffer(data.value);
            }
        }

        // at 'sourceBuffer' 'updateend' call 'reader.read()',
        // to read next chunk of stream, append chunk to 
        // 'sourceBuffer'
        sourceBuffer.addEventListener("updateend", function () {
            reader.read().then(processStream).catch(signalEndOfStream);
        });

        // start processing stream
        reader.read().then(processStream);


        if (reader.closed) {
            // read of stream is complete
            return reader.closed.then(signalEndOfStream);
        }


    }.bind(this);

    var signalEndOfStream = function (error) {

        // Fix for Edge because in that browser events for errors are not fired like in other browsers. 
        if (error && error.message && error.message == "Failed to read.") {
            onPlayError(error);
        }

        // signal end of stream to 'mediaSource'
        if (mediaSource.readyState == 'open') {
            mediaSource.endOfStream();
        }

        return mediaSource.readyState;
    }.bind(this);

    var onPlayError = function (error) {
        if (!this.audioActive) {
            return;
        }

        stopAudioStream();

        if (error.name != "AbortError" && error.name != "InvalidStateError" && !this.stoppedByButtonClick) {
            this.onNetworkError();
        }

        if (error.name == "AbortError") {
            this.stoppedByButtonClick = true;
        } else {
            this.stoppedByButtonClick = false;
        }

    }.bind(this);

    this.onTimeoutNoDataReceived = function () {
        stopAudioStream();
        this.onNetworkError();
    };

    var stopAudioStream = function () {
        if (!this.audioActive) {
            return;
        }

        this.audioActive = false;

        var sourceBufferedLength = sourceBuffer && sourceBuffer.updating ? sourceBuffer.buffered.length : 0;

        abortController && abortController.abort();

        if (mediaSource.readyState == "open") {
            sourceBuffer.abort();
            mediaSource.removeSourceBuffer(sourceBuffer);

            // If sourceBufferedLength is 0 calling to mediaSource.endOfStream() causes an error and the player cannot be started again
            // Can be tested when player is started and then stopped during a video gap in playback mode
            if (sourceBufferedLength) {
                mediaSource.endOfStream();
            }
        }

        if (resBodyReader) {
            resBodyReader.cancel().catch(this.onPromiseReject);
            resBodyReader.releaseLock();
            resBody.cancel().catch(this.onPromiseReject);

            resBodyReader = null;
            resBody = null;
        }

        this.pause();

        this.cleanUp();

        this.audioStream.stopStreaming();

    }.bind(this);

    this.onStreamRequestSuccess = function (sourceURL) {
        url = sourceURL;

        this.player.src = URL.createObjectURL(mediaSource);
    }.bind(this);

    var onCanPlay = function (event) {
        var playPromise = this.player.play();

        if (playPromise !== undefined) {
            playPromise.catch(onPlayError);
        }
    }.bind(this);

    this.onPromiseReject = function (error) {
        // Do nothing. Fired, for example, when in Alarms page the user 
        // tries to start video and audio before the time of the event and then drags the timeline.
    }.bind(this);
}

export default AudioControllerWebAudioAPI;