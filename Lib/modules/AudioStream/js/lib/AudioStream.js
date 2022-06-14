var AudioStream = function (microphoneData, element, options, speakerData) {
    var options = options || {};
    var streamIds = [];
    var stream;

    this.data = microphoneData;
    this.element = element;

    this.requestStreamCallback = function () { };

    var selectStreamIds = function () {
        var speakerId = speakerData.Playback == 'Yes' ? speakerData.Id : null;
        var selectedAudioSource = options['audioSource'];
        var microphoneId = this.data['Id'];

        streamIds = [];

        switch (selectedAudioSource) {
            case 'Microphone': {
                streamIds = this.data['Id'];
            } break;
            case 'Speaker': {
                streamIds = !!speakerId ? speakerId : microphoneId;
            } break;
            default: {
                if (!!microphoneId) {
                    streamIds.push(microphoneId);
                }

                if (!!speakerId) {
                    streamIds.push(speakerId);
                }
            } break;
        }
    }.bind(this);

    var requestStream = function () {
        selectStreamIds();

        stream = XPMobileSDK.requestAudioStream(streamIds, options, this.requestStreamCallback, null);
    }.bind(this);

    var closeStream = function () {
        if (stream.response) {
            XPMobileSDK.closeAudioStream(stream.response.outputParameters.StreamId);
        }
    };

    this.togglePlayingClass = function (play) {
        if (play) {
            this.element.addClassName('playing');
            this.element.setAttribute('part', 'audioButton playing');
        }
        else {
            this.element.removeClassName('playing');
            this.element.setAttribute('part', 'audioButton');
        }

        // Edge redraw issue fix! (Microsoft Edge 42.17134.1.0)
        //this.element.appendChild(document.createTextNode(' '));
        var disp = this.element.style.display;
        this.element.style.display = 'none';
        var trick = this.element.offsetHeight;
        this.element.style.display = disp;
    };

    this.startStreaming = function () {
        this.togglePlayingClass(true);
        requestStream();
    };

    this.setOption = function (option, value) {
        options = options || {};
        options[option] = value;
    }.bind(this);

    this.setToStopped = function () {
        this.togglePlayingClass();
    }.bind(this);

    this.stopStreaming = function () {
        this.setToStopped();

        closeStream();
    };

    this.destroy = function () {
        this.requestStreamCallback = function () { };
    }.bind(this);
};

export default AudioStream;