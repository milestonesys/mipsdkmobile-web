import AudioStream from './AudioStream.js';

var AudioControllerInterface = function (params) {

    this.initialize = function () { };

    this.pause = function () { };

    this.onStreamRequestSuccess = function (sourceURL) { };

    this.onError = function (message) { };

    this.onNetworkError = function (event, forceDisplayError) { };

    this.onPromiseReject = function (error) { };

    this.onTimeoutNoDataReceived = function () { };

    this.startAudioStream = function () { };

    this.stopAudioStream = function (event) { };

    this.cleanUp = function () { };

    this.isAudioActive = function () {
        return false;
    };

    this.switchToPlayback = function (playbackControllerId) { };

    this.switchToLive = function () { };

    this.setDisabled = function (isDisabled) { };

    this.setAudioStreamOption = function (option, value) { };

    this.onStreamRequestSuccessCallback = function (value) { };

    /**
    * Executes to clean up all of the audio parameters.
    */
    this.destroy = function () { };
};

var AudioControllerPrototype = function (params) {
    var noAvailableMics = XPMobileSDK.library.AudioAvailability.noAvailableMics(params.microphones);
    var noAvailableSpeakers = XPMobileSDK.library.AudioAvailability.noAvailableSpeakers(params.speakers);

    if (!params.player || (noAvailableMics && noAvailableSpeakers)) {
        return new AudioControllerInterface();
    }

    var self = this;

    this.timeoutOnStalled = null;
    this.timeoutOnTimeUpdate = null;

    var microphoneData = noAvailableMics ? {} : params.microphones[0];
    var speakersData = noAvailableSpeakers ? {} : params.speakers[0];

    this.onErrorCallback = () => { };
    this.isVisible = () => { };
    this.onPlayingCallback = () => { };
    this.onStalledCallback = () => { };
    this.onButtonStateChanged = () => { };

    this.audioSource = '';

    if (params.isVisible) {
        this.isVisible = params.isVisible;
    }

    if (params.onPlayingCallback) {
        this.onPlayingCallback = params.onPlayingCallback;
    }

    if (params.onStalledCallback) {
        this.onStalledCallback = params.onStalledCallback;
    }

    if (params.onButtonStateChanged) {
        this.onButtonStateChanged = params.onButtonStateChanged;
    }

    var initialize = function () {

        this.audioButtonElement = params.audioButtonElement;
        this.onStartCallback = params.onStart;
        this.onStopCallback = params.onStop;

        this.isLive = params.isLive;

        this.setAudioActive(false);

        if (XPMobileSDKSettings.enablePlaybackAudioSourceSelection) {
            this.selectAudioSource = params.audioSourceDropDown;
            this.selectAudioSource.addEventListener('change', audioSourceChanged);
        }
        if (!this.audioStream) {
            var options = {
                signal: params.signal,
                playbackControllerId: params.playbackControllerId,
                audioSource: this.applyStoredAudioSource()
            };

            if (params.AudioCompressionLevel) {
                options.AudioCompressionLevel = params.AudioCompressionLevel;
            }

            this.audioStream = new AudioStream(microphoneData, this.audioButtonElement, options, speakersData);
            this.audioStream.requestStreamCallback = requestStreamCallback;
        }

        enableButton();

        this.player = params.player;
        this.player.type = XPMobileSDK.library.AudioAvailability.mimecodec;
        this.player.preload = "none";
        this.player.autoplay = false;

        this.player.addEventListener("play", this.startAudioStream, false);
        this.player.addEventListener("stalled", onStalled, false);
        this.player.addEventListener("playing", onPlaying, false);

        document.addEventListener("onBeforeStartAudio", onBeforeAudioStarts.bind(this));
    }.bind(this);


    this.applyStoredAudioSource = function (aSource) {
        if (this.isLive || !XPMobileSDKSettings.enablePlaybackAudioSourceSelection) {
            return 'Microphone';
        }

        var storedAudioSource = aSource || this.audioSource || this.selectAudioSource.value;
        var optionAvailable = false;

        var options = this.selectAudioSource.options;

        options.forEach(opt => {
            if (opt.value == storedAudioSource && !opt.disabled) {
                optionAvailable = true;
            }
        });

        if (optionAvailable) {
            this.selectAudioSource.value = storedAudioSource;
        } else {
            for (var a = 0; a < options.length; a++) {
                if (!options[a].disabled) {
                    this.selectAudioSource.value = options[a].value;
                    break;
                }
            }
        }

        return storedAudioSource;
    };

    var audioSourceChanged = function (event) {

        if (this.isLive || !XPMobileSDKSettings.enablePlaybackAudioSourceSelection) {
            return;
        }

        if (!this.audioStream) {
            return;
        }

        var value = this.selectAudioSource.value;

        if (event.detail && event.detail.value) {
            value = event.detail.value;
        }

        this.setAudioStreamOption('audioSource', value);
        this.audioSource = value;

        if (!this.player.paused) {
            this.pause();

            setTimeout(this.playPauseAudioPlayer, 200);
        }
    }.bind(this);

    this.playPauseAudioPlayer = function () {
        if (this.player.paused) {
            this.play();
        } else {
            this.player.pause();
            this.onStopCallback && this.onStopCallback();
        }
    }.bind(this);

    this.play = function () {
        if (this.player.paused) {
            var playPromise = this.player.play();

            if (playPromise !== undefined) {
                playPromise.catch(this.onPromiseReject);
            }
            this.onStartCallback && this.onStartCallback();
        }
    }.bind(this);

    this.pause = function () {
        if (!this.player.paused) {
            this.player.pause();
        }
        this.onButtonStateChanged();
    }.bind(this);

    var requestStreamCallback = function (connectionRequest, error) {
        if (!this.audioButtonElement) {
            return;
        }

        if (connectionRequest) {
            this.onStreamRequestSuccess(window.location.origin + XPMobileSDKSettings.audioChannel + '/' + connectionRequest.response.outputParameters.StreamId);
        }
        else {
            if (error.code === XPMobileSDK.library.ConnectionError.InsufficientUserRights) {
                this.onError("InsufficientRights");
            } else {
                this.onError("NoAudioConnection");
            }
        }
    }.bind(this);

    this.onStreamRequestSuccess = function (sourceURL) {

        if (this.audioActive) {
            this.player.src = sourceURL;

            // Do not call this.player.play() here as it causes an unexpected random pause event to be fired in IE and Edge
            // Call this.player.play() on canplay event instead.
        } else {
            this.audioStream.stopStreaming();
            this.onButtonStateChanged();
        }

        this.onStreamRequestSuccessCallback && this.onStreamRequestSuccessCallback();

    }.bind(this);

    this.onError = function (error) {
        this.pause();
        this.cleanUp();

        this.audioStream.setToStopped();
        this.onButtonStateChanged();

        this.onErrorCallback(error);
    }.bind(this);

    this.onNetworkError = function (event, forceDisplayError) {

        // Do not display error message if audio button is already hidden
        // That means it was navigated to a page where this camera is already just a thumbnail and error message should not appear
        if (!this.isVisible()) {
            return;
        }

        if (event) {
            var targetPlayer = event.target;

            if ((!this.audioActive || targetPlayer !== this.player) && !forceDisplayError) {
                return;
            }

            this.pause();
            this.cleanUp();
        }

        this.onError("NetworkError");
    }.bind(this);

    this.onPromiseReject = function (error) {
        // Should do nothing. Fired, for example, when in Alarms page the user 
        // tries to start video and audio before the time of the event and then drags the timeline.

        // Workaround for browsers that throw "NotSupportedError" when src of audio element is set to empty string
        if (error.name === "NotSupportedError") {
            this.setAudioActive(false);
            this.startAudioStream();
        }

    }.bind(this);

    this.onTimeoutNoDataReceived = function () {
        this.pause();
        this.stopAudioStream();
        this.onNetworkError();
    };

    var onStalled = function (event) {
        if (this.isLive) {
            var playedBefore = this.player.played.length ? this.player.played.end(0) : 0;
            var bufferedBefore = this.player.buffered.length ? this.player.buffered.end(0) : 0;

            this.timeoutOnStalled = setTimeout(function () {
                var playedAfter = self.player.played.length ? self.player.played.end(0) : 0;
                var bufferedAfter = self.player.buffered.length ? self.player.buffered.end(0) : 0;

                if (playedBefore === playedAfter && bufferedBefore === bufferedAfter) {
                    self.onTimeoutNoDataReceived();
                }
            }, 3000);
        } else {
            this.onStalledCallback();
        }

    }.bind(this);

    var onPlaying = function (event) {
        this.onPlayingCallback();
    }.bind(this);

    /**
     * Executes to start audio.
     */
    this.startAudioStream = function () {
        if (!this.player || this.audioActive ||
            (noAvailableMics && !this.isLive && speakersData.Playback !== 'Yes') ||
            this.isDisabled) {
            return;
        }

        this.setAudioActive(true);

        Events.fire("onBeforeStartAudio", this);

        this.audioStream.startStreaming();
        this.onButtonStateChanged();
    }.bind(this);

    /**
     * Executes to stop audio.
     *
     * @param {Event} event Event object
     */
    this.stopAudioStream = function (event) {

        if (!this.player || !this.audioActive || this.isDisabled) {
            return;
        }

        this.cleanUp();

        this.audioStream.stopStreaming();
        this.onButtonStateChanged();

    }.bind(this);

    var onBeforeAudioStarts = function (event) {
        if (event.detail !== this) {
            this.stopAudioStream();
        }
    }.bind(this);

    this.cleanUp = function () {
        this.setAudioActive(false);

        if (this.timeoutOnStartStream) {
            clearTimeout(this.timeoutOnStartStream);
        }
        if (this.timeoutOnStalled) {
            clearTimeout(this.timeoutOnStalled);
        }
        if (this.timeoutOnTimeUpdate) {
            clearTimeout(this.timeoutOnTimeUpdate);
        }

        // this prevents thread leaks and crashes as removing all references to the audio tag
        // is not enough for the garbage collection of the audio stream to take place
        //this.player.src = '';
        this.player.removeAttribute('src');
        this.player.load();
    };

    var enableButton = function () {

        this.audioButtonElement.addEventListener('click', this.playPauseAudioPlayer);
        this.audioButtonElement.removeClassName('disabled');

        this.isDisabled = false;
    }.bind(this);

    var disableButton = function () {

        this.audioButtonElement.removeEventListener('click', this.playPauseAudioPlayer);
        this.audioButtonElement.addClassName('disabled');

        this.isDisabled = true;
    }.bind(this);

    this.isAudioActive = function () {
        return this.audioActive;
    };

    this.switchToPlayback = function (playbackControllerId, aSource) {
        if (!this.isLive) {
            return;
        }

        this.stopAudioStream();

        this.isLive = false;

        var audioSource = this.applyStoredAudioSource(aSource);

        this.setAudioStreamOption('audioSource', audioSource);
        this.setAudioStreamOption('signal', XPMobileSDK.interfaces.VideoConnectionSignal.playback);
        this.setAudioStreamOption('playbackControllerId', playbackControllerId);
    }.bind(this);

    this.switchToLive = function () {
        if (this.isLive) {
            return;
        }

        this.stopAudioStream();

        this.isLive = true;

        if (noAvailableMics) {
            return;
        }

        this.setAudioStreamOption('audioSource', 'Microphone');
        this.setAudioStreamOption('signal', XPMobileSDK.interfaces.VideoConnectionSignal.live);
        this.setAudioStreamOption('playbackControllerId', null);
    }.bind(this);

    this.setDisabled = function (isDisabled) {
        if (isDisabled) {

            this.pause();

            // We call this here because the one called on player.pause event executes too late
            this.stopAudioStream();

            disableButton();
        } else {
            enableButton();
        }
    }.bind(this);

    this.setAudioStreamOption = function (option, value) {
        this.audioStream.setOption(option, value);
    };

    this.setAudioActive = function (value) {
        this.audioActive = value;
    };

    /**
    * Executes to clean up all of the audio parameters.
    */
    this.destroy = function () {
        if (!this.player) {
            return;
        }

        this.stopAudioStream();

        if (this.audioStream) {
            this.audioStream.destroy();
        }

        this.setAudioActive(false);

        this.selectAudioSource.removeEventListener('change', audioSourceChanged);

        document.removeEventListener("onBeforeStartAudio", onBeforeAudioStarts.bind(this));
    }.bind(this);

    initialize();
};

//export default AudioControllerPrototype;

export { AudioControllerPrototype, AudioControllerInterface };