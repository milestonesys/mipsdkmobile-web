// This file defines objects related to video connection - including the VideoConnection class. 

/**
 * Video connection signal - live or playback.
 */
XPMobileSDK.library.VideoConnectionSignal = {
    live: 1, // Live signal from the camera
    playback: 2 // Playback signal from the camera
};

/**
 * The possible states of the video connection.
 */
XPMobileSDK.library.VideoConnectionState = {
    notOpened: 0, // Connection not opened yet
    running: 1, // Connection started and receiving frames
    closed: 2, // Connection has been closed and done with
    closing: 3 // Connection is currently closing
};

/**
 * The possible states of the video connection stream type.
 */
XPMobileSDK.library.VideoConnectionStream = {
    "native": 1, // Native video stream
    transcoded: 3, // Transcoded video stream
    FragmentedMP4: 4 // Direct streaming video
};

/**
 * Interface description for the observers of the VideoConnection singleton.
 * 
 * If an objects wants to be informed for a specific event (when a frame is received for example) they can register as an observer.
 * Registering an object as an observer for a VideoConnection instance is simple as calling videoConnection.addObserver(object).
 * Then, if the observer defines any of the methods described below, they will be called whenever it is appropriate.
 * 
 * All methods are optional. Just implement those you need in your class and add it as observer. 
 * 
 * @class VideoConnectionObserverInterface
 */
XPMobileSDK.library.VideoConnectionObserverInterface = {

    /**
	 * Called when new frame has arrived over the video connection
	 * 
	 * @method videoConnectionReceivedFrame
	 * @param {ItemHeaderParser} frame 
	 */
    videoConnectionReceivedFrame: function (frame) { },

    /**
	 * Called when an error has occurred during video streaming or in one of the internal control commands which has 
	 * resulted in closing the connection completely.
	 * 
	 * @method videoConnectionFailed
	 */
    videoConnectionFailed: function () { },

    /**
	 * Called when a HTTP error occurred
	 * 
	 * @method videoConnectionTemporaryDown
	 * @param {Number} errorCode - the HTTP error code returned from the server, or -1 if exception was thrown, or -2 if the request was aborted due to a missing response (happens more often on wireless networks)
	 */
    videoConnectionTemporaryDown: function (errorCode) { },

    /**
	 * Called after the connection is no longer down due to an HTTP error. 
	 */
    videoConnectionRecovered: function () { },

    /**
	 * Called if the state property of the connection has changed value.
	 * 
	 * @method videoConnectionChangedState
	 */
    videoConnectionChangedState: function () { },

    /**
	 * Called when the streaming technology is no longer available. 
	 */
    videoConnectionStreamingError: function () { }
};

/**
 * Video connection.
 * This class manages an established connection and handles receiving and parsing frames via the ItemHeaderParser class.
 * Do not create instances of that class directly. Instead call XPMobileSDK.requestStream to first prepare the connection to the
 * camera. In the callback you will receive instance of the prepared VideoConnection object ready to be opened. Then set
 * an observer object to receive frames, events and etc and just open the connection.
 * Video connections cannot be reused. Once closed it cannot be reopened. 
 * 
 * @class VideoConnection
 */
XPMobileSDK.library.VideoConnection = function (videoId, connectionRequest, callbacks) {

    XPMobileSDK.library.VideoConnection.instances.push(this);

    if (!callbacks) var callbacks = {};
    callbacks.onClose = callbacks.onClose || function (videoConnection) { };
    callbacks.onRestart = callbacks.onRestart || function (videoConnection) { };
    callbacks.onPushFailed = callbacks.onPushFailed || function () { };

    var self = this;

    var observers = [];
    var state = XPMobileSDK.library.VideoConnectionState.notOpened;

    self.request = {
        parameters: connectionRequest.params,
        options: connectionRequest.options
    };
    self.response = {
        parameters: connectionRequest.response.outputParameters
    };

    self.videoId = videoId;
    if (self.request.options) {
        self.cameraId = self.request.options.cameraId;
        self.signalType = self.request.options.signal;
        self.isReusable = self.request.options.reuseConnection;
    }
    self.isPush = self.request.parameters.MethodType == 'Push';
    self.isDirectStreaming = self.request.parameters.StreamType == 'FragmentedMP4';

    self.supportsPTZ = self.response.parameters.PTZ == 'Yes';
    self.supportsPTZPresets = self.response.parameters.Preset == 'Yes';
    self.supportsPlayback = self.response.parameters.Playback == 'Yes';
    self.supportsExport = self.response.parameters.ExportAvi == 'Yes';

    var lastData = null; // Property that keeps the last frame received over the connection
    var channel = new Channel(self.response.parameters);

    var connectionURL = channel.current;

    var noVideoTimeout = null;

    /**
	 * Opens the connection to start receiving frames. 
	 * 
	 * @method open
	 */
    this.open = function () {
        switch (state) {
            case XPMobileSDK.library.VideoConnectionState.notOpened:
                setState(XPMobileSDK.library.VideoConnectionState.running);
                if (window.Worker && XPMobileSDKSettings.supportsMultiThreaded) {
                    console.info('Opening multithreaded video connection ' + self.videoId + ' with Web Worker');
                    self.worker = new Worker("js/ThreadConnection.js");
                    self.worker.addEventListener('message', function (e) {
                        if (e.data.message == 'onPushFailed') {
                            callbacks.onPushFailed();
                        } else {
                            callMethodOnObservers(e.data.message, e.data.result);
                        }
                    }, false);
                    self.worker.postMessage({
                        'message': 'startCommunication',
                        'arguments': {
                            "url": connectionURL + '/' + self.videoId + '/',
                            "signalType": self.signalType,
                            "isPush": self.isPush
                        }
                    });
                }
                else {
                    if (self.isPush) {
                        console.info('Opening WebSocket video connection ' + self.videoId);
                        self.communication = new XPMobileSDK.library.PushConnection(connectionURL + '/' + self.videoId + '/', { 'signalType': self.signalType});
                    }
                    else {
                        console.info('Opening AJAX video connection ' + self.videoId);
                        self.communication = new XPMobileSDK.library.PullConnection(connectionURL + '/' + self.videoId + '/', { 'signalType': self.signalType});
                    }
                    self.communication.addObserver({
                        onError: onError,
                        onHTTPError: onHTTPError,
                        onPushFailed: onPushFailed,
                        notifyChannel: notifyChannel,
                        notifyObservers: notifyObservers,
                        videoConnectionTemporaryDown: videoConnectionTemporaryDown,
                        restart: self.restart
                    });
                    self.addObserver(self.communication);
                    self.communication.startCommunication();
                }
                callMethodOnObservers('videoConnectionChangedState', state);

                if (state == XPMobileSDK.library.VideoConnectionState.running) {
                    resetNoVideoTimeout();
                }

                break;
            case XPMobileSDK.library.VideoConnectionState.running:
                if (self.isReusable) {
                    console.info('Opening a reusable video connection from the pool ' + self.videoId);
                } else {
                    console.warn('WARNING: Attempting to open a running connection!');
                }
                resetNoVideoTimeout();
                break;
            case XPMobileSDK.library.VideoConnectionState.closed:
                console.warn('WARNING: Attempting to re-open a closed connection!');
                stopNoVideoTimeout();
                break;
        }
    };

    var resetNoVideoTimeout = function () {
        if (noVideoTimeout) {
            clearTimeout(noVideoTimeout);
        }

        noVideoTimeout = setTimeout(function () {
            callMethodOnObservers('noVideoTimeout');
        }, XPMobileSDKSettings.NoVideoTimeout);
    };

    var stopNoVideoTimeout = function () {
        if (noVideoTimeout) {
            clearTimeout(noVideoTimeout);
        }
    };

    /**
	 * Restarts the connection.
	 * 
	 * @method restart
	 */
    this.restart = function () {

        if (state == XPMobileSDK.library.VideoConnectionState.closed) return;

        console.warn('Restarting video connection ' + self.videoId + ' for camera ' + self.cameraId);
        setState(XPMobileSDK.library.VideoConnectionState.closed);
        callbacks.onRestart(self);

        cleanup();

    };

    /**
	 * Closes the connection.
	 * 
	 * @method close
	 */
    this.close = function () {

        stopNoVideoTimeout();

        if (state == XPMobileSDK.library.VideoConnectionState.closed ||
            state == XPMobileSDK.library.VideoConnectionState.closing) return;

        setState(XPMobileSDK.library.VideoConnectionState.closing);


        if (self.worker && XPMobileSDKSettings.supportsMultiThreaded) {
            self.worker.terminate();
        }
        console.log('Closing video connection ' + self.videoId + ' for camera ' + self.cameraId);
        setState(XPMobileSDK.library.VideoConnectionState.closed);
        callbacks.onClose(self);

        cleanup();

    };

    /**
	 * Adds an observer for the video connection.
	 * 
	 * @method addObserver
	 * @param observer Any object. Should implement methods from the VideoConnectionObserverInterface.
	 */
    this.addObserver = function (observer) {
        observers.push(observer);
    };

    /**
	 * Removes an observer for the video connection. 
	 * 
	 * @method removeObserver
	 * @param observer: any object implementing VideoConnectionObserverInterface that should not receive further notifications
	 */
    this.removeObserver = function (observer) {
        var index = observers.indexOf(observer);
        index != -1 && observers.splice(index, 1);
    };

    this.resetCommunication = function () {
        callMethodOnObservers('startCommunication');
    };

    /**
	 * Class destructor.
	 * 
	 * @method destroy
	 */
    this.destroy = function () {
        self.close();

        if (lastData) {
            lastData.destroy();
            lastData = null;
        }
        observers = [];

        if (self.isPush) return;

        onAjaxComplete = null;
        onAjaxFailure = null;
        onAjaxLoading = null;

        frameRequestParams = null;

        if (XPMobileSDK.library.VideoConnection.indexOf(this) != -1) {
            XPMobileSDK.library.VideoConnection.splice(XPMobileSDK.library.VideoConnection.indexOf(this), 1);
        }
    };

    function notifyObservers(item) {

        if (item.stream && item.stream.error) {
            switch (item.stream.error) {
                case XPMobileSDK.library.ItemHeaderParser.Error.NonFatal:
                    // Fallback to Transcoded streaming
                    self.request.parameters.StreamType = 'Transcoded';
                    self.restart();
                    break;
                case XPMobileSDK.library.ItemHeaderParser.Error.Fatal:
                    callMethodOnObservers('videoConnectionStreamingError');
                    self.close();
                    break;
            }
            return;
        }

        if (observers.length > 0) {
            callMethodOnObservers('videoConnectionReceivedFrame', item);

            resetNoVideoTimeout();

            if (self.wasConnectionDown) {
                self.wasConnectionDown = false;
                callMethodOnObservers('videoConnectionRecovered');
            }
        }
        else {
            console.warn('Video connection received an item but doesn\'t have observer to send it to!');
            self.close();
            return;
        }
    };

    function Channel(parameters) {

        this.connected = false;
        this.current;

        var channels = [];
        for (var i = 0, url; url = parameters['VideoChannel' + i]; i++) {
            channels.push(parseURL(url));
        }
        if (!channels.length) channels.push(parseURL(XPMobileSDKSettings.MobileServerURL + XPMobileSDKSettings.videoChanel));
        console.log('Available video channels: ', channels);

        this.getNext = function () {

            if (!this.connected) this.current = channels.shift();
            return this.current;

        }.bind(this);

        this.hasNext = function () {

            return !this.connected && channels.length;

        }.bind(this);

        this.getNext();

    };

    function notifyChannel(status) {
        channel.connected = status;
    };

    function cleanup() {
        callMethodOnObservers('cleanupCommunication');
        if (self.worker && XPMobileSDKSettings.supportsMultiThreaded) {
            self.worker.terminate();
            self.worker = null;
        }
    };

    function parseURL(url) {

        if (!/^(http|ws)(s)?:/i.test(url)) {
            var protocol = window.location.protocol + '//';
            var hostname = document.location.hostname;
            var port = document.location.port && !/^:\d+/.test(url) ? ':' + document.location.port : '';

            url = protocol + hostname + port + url;
        }
        return self.isPush ? url.replace(/^http(s)?:/i, 'ws$1:') : url.replace(/^ws(s)?:/i, 'http$1:');

    };

    /**
	 * Sets the state of the connection and calls the observer
	 */
    function setState(newState) {
        if (state == newState) return;
        state = newState;
        callMethodOnObservers('videoConnectionChangedState', state);
    };

    /**
	 * Get the state of the connection
	 */
    this.getState = function () {
        return state;
    };

    function onPushFailed() {
        callbacks.onPushFailed();
    };

    function onHTTPError(request) {
        channel.connected && CommunicationStability.addVideoBreakDown();
        onError(request);
    };

    function onError(request) {

        if (state == XPMobileSDK.library.VideoConnectionState.closed || XPMobileSDK.library.Connection.connectionId == null) {
            return;
        }
        var timeout = 0;

        if (!channel.connected) {
            if (channel.hasNext()) {
                console.log('Try next video channel.');
                connectionURL = channel.getNext();
            }
            else {
                callMethodOnObservers('videoConnectionNotAvailable');
                return;
            }
        }
        else {
            
            if (request.status) {
                if (request.status == 410) {
                    callMethodOnObservers('restartConnection', request);
                    return;
                } else {
                    videoConnectionTemporaryDown(request.status);
                }
            }
            else if (request.readyState && request.readyState == WebSocket.CLOSED) {
                // WebSocket error or unexpected closure
                // Do nothing. That callMethodOnObservers('startCommunication') below will restart the socket.
            }
            else if (request.status == 0 && (!request.response || request.response.byteLength === 0)) {
                // Broken AJAX responses
                videoConnectionTemporaryDown(request.status);
            }

        }

        callMethodOnObservers('startCommunication', NETWORK.requestTimeOnFailure);
    };

    function videoConnectionTemporaryDown(status) {
        self.wasConnectionDown = true;

        callMethodOnObservers('videoConnectionTemporaryDown', status);
    };

    function callMethodOnObservers(method, arg) {
        observers.forEach(function (observer) {        
            if (observer && observer[method]) {
                observer[method](arg);
            }
            if (self.worker) {
                self.worker.postMessage({ 'message': method, "arguments": arg });
            }
        });
    };
};

XPMobileSDK.library.VideoConnection.instances = [];
