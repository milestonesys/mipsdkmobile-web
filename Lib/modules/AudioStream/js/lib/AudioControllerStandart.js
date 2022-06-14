import { AudioControllerPrototype as controller, AudioControllerInterface as audioInterface } from './AudioControllerPrototype.js';

let AudioControllerPrototype = controller;
let AudioControllerInterface = audioInterface;

var AudioControllerStandart = function (params) {
    var noAvailableMics = XPMobileSDK.library.AudioAvailability.noAvailableMics(params.microphones);
    var noAvailableSpeakers = XPMobileSDK.library.AudioAvailability.noAvailableSpeakers(params.speakers);

    if (!params.player || (noAvailableMics && noAvailableSpeakers)) {
        return new AudioControllerInterface();
    }

    AudioControllerPrototype.call(this, params);

    var self = this;
    var currentTime = 0;

    this.initialize = function () {

        this.player.addEventListener('error', this.onNetworkError, false);
        this.player.addEventListener('ended', onEnded, false);
        this.player.addEventListener('pause', this.stopAudioStream, false);
        this.player.addEventListener('stop', this.stopAudioStream, false);
        this.player.addEventListener('canplay', onCanPlay, false);

        // This is needed for FF as this event is fired when switching from All cameras view to Single camera view
        // while audio is playing. In this case canplay event is not fired and audio does not start.
        this.player.addEventListener('suspend', onCanPlay, false);
    }.bind(this);

    var onEnded = function () {
        this.onNetworkError(null, true);
    }.bind(this);

    var onCanPlay = function (event) {
        var playPromise = this.player.play();

        if (playPromise !== undefined) {
            playPromise.catch(onPlayError).then(onPlaySuccess);
        }

        if (this.isLive) {
            // If after 3 seconds stream has not yet started, close stream and show error message
            this.timeoutOnStartStream = setTimeout(function () {
                if (!self.player.played.length && !self.player.buffered.length && self.audioActive) {
                    self.onTimeoutNoDataReceived();
                }
            }, 3000);
        }
    }.bind(this);

    var onPlayError = function (error) {
        // Auto-play was prevented
        this.cleanUp();

        if (error.name == "NotSupportedError") {
            this.onError("NotSupportedError");
        }

    }.bind(this);

    var onPlaySuccess = function () {

        if (!this.audioActive) {
            this.pause();
            this.cleanUp();
        }
    }.bind(this);
};

export default AudioControllerStandart;