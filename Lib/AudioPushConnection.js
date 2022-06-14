XPMobileSDK.library.AudioPushConnection = function (itemIds, sampleRate, successCallback, errorCallback) {

    this.open = open;
    this.close = close;
    this.send = send;
    this.destroy = destroy;
    this.isOpen = isOpen;

    var self = this;
    var headerSize = 36;
    var counter = 0;

    var callbacks = {
        onStreamSuccess: function (videoPushConnection) { },
        onStreamError: function (error) { },
        onAjaxLoading: function () { },
      onAjaxSuccess: function (videoPushConnection) { },
      onAjaxFailure: function () { logger.error('ERROR in ajax request for audio push'); }
    };

    var stream,
        streamRequest;

    initialize();

    function initialize() {
        callbacks.onAjaxSuccess = successCallback || callbacks.onAjaxSuccess;
        callbacks.onAjaxFailure = errorCallback || callbacks.onAjaxFailure;
    }

    function open(successCallback, errorCallback, onAjaxFailure) {
        callbacks.onStreamSuccess = successCallback || callbacks.onStreamSuccess;
        callbacks.onStreamError = errorCallback || callbacks.onStreamError;

        if (isOpen()) {
            return;
        }

        var options = {
            AudioSamplingRate: sampleRate || 8000,
            AudioBitsPerSample: 16
        };

        streamRequest = XPMobileSDK.requestAudioStreamIn(itemIds, options, streamRequestCallback, streamRequestErrorCallback);
    }

    function close() {
        if (!isOpen()) {
            return;
        }

        if (streamRequest) {
            XPMobileSDK.cancelRequest(streamRequest);
            streamRequest = null;
        }

        if (stream) {
            XPMobileSDK.closeStream(stream.StreamId);
            stream = null;
        }
    }

    function streamRequestCallback(parameters, error) {
        streamRequest = null;

        if (!parameters) {
            callbacks.onStreamError(error);
            return;
        }

        stream = parameters;
        callbacks.onStreamSuccess(self);
    }

    function streamRequestErrorCallback(error) {
        streamRequest = null;
        stream = null;

        callbacks.onStreamError(error);
    }

    function isOpen() {
        return stream || streamRequest;
    }

    function send(pcmData) {
        if (!stream) {
            return;
        }

        var buffer = new ArrayBuffer(headerSize + pcmData.length);
        var bufferView = new Int8Array(buffer);

        // Header
        bufferView.set(XPMobileSDK.library.Bytes.fromGuid(stream.StreamId, 16));				// Stream id
        bufferView.set(XPMobileSDK.library.Bytes.fromInt(new Date().getTime(), 8), 16);		// Timestamp
        bufferView.set(XPMobileSDK.library.Bytes.fromInt(++counter, 4), 24);				// Frame count
        bufferView.set(XPMobileSDK.library.Bytes.fromInt(pcmData.length, 4), 28);		// Frame size in bytes
        bufferView.set(XPMobileSDK.library.Bytes.fromInt(headerSize, 2), 32);				// Header size in bytes
        bufferView.set(XPMobileSDK.library.Bytes.fromInt(0, 2), 34);						// Header extension flags
        // Data
        bufferView.set(pcmData, headerSize);

        var url = XPMobileSDKSettings.MobileServerURL + XPMobileSDKSettings.audioChannel + '/' + stream.StreamId;

        var parameters = {
            method: 'post',
            //contentType: 'audio/webm',
            'Transfer-Encoding': 'chunked',
            contentType: 'arraybuffer',
            postBody: buffer,
            // postBody: bufferView,
            timeout: 2000,
            responseType: 'arraybuffer',
            onLoading: callbacks.onAjaxLoading,
            onSuccess: callbacks.onAjaxSuccess,
            onFailure: callbacks.onAjaxFailure,
            onTimeout: callbacks.onAjaxFailure
        };

        var ajaxRequest = new XPMobileSDK.library.Ajax.Request(url, parameters);
    }

    function destroy() {
        close();
    }
};