XPMobileSDK.library.PushConnectionObserverInterface = {

    onError: function (request) { },
    onHTTPError: function (request) { },
    onPushFailed: function () { },
    notifyChannel: function (status) { },
    notifyObservers: function (item) { },
    videoConnectionTemporaryDown: function (status) { },
    restart: function () { }
};

XPMobileSDK.library.PushConnection = function (videoURL, options) {

    var socket;

    var signalType = options.signalType || null;

    var lastFrame = null; // Property that keeps the last frame received over the connection

    this.videoConnectionState = XPMobileSDK.library.VideoConnectionState.notOpened;

    var observers = [];

    var socketFailedTimestamp = null;

    this.startCommunication = function () {
        if (socket) {
            return;
        }

        if (socketFailedTimestamp) {

            if (Date.now() - socketFailedTimestamp < XPMobileSDKSettings.videoStreamRestartMinimumInterval) {
                setTimeout(function () {
                    logger.warn("Restarting socket.");
                    createSocket();
                }.bind(this), XPMobileSDKSettings.socketRestartMinimumInterval);
            }
            else {
                callMethodOnObservers('restart');
            }
        } else {
            createSocket();
        }
    }.bind(this);

    var createSocket = function () {

        try {
            socket = new WebSocket(videoURL);
        }
        catch (exception) {
            if (this.videoConnectionState == XPMobileSDK.library.VideoConnectionState.closed) {
                return;
            }
            logger.error('WebSocket initialization failed. Falling back to AJAX...');
            callMethodOnObservers('onPushFailed');
            return;
        }

        socket.binaryType = "arraybuffer";
        socket.onerror = function (exception) {
            callMethodOnObservers('onError', socket);
        };
        socket.onopen = onOpen;
        socket.onclose = function () {
            var socketReadyState = { readyState: socket.readyState, status: socket.status };
            socket = null;

            if (!socketFailedTimestamp) {
                socketFailedTimestamp = new Date();
            }
            
            callMethodOnObservers('onError', socketReadyState);

        }.bind(this);

    }.bind(this);

    this.restartConnection = function (request) {
        logger.warn("Restarting socket.");
        this.startCommunication();
    }.bind(this);

    this.close = function () {

        if (!socket) {
            return;
        }

        socket.onopen = null;
        socket.onmessage = null;
        socket.onerror = null;
        socket.onclose = null;

        socket.close();
        socket = null;

        if (this.messageInterval) {
            clearInterval(this.messageInterval);
            this.messageInterval = null;
        }

        logger.log('WebSocket closed');

    }.bind(this);


    var onOpen = function (event) {

        socket.onmessage = onMessage;
        socket.onerror = onError;
        socket.onclose = onClose;

        // Firefox fix: Close the socket on page refresh - in most other browsers the socket is closed automatically.
        // Without it the browser breaks and stops executing setTimeout/setInterval calls as well as CSS animations after refresh.
        window.addEventListener('beforeunload', this.close);

        this.messageInterval = setInterval(function () {
            if (socket) {
                socket.send("");
            }
        }, NETWORK.websocketSendMessage);

        callMethodOnObservers('notifyChannel', true);

        logger.log('WebSocket open');

    }.bind(this);

    var onMessage = function (event) {

        if (lastFrame) {
            delete lastFrame;
            lastFrame = null;
        }

        lastFrame = new XPMobileSDK.library.VideoHeaderParser(event.data);

        callMethodOnObservers('notifyObservers', lastFrame);

    }.bind(this);

    var onError = function (error) {

        logger.error('WebSocket error', error);

        if (this.messageInterval) {
            clearInterval(this.messageInterval);
            this.messageInterval = null;
        }

    }.bind(this);

    var onClose = function (event) {
        socket.onopen = null;
        socket.onmessage = null;
        socket.onerror = null;
        socket.onclose = null
        socket = null;

        if (this.messageInterval) {
            clearInterval(this.messageInterval);
            this.messageInterval = null;
        }
        if (this.videoConnectionState == XPMobileSDK.library.VideoConnectionState.running && XPMobileSDK.library.Connection.connectionId) {
            this.restartConnection();
            callMethodOnObservers('videoConnectionTemporaryDown');
        }

    }.bind(this);

    this.cleanupCommunication = function () {
        this.close();
    };

    this.videoConnectionChangedState = function (videoConnectionState) {
        this.videoConnectionState = videoConnectionState;
    };

    this.addObserver = function (observer) {
        observers.push(observer);
    };

    this.removeObserver = function (observer) {
        var index = observers.indexOf(observer);
        index != -1 && observers.splice(index, 1);
    };

    var callMethodOnObservers = function (method, arg) {
        observers.forEach(function (observer) {
            if (observer && observer[method]) {
                observer[method](arg);
            }
        });
    }.bind(this);

};
