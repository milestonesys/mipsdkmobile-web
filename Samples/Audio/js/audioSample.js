(function (undefined) {
    var audioSourceUrl,
        lastSignalType;

    var PlaybackAudioAPIController = function () {
        var self = this,
            audioStreamId,
            url,
            sourceBuffer;

        self.mediaSource = new MediaSource;
        self.container;
        self.audioPlayer;

        function init(event) {
            var cameraItem = event.detail.cameraItem;
            self.container = event.detail.cameraContainer;
            self.audioPlayer = document.createElement('audio');
            self.audioPlayer.type = 'audio/mpeg';

            self.container.appendChild(self.audioPlayer);
            self.mediaSource.addEventListener("sourceopen", sourceOpen);
            self.mediaSource.addEventListener("sourceended", signalEndOfStream);
            self.audioPlayer.addEventListener("pause", stopAudioStream);
            self.audioPlayer.addEventListener("stop", stopAudioStream);
            self.audioPlayer.addEventListener('canplay', onCanPlay, false);

            self.container.addEventListener('playStream', function (event) {
                tryStopStreaming(self.container, self.audioPlayer);
                audioStreamId = tryCloseStream(audioStreamId);

                requestAudioStream(event, cameraItem, audioStreamSuccessCallback);
            });

            self.container.addEventListener('pauseStream', function (event) {
                tryStopStreaming(self.container, self.audioPlayer);
                audioStreamId = tryCloseStream(audioStreamId);

                event.currentTarget.classList.remove('audio-playing');
            });

        }

        function audioStreamSuccessCallback(audioConnection) {
            audioStreamId = audioConnection.response.outputParameters.StreamId;
            url = audioSourceUrl + audioStreamId;

            self.audioPlayer.src = URL.createObjectURL(self.mediaSource);
        }

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

        var onCanPlay = function (event) {
            var playPromise = self.audioPlayer.play();

            if (playPromise !== undefined) {
                playPromise.catch(onPlayError);
            }
        }

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

        }

        var stopAudioStream = function () {
            if (!this.audioActive) {
                return;
            }

            this.audioActive = false;

            var sourceBufferedLength = sourceBuffer ? sourceBuffer.buffered.length : 0;

            if (self.mediaSource.readyState == "open") {
                sourceBuffer.abort();
                self.mediaSource.removeSourceBuffer(sourceBuffer);

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

        }

        var signalEndOfStream = function (error) {
            // Fix for Edge because in that browser events for errors are not fired like in other browsers. 
            if (error && error.message && error.message == "Failed to read.") {
                onPlayError(error);
            }

            // signal end of stream to 'mediaSource'
            if (self.mediaSource.readyState == 'open') {
                self.mediaSource.endOfStream();
            }

            return self.mediaSource.readyState;
        }

        var sourceOpen = function (event) {
            sourceBuffer = self.mediaSource.addSourceBuffer("audio/mpeg")
            sourceBuffer.mode = "sequence";

            fetchWithTimeout(3000, fetch(url), self.isLive)
                .then(getReader)
                .then(playStream)
                .catch(onPlayError);
        };

        var getReader = function (response) {

            if (response.status != 200) {
                throw new TypeError();
            }

            resBody = response.body;
            resBodyReader = response.body.getReader();

            return resBodyReader;
        }

        var playStream = function (reader) {

            var processStream = function (data) {

                if (data.done) {
                    return;
                }

                if (self.mediaSource.readyState == "open") {
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


        }

        return {
            init: init
        };
    }

    var PlaybackAudioController = function () {
        var self = this,
            audioStreamId;

        self.container;
        self.audioPlayer;

        function playAudio() {
            var playPromise = self.audioPlayer.play();

            if (playPromise !== undefined) {
                playPromise.catch(function (e) {
                    // Auto-play was prevented
                    // Show a UI element to let the user manually start playback
                    console.error(e);
                }).then(function (e) {
                    // Auto-play started
                    console.warn(e);
                });
            }
        }

        function audioStreamSuccessCallback(audioConnection) {

            audioStreamId = audioConnection.response.outputParameters.StreamId;
            self.audioPlayer.src = audioSourceUrl + audioStreamId;

            playAudio();
        }

        function init(event) {
            var cameraItem = event.detail.cameraItem;
            self.container = event.detail.cameraContainer;
            self.audioPlayer = document.createElement('audio');
            self.audioPlayer.type = 'audio/mpeg';

            self.container.appendChild(self.audioPlayer);

            playAudio();

            self.container.addEventListener('playStream', function (event) {
                tryStopStreaming(self.container, self.audioPlayer);
                audioStreamId = tryCloseStream(audioStreamId);

                requestAudioStream(event, cameraItem, audioStreamSuccessCallback);
            });

            self.container.addEventListener('pauseStream', function (event) {
                tryStopStreaming(self.container, self.audioPlayer);
                audioStreamId = tryCloseStream(audioStreamId);

                event.currentTarget.classList.remove('audio-playing');
            });
        }

        return {
            init: init
        };
    };

    function tryCloseStream(audioStreamId) {
        // Close stream and reset variable
        if (audioStreamId == null) {
            return audioStreamId;
        }

        XPMobileSDK.closeStream(audioStreamId);

        audioStreamId = null;

        return audioStreamId;
    }

    function tryStopStreaming(container, audioPlayer) {
        // Stop stream and reset variable
        container.classList.remove('audio-playing');

        try {
            audioPlayer.pause();
        }
        catch (e) { }
    }

    function requestAudioStream(event, camera, audioStreamSuccessCallback) {
        var container = event.currentTarget;
        var signalTypeId = XPMobileSDK.interfaces.VideoConnectionSignal[event.detail.videoConnection.request.parameters.SignalType.toLowerCase()];
        var isSignalTypePlayback = signalTypeId == XPMobileSDK.interfaces.VideoConnectionSignal.playback;

        if (!(lastSignalType == 'Playback' && !isSignalTypePlayback) &&
            ((lastSignalType == 'Live' && isSignalTypePlayback) || container.classList.contains('audio-playing'))) {

            container.classList.remove('audio-playing');

            lastSignalType = event.detail.videoConnection.request.parameters.SignalType;

            return;
        }

        container.classList.add('audio-playing');

        lastSignalType = event.detail.videoConnection.request.parameters.SignalType;

        XPMobileSDK.requestAudioStream(camera.Items[0].Id, {
            signal: signalTypeId,
            playbackControllerId: isSignalTypePlayback ? event.detail.videoConnection.videoId : null
        }, audioStreamSuccessCallback, audioStreamErrorCallback);
    }

    function audioStreamErrorCallback(error) {
        console.error('Audio stream error: ' + error.code + '|' + error.message);
    };

    function removeCameraWithoutAudio(event) {
        var cameraItem = event.detail.cameraItem;
        var cameraContainer = event.detail.cameraContainer;
        var microphones = cameraItem.Items.filter(function (item) {
            return item.Type == 'Microphone';
        });

        // For the purposes of this demo
        // Do not show cameras without audio
        if (!microphones.length) {
            event.detail.cameraContainer.parentNode.removeChild(cameraContainer);
            return true;
        }
        return false;
    }

    function connectionDidLogIn() {
        // Check if SupportsAudio is enabled
        if (!XPMobileSDK.features.SupportsOutgoingAudio) {
            alert('SupportsAudio is false!');

            return;
        }

        audioSourceUrl = window.location.origin + XPMobileSDKSettings.audioChannel + '/';

        var container = document.getElementById('streams-container');

        container.addEventListener('cameraElementAdded', function (event) {
            var isRemoved = removeCameraWithoutAudio(event);

            if (isRemoved) {
                return;
            }

            var audio;

            if ('MediaSource' in window
                && window.MediaSource
                && MediaSource.isTypeSupported('audio/mpeg')
                && 'ReadableStream' in window) {
               audio = new PlaybackAudioAPIController();
            } else {
                audio = new PlaybackAudioController();
            }
            
            audio.init(event);
        });

        Application.connectionDidLogIn(container);
    }

    function volumeControl() {
        document.getElementById('volume-control').addEventListener('change', function (event) {
            var volume = event.currentTarget.value;
            var audioTags = document.querySelectorAll('.camera audio');

            if(!audioTags) {
                return;
            }

            for (var a = 0; a < audioTags.length; a++) {
                audioTags[a].volume = volume / 100;
            }
        });
    }

    window.addEventListener('load', function () {
        var params = {
            connectionDidLogIn: connectionDidLogIn
        };

        LoginManager.loadAndLogin(params);

        volumeControl();
    });
})();