(function (undefined) {

    var microphoneSampleRate = 48000;

    var getMicSampleRate = function () {
        return microphoneSampleRate;
    };

    var getResampleRatio = function () {
        var desiredSampleRate = 8000;
        var rawSampleRatio = microphoneSampleRate / desiredSampleRate;
        var roundedSampleRatio = Math.floor(rawSampleRatio);

        return roundedSampleRatio;
    };

    var getOutputSampleRate = function () {
        var resampleRatio = getResampleRatio();
        var outputSampleRate = microphoneSampleRate / resampleRatio;

        return outputSampleRate;
    };

    var PushToTalkController = function () {
        var self = this,
            pttStreamId,
            lastSignalType,
            stream;

        self.container;
        self.pttButton;
        self.itemIds = [];

        var connection = null;
        var streamActive = false;
        var audioCtx = null;
        var audioSourceNode = null;
        var recorder = null;
        var numberOfPendingRequests = 0;
        var numberOfCloseConnectionAttempts = 0;

        var resampledInput,
            inputPcmData,
            output16Bit,
            outputByteArray,
            resamplerRatio;

        var isConnectionOpen = function () {
            return !!connection && connection.isOpen();
        }

        var onError = function (error) {
            alert('Error occured');
            console.error(error);

            streamActive = false;
        }.bind(this);

        var handleErrorCode = function (errorCode, ajaxRequest) {
            if (errorCode == XPMobileSDK.library.ConnectionError.InsufficientUserRights ||
                errorCode == XPMobileSDK.library.ConnectionError.ItemNotPlayable ||
                errorCode == XPMobileSDK.library.ConnectionError.SurveillanceServerDown) {

                stopPtt(true);
                connection = null;

                onError({
                    code: errorCode,
                    ajaxRequest: ajaxRequest
                });
            }
        };

        var tryClosingConnection = function (forceStop) {
            numberOfCloseConnectionAttempts++;

            if (forceStop || numberOfPendingRequests <= 0 || numberOfCloseConnectionAttempts > 10) {
                numberOfPendingRequests = 0;
                numberOfCloseConnectionAttempts = 0;

                connection.close();

                return;
            }

            setTimeout(function () {
                tryClosingConnection();
            }, 500);
        };

        var onAudioPushConnection = function (ajaxRequest) {
            numberOfPendingRequests--;

            if (!streamActive) {
                return;
            }

            if (!!ajaxRequest.response && !!ajaxRequest.response.byteLength) {
                var streamInfo = new XPMobileSDK.library.AudioHeaderParser(ajaxRequest.response);

                if (!!streamInfo.errorCodes && !!streamInfo.errorCodes.length) {
                    for (var a = 0; a < streamInfo.errorCodes.length; a++) {
                        handleErrorCode(streamInfo.errorCodes[a]["code"], ajaxRequest);
                    }
                }
            }
        };

        var onAudioPushConnectionError = function (ajaxRequest) {
            numberOfPendingRequests--;

            stopPtt(true);
            connection = null;

            onError(ajaxRequest);
        };

        var connect = function () {
            if (connection) return;

            var outputSampleRate = getOutputSampleRate();

            connection = XPMobileSDK.createAudioPushConnection(self.itemIds, outputSampleRate, onAudioPushConnection, onAudioPushConnectionError);
        };

        var onConnectionOpenSuccess = function () {
            const constraints = {
                audio: true,
                video: false
            };

            navigator.mediaDevices.getUserMedia(constraints).then(gotStream).catch(gotStreamError);
        };

        var onConnectionOpenError = function (error) {
            onError(error);
        };

        var startPtt = function () {
            if (!connection) {
                connect();
            }

            connection.open(onConnectionOpenSuccess, onConnectionOpenError);
            numberOfPendingRequests = 0;
            numberOfCloseConnectionAttempts = 0;

            streamActive = true;

            self.pttButton.classList.add("recording");
        };

        var stopPtt = function (forceStop) {

            self.pttButton.classList.remove("recording");

            if (!streamActive) {
                return;
            }

            if (stream) {
                stream.getTracks().forEach(function (track) {
                    track.stop();
                });
                stream = null;
            }

            streamActive = false;

            if (audioSourceNode && recorder) {
                audioSourceNode.disconnect(recorder);
                recorder.disconnect(audioCtx.destination);
                audioSourceNode = null;
                recorder = null;
            }

            if (!!audioCtx && !!audioCtx.close) {
                audioCtx.close().catch(function () {});
            }

            tryClosingConnection(forceStop);
        };

        var gotStream = function (newStream) {
            if (!streamActive) {
                return;
            }

            stream = newStream;

            audioCtx = new AudioContext();

            var bufferSize = 2048;//256, 512, 1024, 2048, 4096, 8192, 16384

            audioSourceNode = audioCtx.createMediaStreamSource(stream);

            recorder = audioCtx.createScriptProcessor(bufferSize, 1, 1);
            recorder.onaudioprocess = recorderProcess;

            audioSourceNode.connect(recorder);
            recorder.connect(audioCtx.destination);
        };

        var gotStreamError = function (error) {
            stopPtt();

            onError(error);
        };

        function resampleInputData(inputData) {
            resamplerRatio = getResampleRatio();

            resampledInput = new Float32Array(inputData.length / resamplerRatio);

            for (var i = 0, r = 0; i < inputData.length; i++, r += resamplerRatio) {
                resampledInput[i] = inputData[r];
            }
        }

        var recorderProcess = function (event) {
            if (!streamActive) {
                return;
            }

            numberOfPendingRequests++;

            inputPcmData = event.inputBuffer.getChannelData(0);

            resampleInputData(inputPcmData);
            output16Bit = convertFloat32ToInt16(resampledInput);
            outputByteArray = convertInt16toByteArray(output16Bit);

            connection.send(outputByteArray);
        };

        function convertInt16toByteArray(buffer) {
            var bufferLength = buffer.length;
            var outputBuffer = new Int8Array(bufferLength * 2);

            for (var a = 0, b = 0; a < bufferLength; a++, b += 2) {
                outputBuffer[b] = buffer[a] & 0xFF;
                outputBuffer[b + 1] = buffer[a] >> 8;
            }

            return outputBuffer;
        }

        function convertFloat32ToInt16(buffer) {
            var bufferLength = buffer.length;
            var outputBuffer = new Int16Array(bufferLength);

            while (bufferLength--) {
                outputBuffer[bufferLength] = Math.min(1, buffer[bufferLength]) * 0x7FFF;
            }

            return outputBuffer;
        }

        var onButtonClick = function (e) {
            e.stopPropagation();
            e.preventDefault();
        };

        var onPauseStream = function (event) {
            self.pttButton.style.display = 'none';

            stopPtt();
        };

        var onPlayStream = function (event) {
            var signalTypeId = XPMobileSDK.interfaces.VideoConnectionSignal[event.detail.videoConnection.request.parameters.SignalType.toLowerCase()];
            var isSignalTypePlayback = signalTypeId == XPMobileSDK.interfaces.VideoConnectionSignal.playback;

            if (isSignalTypePlayback) {
                self.pttButton.style.display = 'none';
            }
            else {
                self.pttButton.style.display = 'block';
            }
        };

        function init(event) {
            
            var cameraItem = event.detail.cameraItem;

            self.container = event.detail.cameraContainer;

            var speakers = cameraItem.Items.filter(function (item) {
                return item.Type == 'Speaker';
            });

            // For the purposes of this demo
            // Do not show cameras without speakers
            if (!speakers.length) {
                self.container.parentNode.removeChild(self.container);

                return;
            }

            

            self.itemIds.push(speakers[0].Id);

            self.pttButton = document.createElement('button');
            self.pttButton.innerHTML = "Push To Talk";
            self.pttButton.classList.add("ptt");
            self.pttButton.style.display = 'none';
            self.pttButton.addEventListener("mousedown", startPtt);
            self.pttButton.addEventListener('mouseup', stopPtt);
            self.pttButton.addEventListener('mouseleave', stopPtt);
            self.pttButton.addEventListener('click', onButtonClick);
            self.container.appendChild(self.pttButton);

            self.container.addEventListener('playStream', onPlayStream);
            self.container.addEventListener('pauseStream', onPauseStream);
        }

        return {
            init: init
        };
    };

    function connectionDidLogIn() {
        // Check if feature is enabled
        if (!XPMobileSDK.features.SupportsIncomingAudio) {
            alert('SupportsPushToTalk is false!');

            return;
        }

        var bufferSize = 2048;
        var audioCtx,
            stream,
            audioSourceNode,
            recorder;

        var stopTestRecording = function () {
            if (stream) {
                stream.getTracks().forEach(function (track) {
                    track.stop();
                });
                stream = null;
            }

            if (audioSourceNode != null && recorder != null) {
                audioSourceNode.disconnect(recorder);
                recorder.disconnect(audioCtx.destination);
                audioSourceNode = null;
                recorder = null;
            }

            if (!!audioCtx && !!audioCtx.close) {
                audioCtx.close();
            }
        };

        var recorderProcess = function (event) {
            microphoneSampleRate = event.inputBuffer.sampleRate;

            stopTestRecording();
        };

        var gotStreams = function (newStream) {

            /********** Get sample rate **************/

            stream = newStream;
            audioCtx = new AudioContext();
            audioSourceNode = audioCtx.createMediaStreamSource(stream);
            recorder = audioCtx.createScriptProcessor(bufferSize, 1, 1);

            recorder.onaudioprocess = recorderProcess;

            audioSourceNode.connect(recorder);
            recorder.connect(audioCtx.destination);

            // When the buffer source stops playing, disconnect everything
            audioSourceNode.onended = stopTestRecording;


            /********** Add camera **************/

            var container = document.getElementById('streams-container');

            container.addEventListener('cameraElementAdded', function (event) {
                var pttController = new PushToTalkController();

                pttController.init(event);
            });

            Application.connectionDidLogIn(container);
        };

        var onError = function (error) {
            alert('You must allow browser to access microphones!');
            console.error(error);
        }.bind(this);

        navigator.mediaDevices.getUserMedia({ audio: true, video: false }).then(gotStreams).catch(onError);
    }

    window.addEventListener('load', function () {
        var params = {
            connectionDidLogIn: connectionDidLogIn
        };

        LoginManager.loadAndLogin(params);
    });
})();