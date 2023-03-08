/** 
 * Network API
 *
 * This file defines the Connection singleton, which is the entry point of the Network API.
 * It is an abstraction layer over the communication with the Mobile server.
 * It encapsulates the low-level XML creation and parsing.  
 * It is responsible for creating the high-level ConnectionRequest, ConnectionResponse, VideoConnection and ItemHeaderParser instances. 
 * 
 * @module Network
 */

/**
 * Connection state machine states
 */
XPMobileSDK.library.ConnectionStates = {
    idle: 1, // Waiting to connect
    connecting: 2, // Connecting, waiting for ajax response
    loggingIn: 3, // Logging in, waiting for ajax response
    working: 4, // Logged in, established connection and etc
    lostConnection: 5 // Got an error from the server that the connection ID is no longer valid and should reconnect
};

/**
 * Interface description for the observers of the Connection singleton.
 * 
 * If an objects wants to be informed for a specific event (when connection is lost for example) they can register as an observer.
 * Registering an object as an observer for the Connection singleton is simple as calling Connection.addObserver(object).
 * Then, if the observer defines any of the methods described below, they will be called whenever it is appropriate.
 * 
 * All methods are optional. Just implement those you need in your class and add it as observer. 
 * 
 * @class ConnectionObserverInterface
 */
XPMobileSDK.library.ConnectionObserverInterface = {

    /**
     * Sent to observers when the connection state changes in any way
     * 
     * @method connectionStateChanged
     */
    connectionStateChanged: function () { },

    /**
     * Sent to observers when connection has connected to the server and is about to send credentials
     * 
     * @method connectionDidConnect
     * @param parameters: object, the object containing the response parameters.
     */
    connectionDidConnect: function (parameters) { },

    /**
     * Sent to observers when connection attempted to connect to the server but failed.
     * Note that error may be a null object if we have failed to even parse the response from the server.
     * 
     * @method connectionFailedToConnect
     */
    connectionFailedToConnect: function (error) { },

    /**
     * Sent to observers when connecting with external connection ID has failed.  
     * 
     * @method connectionFailedToConnectWithId
     */
    connectionFailedToConnectWithId: function (error) { },

    /**
     * Sent to observers when connection is in the process of logging in, but requires additional verification code.
     * 
     * @method connectionRequiresCode
     * @param provider: string, the provider used to send a verification code.
     */
    connectionRequiresCode: function (provider) { },

    /**
     * Sent to observers when connection is in the process of logging in, a code has been sent to the server for verification, but this code is wrong.
     * 
     * @method connectionCodeError
     */
    connectionCodeError: function () { },

    /**
     * Sent to observers when connection has logged in.
     * 
     * @method connectionDidLogIn
     */
    connectionDidLogIn: function () { },

    /**
     * Sent to observers when connection has failed to log in. Check the error to determine if it was due to incorrect credentials!
     * Note that error may be a null object if we have failed to even parse the response from the server.
     * 
     * @method connectionFailedToLogIn
     */
    connectionFailedToLogIn: function (error) { },

    /**
     * Sent to observers when connection to the server was lost.
     * 
     * @method connectionLostConnection
     */
    connectionLostConnection: function () { },

    /**
     * Sent to observers when the disconnect command is sent.
     * 
     * @method connectionProcessingDisconnect
     */
    connectionProcessingDisconnect: function () { },

    /**
     * Sent to observers when connection to the server was closed on request via disconnect method.
     * 
     * @method connectionDidDisconnect
     */
    connectionDidDisconnect: function () { },

    /**
     * Sent to observers every time a request to the server has been received properly and without timeout or other terminal errors.
     * You can use that to keep track of the connection and monitor it is properly working.
     * 
     * @method connectionRequestSucceeded
     */
    connectionRequestSucceeded: function (request, response) { },

    connectionVersionChanged: function () { },

    connectionReloadConfiguration: function () { },

    connectionReloadCameraConfiguration: function () { },

    closeStreamFinished: function () { }
};

/**
 * Main Connection.
 * 
 * This class encapsulates:
 * 	- connection state management;
 *  - commands sending to the server over ajax;
 *  - keep alive messages (LiveMessage commands).
 *  
 * The class uses ConnectionRequest to generate XML and perform the actual AJAX call with the command. 
 * Most commands methods (if not all), such as getViews and requestStream return a connectionRequest object to the callee.
 * This object can be used to cancel the request if needed via the cancelRequest method.
 * 
 * @class Connection
 */
Connection = function () {

    var self = this;

    /**
     * Read-only: Connection ID, supplied by the server
     * @property {String} connectionId
     */
    this.connectionId = null;

    /**
     * Read-only: Server ID, supplied by the server
     * @property {String} serverId
     */
    this.serverId = null;

    /**
     * Keeps the username provided by the server of the currently logged in user
     * @property {String} currentUserName
     */
    this.currentUserName = null;

    /**
     * Session timeout in seconds, supplied by the server. It is needed so we know how often to send keep-alive messages
     * @property {Number} serverTimeout
     */
    this.serverTimeout = 30;

    /**
     * Read-only: Connection state. See ConnectionStates constants for possible values
     * @property {Number} state
     */
    this.state = XPMobileSDK.library.ConnectionStates.idle;

    /**
     * Indicates the configuration of DS comming from the Mobile Server
     */
    this.DSServerStatus = {
        NotAvailable: 0,
        DoNotEnforce: 1,
        EnforceWheneverPossible: 2,
        Enforce: 3
    };

    /**
     * All requests currently waiting for response
     */
    var requests = [];

    /**
     * Observers are objects that receive certain events from the connection. These objects should implement methods from 
     * the ConnectionObserverInterface. To add/remove an observer use the addObserver/removeObsever methods, don't modify this 
     * array directly - it is supposed to be private property
     */
    var observers = [];

    /**
     * Each command send to the server has a sequenceID which starts from 1 and is increased with every next request.
     */
    var sequenceID = 0;

    /**
     * Number of previous LiveMessages still waiting for response from the server.
     */
    var liveMessagesWaiting = 0;

    /**
     * Minimum FPS supported. In push mode this FPS value is used as lowest value when adjusting the frame rate
     */
    var minFps = 1;

    /**
     * Maximum FPS supported. In push mode this FPS value is used as highest value when adjusting the frame rate. 
     */
    var maxFps = 15;

    /**
     * Initializes the Connection singleton. Must be called before using any of the other methods.
     * 
     * @method initialize
     * @param storage: optional, the storage used to store server features in, and to initialize them from (for example XPMobileSDK.localStorage, XPMobileSDK.sessionStorage, or any object implementing their methods). 
     * 				The server features are retrieved on login. The idea is to keep the connection state if you want to connectWithId, but it is cleared for some reason (browser refresh for example).
     */
    this.initialize = function (storage) {

        if (storage) {
            self.storage = storage;
            XPMobileSDK.features = self.storage.getItem('features');
            self.resizeAvailable = self.storage.getItem('resizeAvailable');
            self.webSocketServer = self.storage.getItem('webSocketServer');
            self.webSocketBrowser = self.storage.getItem('webSocketBrowser');
            self.directStreamingClient = self.storage.getItem('directStreamingClient');
            self.directStreamingServer = self.storage.getItem('directStreamingServer');
            self.exportToAvi = self.storage.getItem('exportToAvi');
            self.exportToDb = self.storage.getItem('exportToDb');
            self.exportToMkv = self.storage.getItem('exportToMkv');
            self.analytics = self.storage.getItem('analytics');
        }

        self.server = XPMobileSDKSettings.MobileServerURL || window.location.origin;
        self.dh = new XPMobileSDK.library.DiffieHellman();
    };

    /**
     * Adds an observer to the Connection singleton. 
     * 
     * @method addObserver
     * @param object: an arbitrary object implementing the ConnectionObserverInterface interface
     * @see ConnectionObserverInterface
     */
    this.addObserver = function (object) {
        if (observers.indexOf(object) === -1) observers.push(object);
    };

    /**
     * Removes an existing observer from the Connection singleton.
     * 
     * @method removeObserver
     * @param object: an arbitrary object implementing the ConnectionObserverInterface interface
     * @see ConnectionObserverInterface
     */
    this.removeObserver = function (object) {
        var index = observers.indexOf(object);
        if (index < 0) {
            logger.error('Error removing observer. Observer does not exist.');
            return;
        }
        observers.splice(index, 1);
    };

    /**
     * Cancels a request. Provide the ConnectionRequest object, returned by the method used to create it.
     * 
     * @method cancelRequest
     * @param {ConnectionRequest} connectionRequest
     */
    this.cancelRequest = function (connectionRequest) {
        logger.log('Cancelling request: ', connectionRequest);
        connectionRequest.cancel();
        requestFinished(connectionRequest);
    };

    /**
     * Sends a Connect command to the server.
     * 
     * @param {Object} params: Parameters to sent to the server
     * @param {Function} successCallback: function that is called when the command execution was successful and the result is passed as a parameter.
     * @param {Function} failCallback: function that is called when the command execution has failed and the error is passed as a parameter.
     * 
     * @return the request object
     */
    this.Connect = function (params, successCallback, failCallback) {
        params = params || {};

        setState(XPMobileSDK.library.ConnectionStates.connecting);
        params.ProcessingMessage = 'No';
        return self.sendCommand('Connect', params, { successCallback: successCallback }, connectCallback, failCallback);
    };

    var connectCallback = function (connectionRequest) {
        requestFinished(connectionRequest);
        var connectionResponse = connectionRequest.response;
        if (!connectionResponse || connectionResponse.isError) {
            var failedResponseParameter = connectionResponse && connectionResponse.error;
            callMethodOnObservers('connectionFailedToConnect', failedResponseParameter);
            connectionRequest.options.failCallback && connectionRequest.options.failCallback(failedResponseParameter);
        } else {
            self.connectionId = connectionResponse.outputParameters.ConnectionId;
            self.serverTimeout = parseInt(connectionResponse.outputParameters.Timeout);
            self.serverId = connectionResponse.outputParameters.ServerId;

            if (self.storage) {
                self.webSocketServer = connectionResponse.outputParameters.WebSocketSupport === 'Yes';
                self.storage.setItem('webSocketServer', self.webSocketServer);

                if (typeof self.storage.getItem('webSocketBrowser') === 'boolean' && !!window.WebSocket) {
                    self.webSocketBrowser = self.storage.getItem('webSocketBrowser');
                }
                else {
                    self.webSocketBrowser = !!window.WebSocket;
                    self.storage.setItem('webSocketBrowser', self.webSocketBrowser);
                }

                if (typeof self.storage.getItem('directStreamingClient') === 'boolean') {
                    self.directStreamingClient = self.storage.getItem('directStreamingClient');
                }
                else {
                    self.directStreamingClient = !!XPMobileSDKSettings.DirectStreaming;
                    self.storage.setItem('directStreamingClient', self.directStreamingClient);
                }


                self.analytics = self.storage.getItem('analytics');
            }

            if (connectionResponse.outputParameters.SecurityEnabled) {
                self.SecurityEnabled = connectionResponse.outputParameters.SecurityEnabled;
            }

            if (connectionResponse.outputParameters.PublicKey) {
                self.PublicKey = connectionResponse.outputParameters.PublicKey;
                self.dh && self.dh.setServerPublicKey(connectionResponse.outputParameters.PublicKey);
            }

            if (connectionResponse.outputParameters.CHAPSupported && connectionResponse.outputParameters.CHAPSupported === "Yes") {
                self.CHAPSupported = connectionResponse.outputParameters.CHAPSupported;
                XPMobileSDK.library.CHAP.sharedKey = self.dh && self.dh.getSharedKey();
            }

            if (connectionResponse.outputParameters.ServerProductCode) {
                self.ServerProductCode = connectionResponse.outputParameters.ServerProductCode;
            }

            logger.info('Established connection');
            scheduleLiveMessage();
            var successResponseParameter = connectionResponse.outputParameters;
            callMethodOnObservers('connectionDidConnect', successResponseParameter);
            connectionRequest.options.successCallback && connectionRequest.options.successCallback(successResponseParameter);
        }
    };

    /**
     * Connects to the server with an existing connectionId.
     * 
     * @method connectWithId
     * @param {String} server: url of the server to connect to
     * @param {String} connectionId: token provided from external login request
     * @param {String} serverId: token provided from external login request
     */
    this.connectWithId = function (server, connectionId, serverId) {
        self.server = server;
        self.connectionId = connectionId;
        self.serverId = serverId;
        logger.log('Connecting with Id ' + self.connectionId);
        setState(XPMobileSDK.library.ConnectionStates.connecting);
        // We need to check the connection ID we have been provided with the server. Easiest way is to just ping it
        self.sendLiveMessage();
        // we set a flag which is checked when the live message comes back. If it contains an OK response we set the connection as live.
        // If it contains a time out response we set it as disconnected
        self.connectingViaExternalConnectionID = true;

    };


    /**
     * Sends a Login command to the server. Log-in has to be performed before any other normal requests (except connect and some other special cases). 
     * 
     * @param {Object} params: Parameters to sent to the server
     * @param {Function} successCallback: function that is called when the command execution was successful and the result is passed as a parameter.
     * @param {Function} failCallback: function that is called when the command execution has failed and the error is passed as a parameter.
     * 
     * @return the request object
     */
    this.Login = function (params, successCallback, failCallback) {
        params = params || {};

        logger.log('Log in with authentication type ' + params.LoginType + ' username ' + params.Username + ' password ' + params.Password);
        setState(XPMobileSDK.library.ConnectionStates.loggingIn);
        return self.sendCommand('LogIn', params, { successCallback: successCallback }, loginCallback, failCallback);
    };

    var loginCallback = function (connectionRequest) {
        requestFinished(connectionRequest);
        var connectionResponse = connectionRequest.response;
        if (!connectionResponse || connectionResponse.isError) {
            if (connectionResponse && connectionResponse.error.code === XPMobileSDK.library.ConnectionError.SecondStepAuthenticationRequired) {
                var ssarParameter = connectionResponse.outputParameters.SecondStepAuthenticationProvider;
                callMethodOnObservers('connectionRequiresCode', ssarParameter);
                connectionRequest.options.successCallback && connectionRequest.options.successCallback(ssarParameter);
            }
            else {
                self.connectionId = null;
                cancelLiveMessage();
                var failedResponseParameter = connectionResponse && connectionResponse.error;
                callMethodOnObservers('connectionFailedToLogIn', failedResponseParameter);
                connectionRequest.options.failCallback && connectionRequest.options.failCallback(failedResponseParameter);
            }
        }
        else {
            proceedWithLogin(connectionResponse, connectionRequest.options.successCallback);
        }
    };

    var proceedWithLogin = function (connectionResponse, successCallback) {

        var oldServerVersion = XPMobileSDK.features && XPMobileSDK.features.ServerVersion;

        self.directStreamingServer = connectionResponse.outputParameters.DirectStreamingLive === 'Yes';
        self.storage.setItem('directStreamingServer', self.directStreamingServer);

        self.exportToAvi = connectionResponse.outputParameters.ExportToAvi === 'Yes';
        self.storage.setItem('exportToAvi', self.exportToAvi);

        self.exportToDb = connectionResponse.outputParameters.ExportToDb === 'Yes';
        self.storage.setItem('exportToDb', self.exportToDb);

        self.exportToMkv = connectionResponse.outputParameters.ExportToMkv === 'Yes';
        self.storage.setItem('exportToMkv', self.exportToMkv);
        if (connectionResponse.outputParameters.Username) {
            self.currentUserName = connectionResponse.outputParameters.Username;
        }

        logger.info('Logged in');
        getFeatures(connectionResponse.outputParameters);

        setState(XPMobileSDK.library.ConnectionStates.working);
        callMethodOnObservers('connectionDidLogIn', connectionResponse.outputParameters);
        successCallback && successCallback();

        if (oldServerVersion && oldServerVersion !== XPMobileSDK.features.ServerVersion) {
            callMethodOnObservers('connectionVersionChanged');
        }
    };

    /**
     * Sends a verification code request command after a log-in command, that requires a second step of verification. 
     * 
     * @method requestCode
     * @param {Function} successCallback: function that is called when the command execution was successful and the result is passed as a parameter.
     * @param {Function} failCallback: function that is called when the command execution has failed and the error is passed as a parameter.
     */
    this.requestCode = function (successCallback, failCallback) {
        var params = {};
        return self.sendCommand('RequestSecondStepAuthenticationPin', params, { successCallback: successCallback }, requestCodeCallback, failCallback);
    };

    var requestCodeCallback = function (connectionRequest) {
        callbackAfterRequest(connectionRequest, 'Error requesting validation code.', connectionRequest.options.successCallback);
    };

    /**
     * Sends a code for verification after a it has been requested with requestCode command. 
     * 
     * @method verifyCode
     * @param {String} code - second step authentication pin code
     */
    this.verifyCode = function (code) {
        var params = {
            SecondStepAuthenticationPin: code
        };
        return self.sendCommand('VerifySecondStepAuthenticationPin', params, null, verifyCodeCallback);
    };

    var verifyCodeCallback = function (connectionRequest) {
        requestFinished(connectionRequest);
        var connectionResponse = connectionRequest.response;
        if (!connectionResponse || connectionResponse.isError) {
            if (connectionResponse && connectionResponse.error.code === XPMobileSDK.library.ConnectionError.SecondStepAuthenticationCodeError) {
                callMethodOnObservers('connectionCodeError');
            }
            else {
                self.connectionId = null;
                cancelLiveMessage();
                callMethodOnObservers('connectionFailedToLogIn', connectionResponse && connectionResponse.error);
            }
        }
        else {
            proceedWithLogin(connectionResponse);
        }
    };

    /**
     * Sends a disconnect command to the server. Performing any other normal requests that requires a valid connectionId will not be possible from now on.
     * 
     *  @method Disconnect
     *  @param {Object} params - Parameters to sent to the server. May contain:
     * <pre>
     * - {String} ConnectionId - Connection ID retrieved from Connect command
     * - {String} ProcessingMessage - (optional) [Yes/No] Indicates whether processing
     *                                messages should be sent from server while
     *                                processing the request. Default depends on the
     *                                value in connect command.
     * </pre>
     * @param {Function} successCallback - function that is called when the command execution was successful and the result is passed as a parameter.
     * @param {Function} failCallback - function that is called when the command execution has failed and the error is passed as a parameter.
     */
    this.Disconnect = function (params, successCallback, failCallback) {
        /* Call connectionProcessingDisconnect method on observers before actual disconnect command call
        so that other objects have the chance to send their close commands first */
        callMethodOnObservers('connectionProcessingDisconnect');

        cancelLiveMessage();
        setState(XPMobileSDK.library.ConnectionStates.idle);

        XPMobileSDK.library.VideoConnectionPool.clear();
        params = params || {};
        var connectionRequest = self.sendCommand('Disconnect', params, { successCallback: successCallback }, logOutCallback, failCallback);

        self.connectionId = null;
        return connectionRequest;
    };

    /**
     * logOut callback
     * 
     * @param 	connectionRequest		object		XMLHttpResponse
     */
    var logOutCallback = function (connectionRequest) {
        requestFinished(connectionRequest);
        callMethodOnObservers('connectionDidDisconnect');
        self.destroy();
    };

    /**
     * Sends a GetViews command to the server. Sub views, child of the given viewId, will be returned in the given callback.
     * 
     * @method getViews
     * @param {String} viewId
     * @param {Function} successCallback: function that is called when the command execution was successful and the result is passed as a parameter.
     * @param {Function} failCallback: function that is called when the command execution has failed and the error is passed as a parameter.
     */
    this.getViews = function (viewId, successCallback, failCallback) {
        return self.sendCommand('GetViews', { ViewId: viewId }, { successCallback: successCallback, ViewId: viewId }, getViewsCallback, failCallback);
    };

    var getViewsCallback = function (connectionRequest) {
        callbackAfterRequest(connectionRequest, null, function () {

            var subViews = [];
            var subViewsNodes = connectionRequest.response.subItems.getElementsByTagName('Item');

            for (var i = 0, c = subViewsNodes.length; i < c; i++) {
                var item = subViewsNodes[i];
                var res = {};
                for (var j = 0; j < item.attributes.length; j++) {
                    res[item.attributes[j].name] = item.attributes[j].value;
                }
                subViews.push(res);
            }
            var view = {
                id: connectionRequest.options.ViewId,
                subViews: subViews
            };
            connectionRequest.options.successCallback && connectionRequest.options.successCallback(view);
        });
    };

    /**
     * Sends a GetAllViewsAndCameras command to the server. Retrieves all folders, views and cameras in a single command.
     * 
     * @method getAllViews
     * @param {Function} successCallback: function that is called when the command execution was successful and the result is passed as a parameter.
     * @param {Function} failCallback: function that is called when the command execution has failed and the error is passed as a parameter.
     */
    this.getAllViews = function (successCallback, failCallback) {
        return self.sendCommand('GetAllViewsAndCameras', {}, { successCallback: successCallback }, getAllViewsCallback, failCallback);
    };

    /**
     * Called when getAllViews response is received
     * 
     * @param 		connectionRequest		object		Response from AXAJ call
     */
    var getAllViewsCallback = function (connectionRequest) {
        callbackAfterRequest(connectionRequest, 'Error executing GetAllViewsAndCameras on the server.', function () {
            connectionRequest.options.successCallback && connectionRequest.options.successCallback(connectionRequest.response.items);
        });
    };

    /**
     * Sends a GetItems command to the server. Retrieves all folders and cameras inside in a single command.
     *
     * @method getAllViews
     * @param {Function} successCallback: function that is called when the command execution was successful and the result is passed as a parameter.
     * @param {Function} failCallback: function that is called when the command execution has failed and the error is passed as a parameter.
     */
    this.getAllCameras = function (successCallback, failCallback) {
        return self.sendCommand('GetItems', { ItemKind: 'Camera', Hierarchy: 'UserDefined', IncludeRelatedDevices: 'Yes' }, { successCallback: successCallback }, getAllCamerasCallback, failCallback);
    };

    /**
    * Called when getAllViews response is received
    * 
    * @param 		connectionRequest		object		Response from AXAJ call
    */
    var getAllCamerasCallback = function (connectionRequest) {
        callbackAfterRequest(connectionRequest, 'Error executing GetItems on the server.', function () {
            connectionRequest.options.successCallback && connectionRequest.options.successCallback(connectionRequest.response.items);
        });
    };

    this.getOsmServerAddresses = function (successCallback, failCallback) {

        return self.sendCommand('GetOsmServerAddresses', {}, { successCallback: successCallback }, getOsmServerAddressesCallback, failCallback);

    };

    var getOsmServerAddressesCallback = function (connectionRequest) {
        callbackAfterRequest(connectionRequest, 'Error getting OSM server addresses from the server.', function () {
            connectionRequest.options.successCallback && connectionRequest.options.successCallback(connectionRequest.response.items);
        });
    };

    this.getGisMapCameras = function (successCallback, failCallback) {

        return self.sendCommand('GetGisMapCameras', {}, { successCallback: successCallback }, getGisMapCamerasCallback, failCallback);

    };

    var getGisMapCamerasCallback = function (connectionRequest) {
        callbackAfterRequest(connectionRequest, 'Error getting GIS map cameras from the server.', function () {
            connectionRequest.options.successCallback && connectionRequest.options.successCallback(connectionRequest.response.items);
        });
    };

    this.getGisMapLocations = function (successCallback, failCallback) {

        return self.sendCommand('GetGisMapLocations', {}, { successCallback: successCallback }, getGisMapLocationsCallback, failCallback);

    };

    var getGisMapLocationsCallback = function (connectionRequest) {
        callbackAfterRequest(connectionRequest, 'Error getting GIS map cameras from the server.', function () {
            connectionRequest.options.successCallback && connectionRequest.options.successCallback(connectionRequest.response.items);
        });
    };

    this.requestPushStream = function (successCallback, failCallback) {

        var parameters = {
            SignalType: 'Upload',
            ByteOrder: 'Network'
        };
        return self.RequestStream(parameters, successCallback, failCallback);

    };

    var requestPushStreamCallback = function (connectionRequest) {
        callbackAfterRequest(connectionRequest, 'Error requesting video push stream from the server.', function () {
            connectionRequest.options.successCallback && connectionRequest.options.successCallback(connectionRequest.response.outputParameters);
        });
    };

    /**
     * Sends a RequestStream command to the server.
     * 
     * @method requestStream
     * @param {String} cameraId: the unique GUID of the camera that should be started
     * @param size: includes width and height as mandatory properties
     * @param {Function} successCallback: function that is called when the command execution was successful and the result is passed as a parameter.
     * @param {Function} failCallback: function that is called when the command execution has failed and the error is passed as a parameter.
     * @param options: optional parameter containing various configuration, includes:
     * 			- {int} signal: live or playback
     * 			- {int} jpegCompressionLevel
     * 			- {boolean} keyFramesOnly
     * 			- {boolean} reuseConnection - if true, the API will reuse existing connections for the same camera
     *			- {int} time - timestamp for playback
     * 
     * @return the request object
     */
    this.requestStream = function (cameraId, size, options, successCallback, failCallback) {

        options = options || {};

        var params = {
            CameraId: cameraId,
            DestWidth: Math.round(size.width),
            DestHeight: Math.round(size.height),
            SignalType: options.signal === XPMobileSDK.interfaces.VideoConnectionSignal.playback ? 'Playback' : 'Live',
            MethodType: 'Push',
            Fps: maxFps, // This doesn't work for Pull mode, but we have to supply it anyway to keep the server happy
            ComprLevel: options.jpegCompressionLevel ? options.jpegCompressionLevel : 70,
            KeyFramesOnly: options.keyFramesOnly ? 'Yes' : 'No', // Server will give only key frame thumb nails. This will reduce FPS
            RequestSize: 'Yes',
            StreamType: options.streamType === XPMobileSDK.library.VideoConnectionStream.FragmentedMP4 ? 'FragmentedMP4' : 'Transcoded'
        };

        if (options.fragmentDurationMs) {
            params.FragmentDurationMs = options.fragmentDurationMs;
        }

        if (options.time) {
            params.SeekType = 'Time';
            params.Time = options.time;
        }

        if (options.motionOverlay) {
            params.MotionOverlay = 'Yes';
        }

        if (XPMobileSDK.features.MultiCameraPlayback && options.playbackControllerId) {
            params.PlaybackControllerId = options.playbackControllerId;
        }

        options = {
            successCallback: successCallback,
            cameraId: cameraId,
            signal: options.signal === XPMobileSDK.interfaces.VideoConnectionSignal.playback ? 'Playback' : 'Live',
            reuseConnection: !!options.reuseConnection
        };
        return self.sendCommand('RequestStream', params, options, requestStreamCallback, failCallback);
    };

    /**
     * Sends a RequestStream command to the server.
     * 
     * @param {Object} params: Parameters to sent to the server
     * @param {Function} successCallback: function that is called when the command execution was successful and the result is passed as a parameter.
     * @param {Function} failCallback: function that is called when the command execution has failed and the error is passed as a parameter.
     * 
     * @return the request object
     */
    this.RequestStream = function (params, successCallback, failCallback) {
        return self.sendCommand('RequestStream', params, { successCallback: successCallback }, requestStreamCallback, failCallback);
    };

    var requestStreamCallback = function (connectionRequest) {
        let messageString = 'Error starting stream for camera ' + connectionRequest.options.cameraId;
        if (connectionRequest.response.errorCode === XPMobileSDK.library.ConnectionError.InsufficientUserRights) {
            messageString = '';
        }
        callbackAfterRequest(connectionRequest, messageString, function () {

            var videoId = connectionRequest.response.outputParameters.VideoId;
            logger.log('Server prepared video ID ' + videoId + ' for camera ' + connectionRequest.options.cameraId);

            let videoConnection = new VideoStream(videoId, connectionRequest);
            if (connectionRequest.options.reuseConnection) {
                XPMobileSDK.library.VideoConnectionPool.addCamera(connectionRequest.options.cameraId, videoConnection);
            }
            connectionRequest.options.successCallback && connectionRequest.options.successCallback(videoConnection);
        });
    };

    /**
    * Sends a RequestAudioStreamIn connection command to get an upstream for audio push to the server.
    * 
    * @method RequestAudioStreamIn
    * @param {AudioConnectionOptions} params - Configuration. Should contain:
    * <pre>
    * - {String} itemId - Id of the item (speaker), which stream is requested (GUID)
    * - {String} AudioEncoding - Shows the encoding of the output. Possible values - Pcm, Mp3.
    * - {Number} AudioSamplingRate - The audio sampling rate in Hz value
    * - {Number} AudioBitsPerSample - 8/16  - Audio bits per sample
    * - {Number} AudioChannelsNumber - 1/2 - Number of audio channels (mon or stereo)
    * - {String} StreamDataType - Shows if this is video, audio or metadata. Possible values - Video, Audio, MetaData.
    * - {String} SignalType - Type of the requested signal - Live, Playback
    * - {String} MethodType - Type of the method for retrieving video data - Push or Pull
    * - {String} StreamHeaders - Shows available stream headers. Possible values - AllPresent, NoHeaders.
    * - {String} Challenge - (only if CHAPSupproted is true) GUID previously given by the server
    * - {String} ChalAnswer - (only if CHAPSupproted is true) Challenge itself plus a SHA512 hash encoded as base64
    
    * </pre>
    * @param {Function} successCallback - function that is called when the command execution was successful and a stream parameters object is passed as a parameter.
    * @param {Function} errorCallback - function that is called when the command execution has failed and an error object is passed as a parameter.
    * 
    * @return {ConnectionRequest} - the ConnectionRequest object
    */
    this.RequestAudioStreamIn = function (params, successCallback, failCallback) {
        return self.sendCommand('RequestAudioStreamIn', params, { successCallback: successCallback }, requestAudioStreamInCallback, failCallback);
    };

    /**
    * Sends a RequestAudioStreamIn connection command to get an upstream for audio push to the server.
    * 
    * @method requestAudioStreamIn
    * @param {String} itemId - Id of the item (speaker), which stream is requested (GUID)
    * @param {AudioConnectionOptions} options - optional, optional configuration. May contain:
    * <pre>
    * - {Number} AudioSamplingRate - The audio sampling rate in Hz value
    * - {Number} AudioBitsPerSample - 8/16  - Audio bits per sample
    * - {Number} AudioChannelsNumber - 1/2 - Number of audio channels (mon or stereo)
    * </pre>
    * @param {Function} successCallback - function that is called when the command execution was successful and a stream parameters object is passed as a parameter.
    * @param {Function} errorCallback - function that is called when the command execution has failed and an error object is passed as a parameter.
    * 
    * @return {ConnectionRequest} - the ConnectionRequest object
    */
    this.requestAudioStreamIn = function (itemId, options, successCallback, failCallback) {

        options = options || {};

        var params = {
            ItemId: itemId,
            AudioEncoding: "Pcm",
            AudioSamplingRate: 8000,
            AudioBitsPerSample: 16,
            AudioChannelsNumber: 1,
            StreamDataType: "Audio",
            SignalType: 'Live',
            MethodType: 'Push',
            StreamHeaders: "AllPresent",
            ByteOrder: "Network"
        };

        if (options.AudioSamplingRate) {
            params.AudioSamplingRate = options.AudioSamplingRate;
        }

        if (options.AudioBitsPerSample) {
            params.AudioBitsPerSample = options.AudioBitsPerSample;
        }

        if (options.AudioChannelsNumber) {
            params.AudioChannelsNumber = options.AudioChannelsNumber;
        }

        options = {
            successCallback: successCallback
        };

        return self.sendCommand('RequestAudioStreamIn', params, options, requestAudioStreamInCallback, failCallback);
    };

    var requestAudioStreamInCallback = function (connectionRequest) {
        callbackAfterRequest(connectionRequest, 'Error requesting video push stream from the server.', function () {
            connectionRequest.options.successCallback && connectionRequest.options.successCallback(connectionRequest.response.outputParameters);
        });
    };

    var closeVideoConnection = function (videoConnection) {

        self.closeStream(videoConnection.videoId);
        videoConnection.isReusable && XPMobileSDK.library.VideoConnectionPool.removeCamera(videoConnection.cameraId, videoConnection.videoId);

    };

    var restartVideoConnection = function (videoConnection) {

        videoConnection.request.parameters.MethodType = 'Push';

        self.closeStream(videoConnection.videoId);
        self.sendCommand('RequestStream', videoConnection.request.parameters, videoConnection.request.options, requestStreamCallback);
    };

    /**
     * Sends a RequestAudioStream command to the server.
     * 
     * @param {Object} params: Parameters to sent to the server
     * @param {Function} successCallback: function that is called when the command execution was successful and the result is passed as a parameter.
     * @param {Function} failCallback: function that is called when the command execution has failed and the error is passed as a parameter.
     * 
     * @return the request object
     */
    this.RequestAudioStream = function (params, successCallback, failCallback) {
        return self.sendCommand('RequestAudioStream', params, { successCallback: successCallback }, requestAudioStreamCallback, failCallback);
    };

    /**
     * Sends a RequestAudioStream command to the server.
     * 
     * @method requestAudioStream
     * @param {String} microphoneId: the unique GUID of the microphone that should be started
     * @param {Function} successCallback: function that is called when the command execution was successful and the result is passed as a parameter.
     * @param {Function} failCallback: function that is called when the command execution has failed and the error is passed as a parameter.
     * @param options: optional parameter containing various configuration, includes:
     * 			- {int} signal: live or playback
     * 			- {int} compressionLevel
     * 			- {boolean} reuseConnection - if true, the API will reuse existing connections for the same microphone
     * 
     * @return the request object
     */
    this.requestAudioStream = function (microphoneId, options, successCallback, failCallback) {

        options = options || {};

        var params = {
            ItemId: microphoneId,
            MethodType: "Push",
            SignalType: options.signal === XPMobileSDK.interfaces.VideoConnectionSignal.playback ? 'Playback' : 'Live',
            StreamType: "Transcoded",
            StreamDataType: "Audio",
            AudioEncoding: "Mp3",
            CloseConnectionOnError: "Yes"
        };

        if (options.playbackControllerId) {
            params.PlaybackControllerId = options.playbackControllerId;
        }

        if (options.AudioCompressionLevel) {
            params.ComprLevel = options.AudioCompressionLevel;
        }
        else if (XPMobileSDKSettings.AudioCompressionLevel) {
            params.ComprLevel = XPMobileSDKSettings.AudioCompressionLevel;
        }

        options = {
            successCallback: successCallback,
            microphoneId: microphoneId
        };
        return self.sendCommand('RequestAudioStream', params, options, requestAudioStreamCallback, failCallback);
    };

    var requestAudioStreamCallback = function (connectionRequest) {
        callbackAfterRequest(connectionRequest, 'Error starting stream for microphone ' + connectionRequest.options.microphoneId, function () {

            var streamId = connectionRequest.response.outputParameters.StreamId;
            logger.log('Server prepared stream ID ' + streamId + ' for microphone ' + connectionRequest.options.microphoneId);

            connectionRequest.options.successCallback && connectionRequest.options.successCallback(connectionRequest);
        });
    };

    /**
     * Toggles the Direct streaming setting
     *
     * @method toggleDirectStreaming
     *
     * @param {Boolean} enabled - Enable or not direct streaming
     */
    this.toggleDirectStreaming = function (enabled) {
        self.directStreamingClient = !!enabled;
        self.storage && self.storage.setItem('directStreamingClient', self.directStreamingClient);
        XPMobileSDK.library.VideoConnection.instances.forEach(function (videoConnection) {
            videoConnection.getState() === XPMobileSDK.library.VideoConnectionState.running && videoConnection.close();
        });
    };

    /**
     * Toggles the Analytic Data setting
     *
     * @method toggleAnalytics
     *
     * @param {Boolean} enabled - Enable or not analytics
     */
    this.toggleAnalytics = function (enabled) {
        self.analytics = !!enabled;
        self.storage && self.storage.setItem('analytics', self.analytics);

        window.dispatchEvent(new CustomEvent("AnalyticsSettingChanged"));
    };

    /**
     * Sends a ChangeStream command to the server. Changes the visual part of the stream that the given videoConnection represents. 
     * 
     * @method changeStream
     * @param {VideoConnection} videoConnection
     * @param cropping: contains top, left, bottom, and right properties for cropping
     * @param size: contains width and height properties that define the received frame size
     * @param {Function} successCallback: function that is called when the command execution was successful and the result is passed as a parameter.
     * @param {Function} failCallback: function that is called when the command execution has failed and the error is passed as a parameter.
     */
    this.changeStream = function (videoConnection, cropping, size, successCallback, failCallback) {

        var params = {
            VideoConnection: videoConnection,
            VideoId: videoConnection.videoId,
            DestWidth: Math.round(size.width),
            DestHeight: Math.round(size.height)
        };

        if (cropping.top !== undefined) {
            params.SrcTop = Math.round(cropping.top);
        }

        if (cropping.left !== undefined) {
            params.SrcLeft = Math.round(cropping.left);
        }

        if (cropping.right !== undefined) {
            params.SrcRight = Math.round(cropping.right);
        } else if (cropping.width !== undefined) {
            params.SrcRight = Math.round(cropping.width) + Math.round(cropping.left);
        }

        if (cropping.bottom !== undefined) {
            params.SrcBottom = Math.round(cropping.bottom);
        } else if (cropping.height !== undefined) {
            params.SrcBottom = Math.round(cropping.height) + Math.round(cropping.top);
        }

        return self.ChangeStream(params, successCallback, failCallback);
    };

    /**
     * Sends a ChangeStream command to the server.
     * 
     * @param {Object} params: Parameters to sent to the server
     * @param {Function} successCallback: function that is called when the command execution was successful and the result is passed as a parameter.
     * @param {Function} failCallback: function that is called when the command execution has failed and the error is passed as a parameter.
     * 
     * @return the request object
     */
    this.ChangeStream = function (params, successCallback, failCallback) {
        return self.sendCommand('ChangeStream', params, { successCallback: successCallback }, changeStreamCallback, failCallback);
    };

    var changeStreamCallback = function (connectionRequest) {
        callbackAfterRequest(connectionRequest, 'Error changing stream.', function () {
            if (XPMobileSDK.features.SupportTimeBetweenFrames) {
                connectionRequest.VideoConnection.resetCommunication();
            }
            connectionRequest.options.successCallback && connectionRequest.options.successCallback();
        });
    };

    /**
     * Sends a ChangeStream command to the server. Changes the motion detection settings of the stream that the given videoConnection represents. 
     * 
     * @method motionDetection
     * @param {VideoConnection} videoConnection
     * @param {Object} options: contains any or all of the motion, sensitivity, grid and cpu parameters.
     */
    this.motionDetection = function (videoConnection, options) {

        var params = { VideoId: videoConnection.videoId, VideoConnection: videoConnection };

        var motion = options.motion || options.MotionAmount;
        if (motion) params.MotionAmount = Math.round(motion);

        var sensitivity = options.sensitivity || options.SensitivityAmount;
        if (sensitivity) params.SensitivityAmount = Math.round(sensitivity);

        var cpu = options.cpu || options.CPUImpactAmount;
        if (cpu) params.CPUImpactAmount = Math.round(cpu);

        var grid = options.grid || options.RegionGrid;
        if (/^\d+x\d+(;\d+)+$/.test(grid)) params.RegionGrid = grid;

        return self.ChangeStream(params);
    };

    /**
     * Sends a GetPtzPresets command to the server. 
     * 
     * @method getPtzPresets
     * @param {GUID} cameraId: the current camera related to the presets this request will return
     * @param {Function} successCallback, failCallback: failCallback
     */
    this.getPtzPresets = function (cameraId, successCallback, failCallback) {

        var params = {
            CameraId: cameraId
        };

        return self.sendCommand('GetPtzPresets', params, { successCallback: successCallback }, getPtzPresetsCallback, failCallback);
    };

    var getPtzPresetsCallback = function (connectionRequest) {
        callbackAfterRequest(connectionRequest, 'Error getting PTZ presets.', function () {
            delete connectionRequest.response.outputParameters.Challenge;
            connectionRequest.options.successCallback && connectionRequest.options.successCallback(connectionRequest.response.outputParameters);
        });
    };

    /**
     * Closes a stream by the given videoId.
     * 
     * @method closeStream
     * @param {String} videoId
     */
    this.closeStream = function (videoId) {
        return self.CloseStream({ VideoId: videoId });
    };

    /**
         * Closes a stream by the given videoId.
         * 
         * @method closeStream
         * @param {String} videoId
         */
    this.closeAudioStream = function (videoId) {
        return self.sendCommand('CloseStream', { VideoId: videoId }, { successCallback: null }, closeAudioStreamCallback);
    };

    /**
     * Sends a CloseStream command to the server.
     * 
     * @param {Object} params: Parameters to sent to the server
     * @param {Function} successCallback: function that is called when the command execution was successful and the result is passed as a parameter.
     * @param {Function} failCallback: function that is called when the command execution has failed and the error is passed as a parameter.
     * 
     * @return the request object
     */
    this.CloseStream = function (params, successCallback, failCallback) {
        return self.sendCommand('CloseStream', params, { successCallback: successCallback }, closeStreamCallback, failCallback);
    };

    var closeStreamCallback = function (connectionRequest) {
        closeStreamGeneralCallback(connectionRequest);
        callMethodOnObservers('closeStreamFinished');
    };

    var closeAudioStreamCallback = function (connectionRequest) {
        closeStreamGeneralCallback(connectionRequest);
    };

    var closeStreamGeneralCallback = function (connectionRequest) {
        requestFinished(connectionRequest);

        var connectionResponse = connectionRequest.response;

        if (!connectionResponse || connectionResponse.isError) {
            if (connectionRequestResponseIsTerminal(connectionRequest)) {
                lostConnection();
            }
        }
    };

    /**
     * This singleton manages the FPS of all Cameras in the VideoConnectionPool (increasing/decreasing FPS), but never dropping bellow minFps and not exceeding the maxFps.
     * It is triggered by the LiveMessage in push mode, when the message has difficulties receiving its response from the server due to low bandwidth and heavy incoming traffic for the VideoConnections.
     */
    var fps = new function () {

        var decreasing = false;
        var increasing = false;
        var current = maxFps;
        var stable = minFps;
        var queueEmptyCount = 0;

        /**
         * Manages FPS increase/decrease depending on the given queue length, as well as the number of consecutive zero queue lengths.
         * e.g. If the LiveMessage queue length parameter reaches 2 (meaning that by the sending of the third LiveMessage the previous 2 are still waiting for response), the FPS has to be dropped so, 
         * that the LiveMessage responses can be received from the server. The drop is to a safe FPS level we know of, bellow the current one, or to 1 FPS (in order to free the communication channel ASAP).
         * e.g. If the LiveMessage queue length is zero and was zero for the past 5 consecutive LiveMessages, there will be an attempt to recover the FPS (if bellow maximum) up to its maximum by increasing it with 1 FPS at a time.
         * 
         * @param {Number} queueLength: current queue size
         */
        this.manage = function (queueLength) {

            if (queueLength) {
                queueEmptyCount = 0;
                if (queueLength > 1) {
                    this.decrease();
                }
            }
            else {
                queueEmptyCount++;
                if (queueEmptyCount > 5) {
                    this.increase();
                    queueEmptyCount = 0;
                }
            }

        }.bind(this);

        /**
         * Decreases the FPS within the given boundies.
         */
        this.decrease = function () {

            if (decreasing || current === minFps) return;

            decreasing = true;
            current = current > stable ? stable : minFps;

            logger.warn('Decreasing FPS to ' + current);
            change(current, function () { decreasing = false; }.bind(this));

        }.bind(this);

        /**
         * Increases the FPS within the given boundies.
         */
        this.increase = function () {

            if (increasing || current === maxFps) return;

            increasing = true;
            stable = current++;

            logger.warn('Increasing FPS to ' + current);
            change(current, function () { increasing = false; }.bind(this));

        }.bind(this);


        /**
         * Changes the FPS to a given level.
         *
         * @param {Number} fps: target FPS level.
         * @param {Function} successCallback: function that is called when the command execution was successful and the result is passed as a parameter.
         * @param {Function} failCallback: function that is called when the command execution has failed and the error is passed as a parameter.
         */
        var change = function (fps, successCallback, failCallback) {

            for (var i = 0, camera; i < XPMobileSDK.library.VideoConnectionPool.cameras.length; i++) {
                camera = XPMobileSDK.library.VideoConnectionPool.cameras[i];

                if (!camera.videoConnection || !camera.videoConnection.videoId) continue;

                var params = {
                    VideoId: camera.videoConnection.videoId,
                    Fps: fps,
                    VideoConnection: camera.videoConnection
                };
                self.ChangeStream(params, successCallback, failCallback);

            }

        }.bind(this);

    };

    /**
     * Sends a ControlPTZ command to the server. Controls PTZ Preset. The parameter needs to be a valid preset name, otherwise nothing will happen.
     * 
     * @method ptzPreset
     * @param {VideoConnection} videoConnection: the current stream related to the preset this request will activate
     * @param {String} presetName: the name of the preset to be activated
     */
    this.ptzPreset = function (videoConnection, presetName) {

        var params = {
            CameraId: videoConnection.cameraId,
            PtzPreset: presetName
        };

        return self.sendCommand('ControlPTZ', params, null, controlPTZCallback);
    };

    /**
     * Sends a ControlPTZ command to the server. Controls PTZMove. Directions are: 'Up', 'Down', 'Left', 'Right', 'UpLeft', 'UpRight', 'DownLeft', 'DownRight', 'ZoomIn', 'ZoomOut', 'Home'.
     * The camera needs to support PTZ, otherwise nothing will happen.
     * 
     * @method ptzMove
     * @param {VideoConnection} videoConnection: the current stream related to the PTZ this request will activate
     * @param {String} direction: 'Up', 'Down', 'Left', 'Right', 'UpLeft', 'UpRight', 'DownLeft', 'DownRight', 'ZoomIn', 'ZoomOut', 'Home'
     */
    this.ptzMove = function (videoConnection, direction) {

        var params = {
            CameraId: videoConnection.cameraId,
            PtzMove: direction,
            VideoConnection: videoConnection
        };

        return self.sendCommand('ControlPTZ', params, null, controlPTZCallback);
    };

    /**
     * It is used to change the camera orientation by moving it in the direction of the tap.
     * The reference point of the movement is the center of the screen.
     * The tap and the reference points are used to calculate the direction and the speed of the camera movement.
     *
     * @method tapAndHold
     * @param params:
     *          		- CameraId: String
     *          		- GestureXPercent: the percentage of distance between start and finish [-100:100]
     *          		- GestureYPercent: the percentage of distance between start and finish [-100:100]
     */
    this.ptzTapAndHold = function (params, successCallback, failCallback) {
        params['Type'] = 'TapAndHold';
        params['GestureTimeout'] = 2000;

        return self.sendCommand('ControlPTZ', params, { successCallback: successCallback }, ptzTapAndHoldCallback, failCallback);
    };

    var ptzTapAndHoldCallback = function (connectionRequest) {
        callbackAfterRequest(connectionRequest, 'Error controlling PTZ', function () {
            connectionRequest.options.successCallback && connectionRequest.options.successCallback();
        });
    };

    /**
     * It is used to change the camera orientation by moving it in the direction of the swipe.
     * The swipe direction and length are calculated based on the start and end points of the gesture.
     * The swipe speed is calculated based on the time it took to perform the gesture from the start point to the end point.
     * The calculated direction defines the direction of the PTZ movement, whereas the length and the speed are used to determine the amount of the PTZ movement.
     *
     * @method swipe
     * @param params:
     * <pre>
     *    - CameraId: String
     *    - GestureXPercent: the percentage of distance between start and finish [-100:100]
     *    - GestureYPercent: the percentage of distance between start and finish [-100:100]
     * </pre>
     */
    this.ptzSwipe = function (params, gestureDuration) {
        params['Type'] = 'Swipe';
        params['GestureDuration'] = gestureDuration;

        return self.sendCommand('ControlPTZ', params, null, controlPTZCallback);
    };

    /**
     * Called after ptzMove and ptzPreset response is returned.
     */
    var controlPTZCallback = function (connectionRequest) {
        callbackAfterRequest(connectionRequest, 'Error controlling PTZ');
    };

    /**
     * Sends a ChangeStream command to the server. Controls playback speed as a float. Negative number means backwards. 1.0 means normal speed.
     * 
     * @method playbackSpeed
     * @param {VideoConnection} videoConnection
     * @param {Number} speed
     */
    this.playbackSpeed = function (videoConnection, speed) {

        var params = {
            VideoId: videoConnection.videoId,
            Speed: speed,
            VideoConnection: videoConnection
        };

        return self.ChangeStream(params);
    };

    /**
     * Sends a ChangeStream command to the server. Seeks to either of: 'DbStart', 'DbEnd', 'PrevSeq', 'NextSeq', 'PrevFrame' or 'NextFrame'.
     * 
     * @method playbackSeek
     * @param {VideoConnection} videoConnection
     * @param {String} seekType: 'DbStart', 'DbEnd', 'PrevSeq', 'NextSeq', 'PrevFrame' or 'NextFrame'
     */
    this.playbackSeek = function (videoConnection, seekType) {

        var params = {
            VideoId: videoConnection.videoId,
            SeekType: seekType,
            VideoConnection: videoConnection
        };

        return self.ChangeStream(params);
    };

    /**
     * Sends a ChangeStream command to the server. Goes to the closest possible match of specific time.
     * 
     * @method playbackGoTo
     * @param {VideoConnection} videoConnection
     * @param {Number} millisecondsSinceUnixEpoch
     * @param {String} seekType: optional, 'Time' (default), 'TimeOrBefore', 'TimeOrAfter'
     * @param {Function} successCallback: function that is called when the command execution was successful and the result is passed as a parameter.
     * @param {Function} failCallback: function that is called when the command execution has failed and the error is passed as a parameter.
     */
    this.playbackGoTo = function (videoConnection, millisecondsSinceUnixEpoch, seekType, successCallback, failCallback) {

        // TODO reverse the arguments

        var params = {
            VideoId: videoConnection.videoId,
            SeekType: seekType || 'Time',
            Time: millisecondsSinceUnixEpoch,
            VideoConnection: videoConnection
        };

        return self.ChangeStream(params, successCallback, failCallback);
    };

    /**
     * Sends a GetThumbnail command to the server in order to obtain an image representation for a given camera.
     * 
     * @method getThumbnail
     * @param {String} cameraId: the unique GUID of the camera
     * @param {Function} successCallback: function that is called when the command execution was successful and the result is passed as a parameter.
     * @param {Function} failCallback: function that is called when the command execution has failed and the error is passed as a parameter.
     */
    this.getThumbnail = function (cameraId, successCallback, failCallback) {

        var params = {
            CameraId: cameraId,
            ComprLevel: 70
        };

        return self.sendCommand('GetThumbnail', params, { successCallback: successCallback }, getThumbnailCallback, failCallback);
    };

    var getThumbnailCallback = function (connectionRequest) {
        callbackAfterRequest(connectionRequest, 'Error getting thumbnail.', function () {

            if (connectionRequest.response.thumbnailBase64) {
                connectionRequest.options.successCallback && connectionRequest.options.successCallback(connectionRequest.response.thumbnailBase64);
            }
        });
    };

    /**
     * Gets thumbnail by the given camera id and time. 
     * 
     * @param {Object} params - Object containing the following properties:
     * <pre>
     * - {String} cameraId - Id of the requested camera thumbnail
     * - {Number} time - Miliseconds since start of UNIX epoch, in UTC.
     * - {Number} width - Max width of the requested camera thumbnail
     * - {Number} height - Max height of the requested camera thumbnail
     * </pre>
     * @param {Function} successCallback: function that is called when the command execution was successful and the result is passed as a parameter.
     * @param {Function} failCallback: function that is called when the command execution has failed and the error is passed as a parameter.
     */
    this.getThumbnailByTime = function (params, successCallback, failCallback) {

        var commandParams = {
            CameraId: params.cameraId,
            Time: params.time,
            SeekType: 'Time'
        };

        if (params.width) {
            commandParams.DestWidth = params.width;
        }

        if (params.height) {
            commandParams.DestHeight = params.height;
        }

        return self.sendCommand('GetThumbnailByTime', commandParams, { successCallback: successCallback }, getThumbnailByTimeCallback, failCallback);
    }

    /**
     * Called after getThumbnailByTime response is returned.
     */
    var getThumbnailByTimeCallback = function (connectionRequest) {
        callbackAfterRequest(connectionRequest, 'Error getting thumbnail by time', function () {
            connectionRequest.options.successCallback &&
                connectionRequest.options.successCallback(connectionRequest.response.outputParameters.Thumbnail,
                    connectionRequest.response.outputParameters.Timestamp);
        });
    };

    /**
     * Gets the start time of the recordings for a particular camera.
     * 
     * @method getDBStartTime
     * @param {String} cameraId
     * @param {Function} successCallback: function that is called when the command execution was successful and the result is passed as a parameter.
     * @param {Function} failCallback: function that is called when the command execution has failed and the error is passed as a parameter.
     */
    this.getDBStartTime = function (cameraId, successCallback, failCallback) {

        var params = {
            CameraId: cameraId,
            SeekType: 'DbStart'
        };

        return self.sendCommand('GetRecordingTime', params, { successCallback: successCallback }, getDBStartTimeCallback, failCallback);
    };

    /**
     * Called after getDBStartTime response is returned.
     */
    var getDBStartTimeCallback = function (connectionRequest) {
        callbackAfterRequest(connectionRequest, 'Error getting recording time', function () {
            connectionRequest.options.successCallback && connectionRequest.options.successCallback(connectionRequest.response.outputParameters.Time);
        });
    };

    /**
     * Gets the next sequence by given time for the given cameraId. 
     * 
     * @method getNextSequence
     * @param {String} itemId - (Multiple items possible) ID of the item (camera) (GUID) for which are retrieved Sequences.
     * @param {Number} timestamp: milliseconds in UTC, a sequence after this moment will be returned
     * @param {Function} successCallback: function that is called when the command execution was successful and the result is passed as a parameter.
     * @param {Function} failCallback: function that is called when the command execution has failed and the error is passed as a parameter.
     */
    this.getNextSequence = function (itemId, timestamp, successCallback, failCallback) {

        var afterTime = parseInt((new Date().getTime() - timestamp) / 1000);
        afterTime = afterTime < 0 ? 0 : afterTime;

        var params = {
            ItemId: itemId,
            SeqType: 'Recording',
            Time: timestamp,
            AfterTime: afterTime,
            AfterCount: 1,
            ItemKind: "Camera"
        };

        // debuger.getSequences(params);
        return self.sendCommand('GetSequences', params, { successCallback: successCallback }, getNextSequenceCallback, failCallback);
    };

    var getNextSequenceCallback = function (connectionRequest) {
        callbackAfterRequest(connectionRequest, 'Error getting sequences', function () {
            if (connectionRequest.response.sequences.length > 0) {
                connectionRequest.options.successCallback && connectionRequest.options.successCallback(connectionRequest.response.sequences[0]);
            } else {
                connectionRequest.options.successCallback && connectionRequest.options.successCallback(null);
            }
        });
        // debuger.result(connectionRequest.response.sequences);
    };

    /**
     * Gets the previous sequence by given time. 
     * 
     * @method getPrevSequence
     * @param {String}  itemId - (Multiple items possible) ID of the item (camera) (GUID) for which are retrieved Sequences.
     * @param {Number} timestamp: milliseconds in UTC, a sequence before this moment will be returned
     * @param {Function} successCallback: function that is called when the command execution was successful and the result is passed as a parameter.
     * @param {Function} failCallback: function that is called when the command execution has failed and the error is passed as a parameter.
     */
    this.getPrevSequence = function (itemId, timestamp, successCallback, failCallback) {

        var params = {
            ItemId: itemId,
            SeqType: 'Recording',
            Time: timestamp,
            BeforeTime: Date.daysToSeconds(30),
            BeforeCount: 1,
            ItemKind: "Camera"
        };

        // debuger.getSequences(params);
        return self.sendCommand('GetSequences', params, { successCallback: successCallback }, getPrevSequenceCallback, failCallback);
    };

    var getPrevSequenceCallback = function (connectionRequest) {
        callbackAfterRequest(connectionRequest, 'Error getting sequences', function () {
            if (connectionRequest.response.sequences.length > 0) {
                connectionRequest.options.successCallback && connectionRequest.options.successCallback(connectionRequest.response.sequences[0]);
            } else {
                connectionRequest.options.successCallback && connectionRequest.options.successCallback(null);
            }
        });
        // debuger.result(connectionRequest.response.sequences);
    };

    /**
     * Gets all the sequences in the given interval of time.
     * 
     * @method getSequenceInInterval
     * @param {String} itemId - (Multiple items possible) ID of the item (camera) (GUID) for which are retrieved Sequences.
     * @param {Number} startTime: milliseconds in UTC, the start time of the interval
     * @param {Number} endTime: milliseconds in UTC, the end time of the interval
     * @param {String} investigationId - The id of the investigation (export) to be used for extracting the sequences.
     * @param {Function} successCallback: function that is called when the command execution was successful and the result is passed as a parameter.
     * @param {Function} failCallback: function that is called when the command execution has failed and the error is passed as a parameter.
     */
    this.getSequencesInInterval = function (itemId, startTime, endTime, investigationId, successCallback, failCallback) {

        var params = {
            ItemId: itemId,
            SeqType: 'Recording',
            Time: startTime,
            AfterTime: parseInt((endTime - startTime) / 1000),
            AfterCount: 10000,
            ItemKind: "Camera"
        };

        if (investigationId) {
            params.InvestigationId = investigationId;
        }

        return self.sendCommand('GetSequences', params, { successCallback: successCallback }, getSequencesInIntervalCallback, failCallback);

    };

    var getSequencesInIntervalCallback = function (connectionRequest) {
        callbackAfterRequest(connectionRequest, 'Error getting sequences', function () {
            connectionRequest.options.successCallback && connectionRequest.options.successCallback(connectionRequest.response.sequences);
        });
    };

    /**
     * Gets all the sequences for the view.
     * 
     * @method getSequencesForView
     * @param {Array} itemId - (Multiple items possible) ID of the item (camera) (GUID) for which are retrieved Sequences.
     * @param {Number} startTime: milliseconds in UTC, the start time of the interval
     * @param {Number} endTime: milliseconds in UTC, the end time of the interval
     * @param {Number} minTimeBetweenSequences: (optional) If sequences have time gap lower than this value (in seconds), they will be merged in one big sequence. Default value is 0
     * @param {Function} successCallback: function that is called when the command execution was successful and the result is passed as a parameter.
     * @param {Function} failCallback: function that is called when the command execution has failed and the error is passed as a parameter.
     * @param {SeqType} seqType - Type of the sequences requests – enumeration (Motion, Recording, RecordingWithTrigger).
     * @param {String} itemKind - The kind of item for which the sequences are being requested (Camera, Microphone).
     */
    this.getSequencesForView = function (itemId, startTime, endTime, minTimeBetweenSequences, successCallback, failCallback, seqType = "Recording", itemKind = "Camera") {

        var params = {
            ItemId: itemId,
            SeqType: seqType,
            Time: startTime,
            AfterTime: parseInt((endTime - startTime) / 1000),
            AfterCount: 10000,
            ItemKind: itemKind,
            MinTimeBetweenSequences: minTimeBetweenSequences || 1
        };
        return self.sendCommand('GetSequences', params, { successCallback: successCallback }, getSequencesForViewCallback, failCallback);
    };

    var getSequencesForViewCallback = function (connectionRequest) {
        callbackAfterRequest(connectionRequest, 'Error getting sequences', function () {
            connectionRequest.options.successCallback && connectionRequest.options.successCallback(connectionRequest.response.sequences);
        });
    };

    /**
     * Starts a new video export.
     * 
     * @method startVideoExport
     * @param {String} cameraId: indicates the camera this export will be extracted from
     * @param {Number} startTime: timestamp in UTC, the initial time of the export
     * @param {Number} endTime: timestamp in UTC, the end time of the export
     * @param {Function} successCallback: function that is called when the command execution was successful and the result is passed as a parameter.
     * @param {Function} failCallback: function that is called when the command execution has failed and the error is passed as a parameter.
     */
    this.startVideoExport = function (cameraId, startTime, endTime, successCallback, failCallback) {

        var params = {
            CameraId: cameraId,
            StartTime: startTime,
            EndTime: endTime,
            Type: 'Avi'
        };

        return self.sendCommand('StartExport', params, { successCallback: successCallback }, startExportCallback, failCallback);
    };

    /**
     * Restarts an exports that has previously failed. Requires a valid exportId.
     * 
     * @method restartErroneousExport
     * @param {String} exportId: a valid exportId of a previously failed export
     */
    this.restartErroneousExport = function (exportId, successCallback, failCallback) {

        var params = {
            ExportId: exportId
        };

        return self.sendCommand('StartExport', params, { successCallback: successCallback }, startExportCallback, failCallback);
    };

    /**
     * Called after startVideoExport response is returned.
     */
    var startExportCallback = function (connectionRequest) {
        callbackAfterRequest(connectionRequest, 'Error starting export.', function () {
            connectionRequest.options.successCallback && connectionRequest.options.successCallback(connectionRequest.response.outputParameters.ExportId);
        });
    };

    /**
     * Gets the exports for the currently logged user.
     *
     * @method getUserExports
     * @param {Function} successCallback: function that is called when the command execution was successful and the result is passed as a parameter.
     * @param {Function} failCallback: function that is called when the command execution has failed and the error is passed as a parameter.
     */
    this.getUserExports = function (successCallback, failCallback) {

        var params = {
            ExportId: '00000000-0000-0000-0000-000000000000'
        };

        return self.sendCommand('GetExport', params, { successCallback: successCallback }, getUserExportsCallback, failCallback);
    };

    /**
     * Called after getUserExports response is returned.
     */
    var getUserExportsCallback = function (connectionRequest) {
        callbackAfterRequest(connectionRequest, 'Error getting user exports', function () {
            connectionRequest.options.successCallback && connectionRequest.options.successCallback(connectionRequest.response.exports);
        });
    };

    /**
     * Gets all exports.
     * 
     * @method getAllExports
     * @param {Function} successCallback: function that is called when the command execution was successful and the result is passed as a parameter.
     * @param {Function} failCallback: function that is called when the command execution has failed and the error is passed as a parameter.
     */
    this.getAllExports = function (successCallback, failCallback) {

        var params = {
            ExportId: '{A3B9C5FB-FAAD-42C8-AB73-B79D6FFFDBC1}'
        };

        return self.sendCommand('GetExport', params, { successCallback: successCallback }, getAllExportsCallback, failCallback);
    };

    /**
     * Called after getAllExports response is returned.
     */
    var getAllExportsCallback = function (connectionRequest) {
        callbackAfterRequest(connectionRequest, 'Error getting all exports', function () {
            connectionRequest.options.successCallback && connectionRequest.options.successCallback(connectionRequest.response.exports);
        });
    };

    /**
     * Create a temporary disposable download link.
     * 
     * @method createExportDownloadLink
     * 
     * @param {String} exportId: the uniq id of the export.
     * @param {String} investigationId: the uniq id of the investigation.
     * @param {String} exportType: the type of the export: DB, AVI, MKV
     * @param {Function} successCallback: function that is called when the command execution was successful and the result is passed as a parameter.
     * @param {Function} failCallback: function that is called when the command execution has failed and the error is passed as a parameter.
     */
    this.createExportDownloadLink = function (exportId, investigationId, exportType, successCallback, failCallback) {

        var params = {
            ExportId: exportId,
            InvestigationId: investigationId,
            Type: exportType
        };

        return self.sendCommand('CreateExportDownloadLink', params, { successCallback: successCallback }, createExportDownloadLinkCallback, failCallback);
    };

    /**
     * Called after createExportDownloadLink response is returned.
     */
    var createExportDownloadLinkCallback = function (connectionRequest) {
        callbackAfterRequest(connectionRequest, 'Error getting export download link', function () {
            connectionRequest.options.successCallback && connectionRequest.options.successCallback(connectionRequest.response.outputParameters.ExportLink);
        });
    };

    /**
     * Gets and export by id.
     * 
     * @method getExport
     * @param {String} id: the uniq id of the export.
     * @param {Function} successCallback: function that is called when the command execution was successful and the result is passed as a parameter.
     * @param {Function} failCallback: function that is called when the command execution has failed and the error is passed as a parameter.
     */
    this.getExport = function (id, successCallback, failCallback) {

        var params = {
            ExportId: id
        };

        return self.sendCommand('GetExport', params, { successCallback: successCallback }, getExportCallback, failCallback);
    };

    /**
     * Called after getExport response is returned.
     */
    var getExportCallback = function (connectionRequest) {
        callbackAfterRequest(connectionRequest, 'Error getting export', function () {

            if (connectionRequest.response.exports.length === 0) {
                connectionRequest.options.successCallback && connectionRequest.options.successCallback(null);
                return;
            }
            connectionRequest.options.successCallback && connectionRequest.options.successCallback(connectionRequest.response.exports[0]);
        });
    };

    /**
     * Deletes an export by id. 
     * 
     * @method deleteExport
     * @param {String} id: the unique id of the export.
     * @param {Function} successCallback: function that is called when the command execution was successful and the result is passed as a parameter.
     * @param {Function} failCallback: function that is called when the command execution has failed and the error is passed as a parameter.
     */
    this.deleteExport = function (id, successCallback, failCallback) {

        var params = {
            ExportId: id
        };

        return self.sendCommand('DeleteExport', params, { successCallback: successCallback }, deleteExportCallback, failCallback);
    };

    /**
     * Called after deleteExport response is returned.
     */
    var deleteExportCallback = function (connectionRequest) {
        callbackAfterRequest(connectionRequest, 'Error deleting export.', function () {
            connectionRequest.options.successCallback && connectionRequest.options.successCallback();
        });
    };

    /**
     * Sends a GetOutputsAndEvents command to the server. 
     * 
     * @method getOutputsAndEvents
     * @param {Function} successCallback: function that is called when the command execution was successful and the result is passed as a parameter.
     * @param {Function} failCallback: function that is called when the command execution has failed and the error is passed as a parameter.
     */
    this.getOutputsAndEvents = function (successCallback, failCallback) {

        var params = {
            CameraId: '' // empty string for all cameras
        };

        return self.sendCommand('GetOutputsAndEvents', params, { successCallback: successCallback }, getOutputsAndEventsCallback, failCallback);
    };

    var getOutputsAndEventsCallback = function (connectionRequest) {
        callbackAfterRequest(connectionRequest, 'Error getting outputs and events', function () {
            connectionRequest.options.successCallback && connectionRequest.options.successCallback(connectionRequest.response.actions);
        });
    };

    /**
     * Gets server statistic (CPU load, network trafic etc.)
     * 
     * @method getServerStatus
     * @param {Function} successCallback: function that is called when the command execution was successful and the result is passed as a parameter.
     * @param {Function} failCallback: function that is called when the command execution has failed and the error is passed as a parameter.
     */
    this.getServerStatus = function (successCallback, failCallback) {

        return self.sendCommand('GetServerStatus', {}, { successCallback: successCallback }, getServerStatusCallback, failCallback);
    };

    /**
     * Called after getServerStatus command is executed
     * 
     * @param 		connectionRequest		object		Response from AXAJ call
     */
    var getServerStatusCallback = function (connectionRequest) {
        callbackAfterRequest(connectionRequest, 'Error getting server status', function () {
            connectionRequest.options.successCallback && connectionRequest.options.successCallback(connectionRequest.response.ServerStatus);
        });
    };

    /**
     * Triggers an output or event.
     * 
     * @method {triggerOutputOrEvent}
     * @param {String} objectId: the objectId of the item
     * @param {String} triggerType: 'TriggerOutput' or 'TriggerEvent'
     * @param {Function} successCallback: function that is called when the command execution was successful and the result is passed as a parameter.
     * @param {Function} failCallback: function that is called when the command execution has failed and the error is passed as a parameter.
     */
    this.triggerOutputOrEvent = function (objectId, triggerType, successCallback, failCallback) {

        var params = {
            ObjectId: objectId,
            TriggerType: triggerType
        };

        return self.sendCommand('RequestActivation', params, { successCallback: successCallback }, triggerOutputOrEventCallback, failCallback);
    };

    /**
     * If the command succeeded, the connectionRequest.options.successCallback is called without arguments if defined.
     * If the command failed, the connectionRequest.options.successCallback is called with the error code if defined.
     */
    var triggerOutputOrEventCallback = function (connectionRequest) {
        callbackAfterRequest(connectionRequest, 'Error triggering output or event.', function () {
            connectionRequest.options.successCallback && connectionRequest.options.successCallback();
        });
    };

    /**
     * Gets the camera capabilities - export, live, playback, ptz, presets.
     * 
     * @method getCameraCapabilities
     * 
     * @param {String} cameraId: unique ID of the camera
     * @param {Function} successCallback: function that is called when the command execution was successful and the result is passed as a parameter.
     * @param {Function} failCallback: function that is called when the command execution has failed and the error is passed as a parameter.
     */
    this.getCameraCapabilities = function (cameraId, successCallback, failCallback) {

        var params = {
            CameraId: cameraId
        };

        return self.sendCommand('GetCapabilities', params, { successCallback: successCallback }, getCameraCapabilitiesCallback, failCallback);
    };

    /**
     * Called after getCameraCapabilities response is returned.
     */
    var getCameraCapabilitiesCallback = function (connectionRequest) {
        callbackAfterRequest(connectionRequest, 'Error getting camera capabilities', function () {
            connectionRequest.options.successCallback && connectionRequest.options.successCallback(connectionRequest.response.outputParameters);
        });
    };

    /**
     * Asks server to prepare URL for uploading.
     * 
     * @param {Object} params: Parameters to sent to the server
     * @param {Function} successCallback: function that is called when the command execution was successful and the result is passed as a parameter.
     * @param {Function} failCallback: function that is called when the command execution has failed and the error is passed as a parameter.
     */
    this.prepareUpload = function (params, successCallback, failCallback) {
        return self.sendCommand('PrepareUpload', params, { successCallback: successCallback }, prepareUploadCallback, failCallback);
    };

    /**
     * Called after prepareUpload command is executed
     * 
     * @param 		connectionRequest		object		Response from AXAJ call
     */
    var prepareUploadCallback = function (connectionRequest) {
        callbackAfterRequest(connectionRequest, 'Error preparing upload', function () {
            connectionRequest.options.successCallback && connectionRequest.options.successCallback(connectionRequest.response.outputParameters);
        });
    };

    /**
     * Get the status of the upload by given UploadID
     * 
     * @param {Object} params: Parameters to sent to the server
     * @param {Function} successCallback: function that is called when the command execution was successful and the result is passed as a parameter.
     * @param {Function} failCallback: function that is called when the command execution has failed and the error is passed as a parameter.
     */
    this.getUploadStatus = function (params, successCallback, failCallback) {
        return self.sendCommand('GetUploadStatus', params, { successCallback: successCallback }, getUploadStatusCallback, failCallback);
    };

    /**
     * Called after getUploadStatus command is executed
     * 
     * @param 		connectionRequest		object		Response from AXAJ call
     */
    var getUploadStatusCallback = function (connectionRequest) {
        callbackAfterRequest(connectionRequest, 'Error getting upload status', function () {
            connectionRequest.options.successCallback && connectionRequest.options.successCallback(connectionRequest.response.outputParameters);
        });
    };

    /**
     * Get new challenges from server
     * 
     * @param {Object} params: Parameters to sent to the server
     * @param {Function} successCallback: function that is called when the command execution was successful and the result is passed as a parameter.
     * @param {Function} failCallback: function that is called when the command execution has failed and the error is passed as a parameter.
     */
    this.requestChallenges = function (params, successCallback, failCallback) {
        return self.sendCommand('RequestChallenges', params, { successCallback: successCallback }, requestChallengesCallback, failCallback);
    };

    /**
    * Called after RequestChallenges command is executed
    * 
    * @param 		connectionRequest		object		Response from AXAJ call
    */
    var requestChallengesCallback = function (connectionRequest) {
        callbackAfterRequest(connectionRequest, 'Error getting challenges.', function () {
            connectionRequest.options.successCallback && connectionRequest.options.successCallback(connectionRequest.response.outputParameters);
        });
    };

    /**
     * Create playback controller
     * 
     * @param {Object} params: Parameters to sent to the server
     * @param {Function} successCallback: function that is called when the command execution was successful and the result is passed as a parameter.
     * @param {Function} failCallback: function that is called when the command execution has failed and the error is passed as a parameter.
     */
    this.createPlaybackController = function (params, successCallback, failCallback) {
        params.MethodType = 'Push';
        if (!params.CloseOldControllers) {
            params.CloseOldControllers = 'Yes';
        }
        return self.sendCommand('CreatePlaybackController', params, { successCallback: successCallback }, createPlaybackControllerCallback, failCallback);
    };

    /**
     * Called when CreatePlaybackController reposne is received
     * 
     * @param 		connectionRequest		object		Response from AXAJ call
     */
    var createPlaybackControllerCallback = function (connectionRequest) {

        var connectionResponse = connectionRequest.response;
        var videoConnection = new XPMobileSDK.library.VideoConnection(
            connectionResponse.outputParameters.PlaybackControllerId,
            connectionRequest,
            {
                onClose: function () { },
                onRestart: function () { },
                onPushFailed: function () { }
            }
        );
        callbackAfterRequest(connectionRequest, 'Error creating playback controller', function () {
            connectionRequest.options.successCallback && connectionRequest.options.successCallback(videoConnection);
        });
    };

    /**
     * Change several streams at a time
     * 
     * @param {Object} params: Parameters to sent to the server
     * @param {Function} successCallback: function that is called when the command execution was successful and the result is passed as a parameter.
     * @param {Function} failCallback: function that is called when the command execution has failed and the error is passed as a parameter.
     */
    this.changeMultipleStreams = function (params, successCallback, failCallback) {
        return self.sendCommand('ChangeMultipleStreams', params, { successCallback: successCallback }, changeMultipleStreamsCallback, failCallback);
    };

    /**
    * Called when ChangeMultipleStreams reposne is received
    * 
    * @param 		connectionRequest		object		Response from AXAJ call
    */
    var changeMultipleStreamsCallback = function (connectionRequest) {
        callbackAfterRequest(connectionRequest, 'Error getting multiple stream data', function () {
            connectionRequest.options.successCallback && connectionRequest.options.successCallback(connectionRequest.response.outputParameters);
        });
    };

    /**
     * Get all investigations from server
     * 
     * @param {Function} successCallback: function that is called when the command execution was successful and the result is passed as a parameter.
     * @param {Function} failCallback: function that is called when the command execution has failed and the error is passed as a parameter.
     */
    this.getAllInvestigations = function (successCallback, failCallback) {
        var params = {
            ItemId: '{A3B9C5FB-FAAD-42C8-AB73-B79D6FFFDBC1}'
        };
        return self.sendCommand('GetInvestigation', params, { successCallback: successCallback }, getInvestigationsCallback, failCallback);
    };

    /**
     * Get user investigations from server
     * 
     * @param {Function} successCallback: function that is called when the command execution was successful and the result is passed as a parameter.
     * @param {Function} failCallback: function that is called when the command execution has failed and the error is passed as a parameter.
     */
    this.getUserInvestigations = function (successCallback, failCallback) {
        var params = {
            ItemId: '00000000-0000-0000-0000-000000000000'
        };
        return self.sendCommand('GetInvestigation', params, { successCallback: successCallback }, getInvestigationsCallback, failCallback);
    };

    /**
     * Called when getAllInvestigations or getUserInvestigations reponse is received
     * 
     * @param 		connectionRequest		object		Response from AXAJ call
     */
    var getInvestigationsCallback = function (connectionRequest) {
        callbackAfterRequest(connectionRequest, 'Error getting investigations', function () {
            connectionRequest.options.successCallback && connectionRequest.options.successCallback(connectionRequest.response.items);
        });
    };

    /**
     * Gets a specific investigation by its id
     * 
     * @param id: string, the investigation id
     * @param {Function} successCallback: function that is called when the command execution was successful and the result is passed as a parameter.
     * @param {Function} failCallback: function that is called when the command execution has failed and the error is passed as a parameter.
     */
    this.getInvestigation = function (id, successCallback, failCallback) {
        var params = {
            ItemId: id
        };
        return self.sendCommand('GetInvestigation', params, { successCallback: successCallback }, getInvestigationCallback, failCallback);
    };

    /**
     * Called when getInvestigation reponse is received
     * 
     * @param 		connectionRequest		object		Response from AXAJ call
     */
    var getInvestigationCallback = function (connectionRequest) {
        callbackAfterRequest(connectionRequest, 'Error getting investigation', function () {
            connectionRequest.options.successCallback && connectionRequest.options.successCallback(connectionRequest.response.items[0]);
        });
    };

    /**
     * Create investigation to the server
     * 
     * @param {Object} params: Parameters to sent to the server
     * @param {Function} successCallback: function that is called when the command execution was successful and the result is passed as a parameter.
     * @param {Function} failCallback: function that is called when the command execution has failed and the error is passed as a parameter.
     */
    this.createInvestigation = function (params, successCallback, failCallback) {
        return self.sendCommand('CreateInvestigation', params, { successCallback: successCallback }, createInvestigationCallback, failCallback);
    };

    /**
    * Called when CreateInvestigation reposne is received
    * 
    * @param 		connectionRequest		object		Response from AXAJ call
    */
    var createInvestigationCallback = function (connectionRequest) {
        callbackAfterRequest(connectionRequest, 'Error creating investigation to the server.', function () {
            connectionRequest.options.successCallback && connectionRequest.options.successCallback(connectionRequest.response.outputParameters);
        });
    };

    /**
     * Update investigation on the server
     * 
     * @param {Object} params: Parameters to sent to the server
     * @param {Function} successCallback: function that is called when the command execution was successful and the result is passed as a parameter.
     * @param {Function} failCallback: function that is called when the command execution has failed and the error is passed as a parameter.
     */
    this.updateInvestigation = function (params, successCallback, failCallback) {
        return self.sendCommand('UpdateInvestigation', params, { successCallback: successCallback }, updateInvestigationCallback, failCallback);
    };

    /**
     * Update investigation data on the server (avoids reexport).
     * 
     * @param {Object} params: Parameters to sent to the server
     * @param {Function} successCallback: function that is called when the command execution was successful and the result is passed as a parameter.
     * @param {Function} failCallback: function that is called when the command execution has failed and the error is passed as a parameter.
     */
    this.updateInvestigationData = function (params, successCallback, failCallback) {
        return self.sendCommand('UpdateInvestigationData', params, { successCallback: successCallback }, updateInvestigationCallback, failCallback);
    };

    /**
    * Called when CreateInvestigation reposne is received
    * 
    * @param 		connectionRequest		object		Response from AXAJ call
    */
    var updateInvestigationCallback = function (connectionRequest) {
        callbackAfterRequest(connectionRequest, 'Error updating investigation to the server.', function () {
            connectionRequest.options.successCallback && connectionRequest.options.successCallback(connectionRequest.response.outputParameters);
        });
    };

    /**
     * Delete investigation from the server
     * 
     * @param {String} investigationId: Id of investigation to delete
     * @param {Function} successCallback: function that is called when the command execution was successful and the result is passed as a parameter.
     * @param {Function} failCallback: function that is called when the command execution has failed and the error is passed as a parameter.
     */
    this.deleteInvestigation = function (investigationId, successCallback, failCallback) {
        return self.sendCommand('DeleteInvestigation', { ItemId: investigationId }, { successCallback: successCallback }, deleteInvestigationCallback, failCallback);
    };

    /**
    * Called when DeleteInvestigation reposne is received
    * 
    * @param 		connectionRequest		object		Response from AXAJ call
    */
    var deleteInvestigationCallback = function (connectionRequest) {
        callbackAfterRequest(connectionRequest, 'Error deleteing investigation from the server.', function () {
            connectionRequest.options.successCallback && connectionRequest.options.successCallback(!connectionRequest.response.isError);
        });
    };

    /**
     * Cancels investigation creation when in progress.
     * 
     * @param 		investigationId			object		Id of investigation to delete
     */
    this.cancelInvestigation = function (investigationId) {
        return self.sendCommand('CancelInvestigationUpdate', { ItemId: investigationId }, null, cancelInvestigationCallback);
    };


    /**
     * Called when CancelInvestigationUpdate reposne is received
     * 
     * @param 		connectionRequest		object		Response from AXAJ call
     */
    var cancelInvestigationCallback = function (connectionRequest) {
        callbackAfterRequest(connectionRequest, 'Error canceling investigation update');
    };

    /**
     * Starts an investigation export.
     * 
     * @method startInvestigationExport
     * @param {String} investigationId: the uniq id of the investigation.
     * @param {String} exportType: the type of the export: DB, AVI, MKV
     * @param {String} includeAudio - YES/NO - flag whether to include audio in the investigation export
     * @param {String} password - password used to encrypt exported video
     * @param {Function} successCallback: function that is called when the command execution was successful and the result is passed as a parameter.
     * @param {Function} failCallback: function that is called when the command execution has failed and the error is passed as a parameter.
     */
    this.startInvestigationExport = function (investigationId, exportType, includeAudio, password, successCallback, failCallback) {

        var params = {
            InvestigationId: investigationId,
            ExportType: exportType,
            IncludeAudio: includeAudio
        };
        if (password) {
            params.Password = password;
        }

        return self.sendCommand('StartInvestigationExport', params, { successCallback: successCallback }, startInvestigationExportCallback, failCallback);
    };

    /**
     * Called when startInvestigationExport response is returned
     * 
     * @param 		connectionRequest		object		Response from AXAJ call
     */
    var startInvestigationExportCallback = function (connectionRequest) {
        callbackAfterRequest(connectionRequest, 'Error starting investigation export.', function () {
            connectionRequest.options.successCallback && connectionRequest.options.successCallback(connectionRequest.response.outputParameters.ExportId);
        });
    };

    this.deleteInvestigationExport = function (investigationId, exportType, successCallback, failCallback) {

        var params = {
            InvestigationId: investigationId,
            ExportType: exportType
        };

        return self.sendCommand('DeleteInvestigationExport', params, { successCallback: successCallback }, deleteInvestigationExportCallback, failCallback);
    };

    /**
     * Called when deleteInvestigationExport response is returned
     * 
     * @param 		connectionRequest		object		Response from AXAJ call
     */
    var deleteInvestigationExportCallback = function (connectionRequest) {
        callbackAfterRequest(connectionRequest, 'Error deleting investigation export.', connectionRequest.options.successCallback);
    };

    /**
     * Get alarms from server.
     *
     * @param {Object} params: Parameters to sent to the server
     * @param {Function} successCallback: function that is called when the command execution was successful and the result is passed as a parameter.
     * @param {Function} failCallback: function that is called when the command execution has failed and the error is passed as a parameter.
     */
    this.getAlarmList = function (params, successCallback, failCallback) {

        params = {
            MyAlarms: params.MyAlarms || 'No',
            Timestamp: params.Timestamp,
            Operator: 'LessThan',
            Count: params.Count,
            Priority: params.Priority,
            State: params.State
        };

        return self.sendCommand('GetAlarmList', params, { successCallback: successCallback }, getAlarmsCallback, failCallback);
    };

    /**
     * Called when GetAlarmList reponse is received
     * 
     * @param 		connectionRequest		object		Response from AXAJ call
     */
    var getAlarmsCallback = function (connectionRequest) {
        callbackAfterRequest(connectionRequest, 'Error getting alarms', function () {
            connectionRequest.options.successCallback && connectionRequest.options.successCallback(connectionRequest.response.items);
        });
    };

    /**
     * Gets a single alarm. 
     *
     * @param {Object} params: Parameters to sent to the server
     * @param {Function} successCallback: function that is called when the command execution was successful and the result is passed as a parameter.
     * @param {Function} failCallback: function that is called when the command execution has failed and the error is passed as a parameter.
     */
    this.getAlarm = function (alarmId, successCallback, failCallback) {

        var params = {
            AlarmId: alarmId
        };

        return self.sendCommand('GetAlarmList', params, { successCallback: successCallback }, getAlarmCallback, failCallback);
    };

    /**
     * Called when GetAlarmList reponse is received
     * 
     * @param 		connectionRequest		object		Response from AXAJ call
     */
    var getAlarmCallback = function (connectionRequest) {
        callbackAfterRequest(connectionRequest, 'Error getting alarm', function () {
            connectionRequest.options.successCallback && connectionRequest.options.successCallback(connectionRequest.response.items[0]);
        });
    };

    /**
     * Updates an alarm.
     *
     * @param params
     * @param {Function} successCallback: function that is called when the command execution was successful and the result is passed as a parameter.
     * @param {Function} failCallback: function that is called when the command execution has failed and the error is passed as a parameter.
     */
    this.updateAlarm = function (params, successCallback, failCallback) {
        return self.sendCommand('UpdateAlarm', params, { successCallback: successCallback }, updateAlarmCallback, failCallback);
    };

    /**
     * Called when UpdateAlarm reponse is received
     * 
     * @param 		connectionRequest		object		Response from AXAJ call
     */
    var updateAlarmCallback = function (connectionRequest) {
        callbackAfterRequest(connectionRequest, 'Error updating alarms', function () {
            connectionRequest.options.successCallback && connectionRequest.options.successCallback();
        });
    };

    /**
     * Gets settings for alarms (Priority, State).
     * 
     * @param {Function} successCallback: function that is called when the command execution was successful and the result is passed as a parameter.
     * @param {Function} failCallback: function that is called when the command execution has failed and the error is passed as a parameter.
     */
    this.getAlarmDataSettings = function (successCallback, failCallback) {
        return self.sendCommand('GetAlarmDataSettings', {}, { successCallback: successCallback }, getAlarmDataSettingsCallback, failCallback);
    };

    /**
     * Called when GetAlarmList reponse is received
     * 
     * @param 		connectionRequest		object		Response from AXAJ call
     */
    var getAlarmDataSettingsCallback = function (connectionRequest) {
        callbackAfterRequest(connectionRequest, 'Error getting alarm data settings', function () {
            connectionRequest.options.successCallback && connectionRequest.options.successCallback(connectionRequest.response.items);
        });
    };

    /**
     * Gets list of users for the specified alarm. The alarm can be assigned to any one of these users. 
     *
     * @param {String} alarmId: Unique ID of the alarm
     * @param {Function} successCallback: function that is called when the command execution was successful and the result is passed as a parameter.
     * @param {Function} failCallback: function that is called when the command execution has failed and the error is passed as a parameter.
     */
    this.getAlarmUsers = function (alarmId, successCallback, failCallback) {
        return self.sendCommand('GetPermittedUsers', { SourceId: alarmId }, { successCallback: successCallback }, getAlarmUsersCallback, failCallback);
    }

    /**
     * Called when GetPermittedUsers reponse is received
     * 
     * @param 		connectionRequest		object		Response from AXAJ call
     */
    var getAlarmUsersCallback = function (connectionRequest) {
        callbackAfterRequest(connectionRequest, 'Error getting permitted users for alarm', function () {
            connectionRequest.options.successCallback && connectionRequest.options.successCallback(connectionRequest.response.items);
        });
    };

    /**
     * Acknowledges the given alarm.
     *
     * @param {String} alarmId: Unique ID of the alarm
     * @param {Function} successCallback: function that is called when the command execution was successful and the result is passed as a parameter.
     * @param {Function} failCallback: function that is called when the command execution has failed and the error is passed as a parameter.
     */
    this.acknowledgeAlarm = function (alarmId, successCallback, failCallback) {
        return self.sendCommand('AcknowledgeAlarm', { Id: alarmId }, { successCallback: successCallback }, acknowledgeAlarmCallback, failCallback);
    }

    /**
     * Called when GetPermittedUsers reponse is received
     * 
     * @param 		connectionRequest		object		Response from AXAJ call
     */
    var acknowledgeAlarmCallback = function (connectionRequest) {
        callbackAfterRequest(connectionRequest, 'Error acknowledging alarm', function () {
            connectionRequest.options.successCallback && connectionRequest.options.successCallback();
        });
    };

    /**
     * Gets a list of bookmarks. There are 3 valid usages of the command.
     * The first one is to provide Count in order to retrieve only the latest bookmarks.
     * The second one is to provide BookmarkId in order to retrieve a single bookmark.
     * And the last one is to get a list of bookmarks searching from specified bookmark - than BookmarkId and Count should be provided.
     *
     * @method GetBookmarks
     * @param {Object} params - Parameters to sent to the server.  May contain:
     * <pre>
     * - {String} BookmarkId - GUID of the Bookmark.
     *						   If specified along with Count, StartTime will be ignored and the Bookmark will be considered as a start time of the search interval.
     *						   If only BookmarkId is specified than single bookmark will be returned as a result
     * - {Number} Count - Maximum number of bookmarks to be returned in the result. If you want to retrieve a specific bookmark you should not specify the count, but provide the BookmarkId only.
     * - {String} StartTime - (Optional) Start time of the search interval. It specifies from where the search of bookmark will begin. If not specified current time will be considered as a start time.
     * - {String} EndTime - (Optional) End time of the search interval. If the EndTime is set before the StartTime than the bookmarks will be returned in reversed order again starting to search from StartTime to EndTime.
     * - {String} MyBookmarks - (Optional)YES/NO - flag whether to send only my Bookmarks
     * - {String} Keyword - (Optional)Search string to appear in either of the fields 'Reference', 'Header', 'Description'
     * - {String} SearchCameraIds - (Optional) Included cameras GUIDs in a comma separated string
     * </pre>
     * @param {Function} successCallback - function that is called when the command execution was successful and the result is passed as a parameter.
     * @param {Function} failCallback - function that is called when the command execution has failed and the error is passed as a parameter.
     */
    this.GetBookmarks = function (params, successCallback, failCallback) {
        return self.sendCommand('GetBookmarks', params, { successCallback: successCallback }, getBookmarksCallback, failCallback);
    };

    /**
     * Get bookmarks from server.
     *
     * @param {Object} params: Parameters to sent to the server
     * @param {Function} successCallback: function that is called when the command execution was successful and the result is passed as a parameter.
     * @param {Function} failCallback: function that is called when the command execution has failed and the error is passed as a parameter.
     */
    this.getBookmarks = function (params, successCallback, failCallback) {

        var data = {
            MyBookmarks: params.MyBookmarks || 'No',
            BookmarkId: params.BookmarkId,
        };

        if (params.Count) {
            data['Count'] = params.Count;
        }

        if (params.StartTime) {
            data['StartTime'] = params.StartTime;
        }

        if (params.EndTime) {
            data['EndTime'] = params.EndTime;
        }

        if (params.Keyword) {
            data['Keyword'] = params.Keyword;
        }

        if (params.SearchCameraIds) {
            data['SearchCameraIds'] = params.SearchCameraIds;
        }

        return self.sendCommand('GetBookmarks', data, { successCallback: successCallback }, getBookmarksCallback, failCallback);
    };

    /**
     * Called when GetAlarmList reponse is received
     * 
     * @param 		connectionRequest		object		Response from AXAJ call
     */
    var getBookmarksCallback = function (connectionRequest) {
        callbackAfterRequest(connectionRequest, 'Error getting bookmarks', function () {
            connectionRequest.options.successCallback && connectionRequest.options.successCallback(connectionRequest.response.items);
        });
    };

    /**
     * Deletes bookmark by id. 
     * 
     * @method deleteBookmark
     * @param {String} id: the unique id of the bookmark.
     * @param {Function} successCallback: function that is called when the command execution was successful and the result is passed as a parameter.
     * @param {Function} failCallback: function that is called when the command execution has failed and the error is passed as a parameter.
     */
    this.deleteBookmark = function (id, successCallback, failCallback) {

        var params = {
            BookmarkId: id
        };

        return self.sendCommand('DeleteBookmark', params, { successCallback: successCallback }, deleteBookmarkCallback, failCallback);
    };

    /**
     * Called after deleteBookmark response is returned.
     */
    var deleteBookmarkCallback = function (connectionRequest) {
        callbackAfterRequest(connectionRequest, 'Error deleting bookmark.', function () {
            connectionRequest.options.successCallback && connectionRequest.options.successCallback();
        });
    };

    /**
     * Request the next camera for the given carousel.
     * 
     * @param videoId: string
     */
    this.prevCarouselCamera = function (videoId) {
        return self.sendCommand('ControlCarousel', { VideoId: videoId, CarouselCommand: 'PreviousCamera' }, null, prevCarouselCameraCallback);
    };

    /**
     * Called when prevCarouselCamera response is returned
     * 
     * @param 		connectionRequest		object		Response from AXAJ call
     */
    var prevCarouselCameraCallback = function (connectionRequest) {
        callbackAfterRequest(connectionRequest, 'Error getting prev camera from carousel');
    };

    /**
     * Request the next camera for the given carousel.
     * 
     * @param {String} videoId: Id of the video
     */
    this.nextCarouselCamera = function (videoId) {
        return self.sendCommand('ControlCarousel', { VideoId: videoId, CarouselCommand: 'NextCamera' }, null, nextCarouselCameraCallback);
    };

    /**
     * Called when prevCarouselCamera response is returned
     * 
     * @param 		connectionRequest		object		Response from AXAJ call
     */
    var nextCarouselCameraCallback = function (connectionRequest) {
        callbackAfterRequest(connectionRequest, 'Error getting next camera from carousel');
    };

    /**
     * Pauses a carousel.
     * 
     * @param videoId: string
     */
    this.pauseCarousel = function (videoId) {
        return self.sendCommand('ControlCarousel', { VideoId: videoId, CarouselCommand: 'PauseCarousel' }, null, pauseCarouselCallback);
    };

    /**
     * Called when pauseCarousel response is returned
     * 
     * @param 		connectionRequest		object		Response from AXAJ call
     */
    var pauseCarouselCallback = function (connectionRequest) {
        callbackAfterRequest(connectionRequest, 'Error pausing carousel');
    };

    /**
     * Pauses a carousel.
     * 
     * @method resumeCarousel
     * 
     * @param {String} videoId: ID of the video
     */
    this.resumeCarousel = function (videoId) {
        return self.sendCommand('ControlCarousel', { VideoId: videoId, CarouselCommand: 'ResumeCarousel' }, null, resumeCarouselCallback);
    };

    /**
     * Called when resumeCarousel response is returned
     * 
     * @param 		connectionRequest		object		Response from AXAJ call
     */
    var resumeCarouselCallback = function (connectionRequest) {
        callbackAfterRequest(connectionRequest, 'Error resuming carousel');
    };


    this.registerForNotifications = function (setting, successCallback, failCallback) {
        var browser = $.getBrowser();
        var deviceName = browser.name + " " + browser.version + ", " + browser.os;
        var params = {
            Settings: setting,
            DeviceName: XPMobileSDK.library.Connection.dh.encodeString(deviceName),
            DeviceId: XPMobileSDK.library.Connection.connectionId
        };
        return self.RegisterForNotifications(params, successCallback, failCallback);
    };

    this.RegisterForNotifications = function (params, successCallback, failCallback) {
        return self.sendCommand('RegisterForNotifications', params, { successCallback: successCallback }, registerForNotificationsCallback, failCallback);
    };

    var registerForNotificationsCallback = function (connectionRequest) {
        callbackAfterRequest(connectionRequest, 'Error register for notifications.', function () {
            connectionRequest.options.successCallback && connectionRequest.options.successCallback(connectionRequest.response.items);
        });
    };

    this.CreateBookmark = function (params, successCallback, failCallback) {
        return self.sendCommand('CreateBookmark', params, { successCallback: successCallback }, createBookmarkCallback, failCallback);
    };

    var createBookmarkCallback = function (connectionRequest) {
        callbackAfterRequest(connectionRequest, 'Error creating a bookmark.', function () {
            connectionRequest.options.successCallback && connectionRequest.options.successCallback(connectionRequest.response.items);
        });
    };

    this.RequestBookmarkCreation = function (params, successCallback, failCallback) {
        return self.sendCommand('RequestBookmarkCreation', params, { successCallback: successCallback }, requestBookmarkCreationCallback, failCallback);
    };

    var requestBookmarkCreationCallback = function (connectionRequest) {
        callbackAfterRequest(connectionRequest, 'Error requesting a bookmark.', function () {
            connectionRequest.options.successCallback && connectionRequest.options.successCallback(connectionRequest.response.outputParameters);
        });
    };

    this.UpdateBookmark = function (params, successCallback, failCallback) {
        return self.sendCommand('UpdateBookmark', params, { successCallback: successCallback }, updateBookmarkCallback, failCallback);
    };

    var updateBookmarkCallback = function (connectionRequest) {
        callbackAfterRequest(connectionRequest, 'Error update a bookmark.', function () {
            connectionRequest.options.successCallback && connectionRequest.options.successCallback(connectionRequest.response.items);
        });
    };


    /**
     * A general callback to be called after a request operation. 
     * Notifies that the request is finished, checks the response for errors, print error message if necessary and calls the callee callback with the appropriate argument(s).
     *
     * @param connectionRequest.
     * @param errorMessage: logged in the console in case of an error.
     * @param callback
     */
    var callbackAfterRequest = function (connectionRequest, errorMessage, callback) {

        requestFinished(connectionRequest);

        var connectionResponse = connectionRequest.response;

        if (!connectionResponse || connectionResponse.isError) {
            if (connectionRequestResponseIsTerminal(connectionRequest)) {
                logger.error("The application has lost connection due to connectionRequestResponseIsTerminal");
                logger.log(errorMessage);
                lostConnection();
            }
            else {
                if (errorMessage) {
                    logger.error(errorMessage);
                }

                if (connectionRequest.options.failCallback) {
                    connectionRequest.options.failCallback(connectionResponse.error, connectionResponse);
                }
                else if (connectionRequest.options.successCallback) {
                    connectionRequest.options.successCallback(null, connectionResponse.error, connectionResponse);
                }
            }
        }
        else if (callback) {
            callback();
        }
    };

    /**
     * Sends requests to the server. Creates ConnectionRequest instances. 
     * 
     * @method sendCommand
     * 
     * @param commandName: string, the name of the command
     * @param requestParams: json object, the parameters of the command
     * @param options: object, optional, can contain:
     * 				- timeout: integer, time interval in milliseconds after which the request will be aborted
     * 				- reuseConnection: boolean, flag to reuse connection or not
     * 				- viewId: string, the unique GUID of the view that we will work on
     * 				- cameraId: String, the unique GUID of the camera that should be started
     * 				- successCallback: function, callback that is provided by the client code of the Network API which will be called during the execution of the callback parameter.
     * @param successCallback: function, the callback to be called after the response is returned and parsed
     * @param failCallback: function, callback that is provided by the client code of the Network API which will be called if something is wrong with the command.
     */
    this.sendCommand = function (commandName, requestParams, options, successCallback, failCallback) {

        requestParams = requestParams || {};

        if (XPMobileSDKSettings.supportsCHAP && self.SecurityEnabled === 'Yes' && self.CHAPSupported === 'Yes') {
            var challenge = XPMobileSDK.library.CHAP.calculate();
            if (challenge.Challenge && challenge.ChalAnswer) {
                requestParams.Challenge = challenge.Challenge;
                requestParams.ChalAnswer = challenge.ChalAnswer;
            } else if (XPMobileSDK.library.Connection.state === XPMobileSDK.library.ConnectionStates.working) {
                logger.error('No challenges to perform the action');
                return;
            }
        }

        options = options || {};
        if (failCallback) {
            options.failCallback = failCallback;
        }

        logger.log('Sending ' + commandName + ' on ' + (new Date()) + 'with ', requestParams);

        var connectionRequest = new XPMobileSDK.library.ConnectionRequest(commandName, getNextSequenceID(), requestParams, options, successCallback);

        requests.push(connectionRequest);
        return connectionRequest;
    };

    var requestFinished = function (connectionRequest) {
        var index = requests.indexOf(connectionRequest);
        if (index > -1) {
            requests.splice(index, 1);
        }
        var request = {
            parameters: connectionRequest.params,
            options: connectionRequest.options
        };
        var response = connectionRequest.response && {
            parameters: connectionRequest.response.outputParameters
        };
        callMethodOnObservers('connectionRequestSucceeded', request, response);
    };

    /**
     * Each command send to the server has a sequenceID which starts from 1 and is increased with every next request.
     */
    var getNextSequenceID = function () {
        return ++sequenceID;
    };

    var setState = function (state) {
        self.state = state;
        // inform observers of state change
        callMethodOnObservers('connectionStateChanged');
    };

    var callMethodOnObservers = function () {
        if (arguments.length < 1) return;
        var methodName = arguments[0];
        var args = Array.prototype.slice.call(arguments, 1);
        observers.forEach(function (object) {
            if (object[methodName]) {
                try {
                    object[methodName].apply(object, args);
                } catch (e) {
                    logger.error(e);
                    logger.log(e.stack);
                }
            }
        });
    };

    /**
     * Live message
     * Live message methods are used to "ping" the server with LiveMessage commands to keep the connection ID alive.
     * All commands sent to the server should cancel the live message and schedule it again on response. The idea is that if
     * there is a constant stream of communication going on with the server there is no point in sending live messages. Instead
     * we send it only if there is some period of time that we haven't sent any commands.
     * 
     * TODO possible bug: when we have video connections they consume a lot of AJAX calls. And the live messages may get queued. 
     * If that happens it is possible to timeout the connection even though the video is still properly running and everything.
     * 
     * All these methods are private!
     */
    var scheduleLiveMessage = function () {

        if (self.liveMessageTimer) return;

        // serverTimeout is in seconds and setTimeout accepts milliseconds so we have to multiple by 1000. However
        // we shouldn't wait for the entire period but send the live message earlier. Hence the multiplier is smaller
        self.liveMessageTimer = setInterval(self.sendLiveMessage, self.serverTimeout * 1000 / 3);

    };

    this.updateLiveMessageTimer = function (minInterval) {
        // serverTimeout is in seconds and setTimeout accepts milliseconds so we have to multiple by 1000. However
        // we shouldn't wait for the entire period but send the live message earlier. Hence the multiplier is smaller
        var interval = self.serverTimeout * 1000 / 3;

        if (minInterval && typeof minInterval === "number") {
            interval = Math.min(interval, minInterval);
        }

        clearTimeout(self.liveMessageTimer);

        self.liveMessageTimer = setInterval(self.sendLiveMessage, interval);
    };

    var cancelLiveMessage = function () {

        if (!self.liveMessageTimer) return;

        clearTimeout(self.liveMessageTimer);
        self.liveMessageTimer = null;

    };

    this.sendLiveMessage = function () {

        self.LiveMessage();

        if (self.webSocketServer && self.webSocketBrowser) {
            fps.manage(liveMessagesWaiting);
        }

        liveMessagesWaiting++;

    };

    var scheduledDisconnectOnFail;

    var disconnectOnFail = function () {
        cancelLiveMessage();
        setState(XPMobileSDK.library.ConnectionStates.idle);
        XPMobileSDK.library.VideoConnectionPool.clear();
        callMethodOnObservers('connectionProcessingDisconnect');
        self.connectionId = null;
        callMethodOnObservers('connectionDidDisconnect');
        self.destroy();
    };

    var liveMessageFailCallback = function () {
        if (scheduledDisconnectOnFail) {
            return;
        }

        scheduledDisconnectOnFail = setTimeout(disconnectOnFail, self.serverTimeout * 1000);
    };

    /**
     * Sends a LiveMessage command to the server.
     * 
     * @method LiveMessage
     * 
     * @param {Object} params: Parameters to sent to the server
     * @param {Function} successCallback: function that is called when the command execution was successful and the result is passed as a parameter.
     * @param {Function} failCallback: function that is called when the command execution has failed and the error is passed as a parameter.
     * 
     */
    this.LiveMessage = function (params, successCallback, failCallback) {
        params = params || {};
        failCallback = failCallback || liveMessageFailCallback;

        self.sendCommand('LiveMessage', params, { successCallback: successCallback }, liveMessageCallback, failCallback);
    };

    var liveMessageCallback = function (connectionRequest) {

        liveMessagesWaiting--;

        requestFinished(connectionRequest);

        clearTimeout(scheduledDisconnectOnFail);
        scheduledDisconnectOnFail = undefined;

        var connectionResponse = connectionRequest.response;

        if (!connectionResponse || connectionResponse.isError) {
            if (connectionRequestResponseIsTerminal(connectionRequest)) {
                if (self.connectingViaExternalConnectionID) {
                    self.connectingViaExternalConnectionID = false;
                    logger.warn('Old connection ID has expired');
                    callMethodOnObservers('connectionFailedToConnectWithId', connectionResponse && connectionResponse.error);
                    self.connectionId = null;
                } else {
                    lostConnection();
                }
                cancelLiveMessage();
                return;
            }
        }

        if (self.connectingViaExternalConnectionID) {
            self.connectingViaExternalConnectionID = false; // reset the flag
            logger.log('Started connection from external connection ID');
            setState(XPMobileSDK.library.ConnectionStates.working);
            callMethodOnObservers('connectionDidLogIn'); // do we need another method?
            callMethodOnObservers('connectionDidConnectWithId');
        }

        if (connectionResponse.outputParameters.FolderDefinitionsChanged === 'Yes' ||
            connectionResponse.outputParameters.ViewDefinitionsChanged === 'Yes') {
            callMethodOnObservers('connectionReloadConfiguration');
        }

        if (connectionResponse.outputParameters.CameraDefinitionsChanged === 'Yes') {
            callMethodOnObservers('connectionReloadCameraConfiguration');
        }
        if (connectionResponse.items && connectionResponse.items.length > 0) {
            for (var i = 0; i < connectionResponse.items.length; i++) {
                if (connectionResponse.items[i].Type === "Notification") {
                    callMethodOnObservers('receivedNotification', connectionResponse.items[i]);
                }

            }

        }

        scheduleLiveMessage();

    };

    /**
     * Parses the features that are returned from server and puts them in local storage
     * 
     * @param 		features		object		Features that the server is supporting
     */
    var getFeatures = function (features) {

        if (!features) return;

        var data = {};
        for (i in features) {
            switch (i) {
                case 'Challenge':
                    data['CHAPSupported'] = true;
                    break;
                case 'ServerVersion':
                    data['ServerVersion'] = features[i];
                    break;
                case 'ServerType':
                    XPMobileSDKSettings.ServerType = features[i];
                    break;
                case 'ServerDescription':
                    XPMobileSDKSettings.ServerDescription = features[i];
                    break;
                default:
                    var value = isNaN(Number(features[i])) ? features[i] === 'Yes' : Number(features[i]);
                    data[i] = value;
                    break;
            };
        }

        addDirectStreamingStatus(data);
        self.storage && self.storage.setItem('features', data);
        XPMobileSDK.features = data;

    };

    /**
     * Adds the status of the Direct streaming to the XPMobileSDK.features object.
     * 
     *  XPMobileSDK.features.DirectStreaming == 0 - DS not available
     *  XPMobileSDK.features.DirectStreaming == 1 - do not enforce
     *  XPMobileSDK.features.DirectStreaming == 2 - enforce whenever possible
     *  XPMobileSDK.features.DirectStreaming == 3 - enforce for all clients
     */
    var addDirectStreamingStatus = function (data) {

        if (!data.NativeStreamingAvailable) {
            data.DirectStreaming = self.DSServerStatus.NotAvailable;
            return;
        }

        if (!data.TranscodedStreamingAvailable) {
            data.DirectStreaming = self.DSServerStatus.Enforce;
            return;
        }

        if (data.NativeStreamingSuggested) {
            data.DirectStreaming = self.DSServerStatus.EnforceWheneverPossible;
            return;
        }

        data.DirectStreaming = self.DSServerStatus.DoNotEnforce;
    };

    /**
     * Tests if response of a request contains an error that is terminal for the connection, such as connection timeout error!
     */
    var connectionRequestResponseIsTerminal = function (connectionRequest) {
        var connectionResponse = connectionRequest.response;
        if (connectionResponse === undefined
            || connectionResponse.errorCode === XPMobileSDK.library.ConnectionError.WrongID
            || connectionResponse.errorCode === XPMobileSDK.library.ConnectionError.ChallengesLimitReached
            || connectionResponse.errorString === 'Wrong connection ID') {
            return true;
        }
        return false;
    };

    var lostConnection = function () {
        if (self.state !== XPMobileSDK.library.ConnectionStates.lostConnection) {
            setState(XPMobileSDK.library.ConnectionStates.lostConnection);
            self.connectionId = null;
            XPMobileSDK.library.VideoConnectionPool.clear();
            self.destroy();
            callMethodOnObservers('connectionLostConnection');
        }
    };

    /**
     * Destructor. As much as there is such thing in JavaScript.
     * 
     * @method destroy
     */
    this.destroy = function () {
        requests = [];
        if (self.storage) {
            self.storage.removeItem('features');
            self.storage.removeItem('webSocketServer');
            self.storage.removeItem('directStreamingServer');
        }
    };
};

/**
 * List of connection error codes.
 */
XPMobileSDK.library.ConnectionError = {
    NotImplemented: 1,
    NotFullyImplemented: 2,
    BadCommandType: 10,
    BadCommandKind: 11,
    WrongID: 12,
    MissingInputParameter: 13,
    WrongInputParameter: 14,
    InvalidCredentials: 15,
    IncorrectPublicKey: 16,
    SurveillanceServerDown: 17,
    InvalidLicense: 18,
    SecurityError: 19,
    UnknownCameraID: 20,
    UnknownItemID: 21,
    NoPresetsAvailable: 22,
    NotAllowedInThisState: 23,
    FeatureIsDisabled: 24,
    InsufficientUserRights: 25,
    TooManySessions: 26,
    NewConfigurationNotAvailable: 27,
    AddressesNotReachable: 28,
    PlaybackStreamsLimitReached: 29,
    Redirection: 30,
    MovingInvestigations: 31,
    NoRecordingsFound: 32,
    NoRecordingsInInterval: 33,
    SecondStepAuthenticationRequired: 34,
    SecondStepAuthenticationEnabledUsersOnly: 35,
    SecondStepAuthenticationCodeError: 36,
    SecondStepAuthenticationCodeExpired: 37,
    InputParameterTooLong: 43,
    ChallengesLimitReached: 51,

    UknownIdOrInsufficientRightForSomeItems: 52,
    UknownIdOrInsufficientRightForAllItems: 53,
    ItemNotPlayable: 54,

    ChangePassword: 60,
    AccountLockedOut: 61,

    Unknown: 0x7FFFFFFF,
    IncorrectServerResponse: this.Unknown - 21,
    SdkNotConnected: this.Unknown - 20,

    HttpResponseError: this.Unknown - 11,
    HttpRequestError: this.Unknown - 10,

    CommandProcessingError: this.Unknown - 3,
    CommandTimedOut: this.Unknown - 2,
    InternalError: this.Unknown - 1
};
