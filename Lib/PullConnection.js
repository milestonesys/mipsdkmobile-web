XPMobileSDK.library.PullConnectionObserverInterface = {
	
	onError: function (request) {},
	onHTTPError: function (request) {},
	onPushFailed: function () {},
	notifyChannel: function (status) {},
	notifyObservers: function (item) {},
	videoConnectionTemporaryDown: function (status) {},
	restart: function () {}
};

XPMobileSDK.library.PullConnection = function(videoURL, options) {
	
	var frameRequestParams = {
		method: 'post',
		contentType: 'text/xml', 
		onLoading: onAjaxLoading,
		onSuccess: onAjaxSuccess,
		onFailure: onAjaxFailure
	};
	
	var lastFrame = null; // Property that keeps the last frame received over the connection
	
	var signalType = options.signalType || null;
	
	// If we have support for ArrayBuffer in the browser
	if (typeof ArrayBuffer !== 'undefined')
		frameRequestParams.responseType = 'arraybuffer';
	
	var self = this;
	self.videoConnectionState = XPMobileSDK.library.VideoConnectionState.running;
	
	var observers = [];
	
	var frameInterval = 0;
	
	/**
	 * Sends ajax request for the next frame
	 */
	function requestNextFrame(timeout) {
		if(canRun() && communicationIsStable(timeout) && notWaiting()) {
			sendRequest(timeout);
		}
	};
	
	function sendRequest(timeout){
		self.nextFrameTimeout = setTimeout(function() {
			clearNextFrameTimeout();
			if (self.videoConnectionState != XPMobileSDK.library.VideoConnectionState.closed) {
				self.ajaxRequest = new XPMobileSDK.library.Ajax.Request(videoURL, frameRequestParams);
			}
		}, timeout || 1);
	};
	
	function communicationIsStable(timeout) {
		if (CommunicationStability.isBrokenDown()) {
			setTimeout(function() {
				requestNextFrame(timeout);
			}, 200);
			return false;
		}
		else return true;
	};
	
	function notClosed() {
		return self.videoConnectionState != XPMobileSDK.library.VideoConnectionState.closed;
	};
	
	function notSarted() {
		return !self.ajaxRequest;
	};
	
	function notWaiting() {
		return !self.nextFrameTimeout;
	}
	
	function canRun() {
		return notSarted() || notClosed() || notWaiting();
	};
	
	/**
	 * Aborts non-responsive requests waiting to timeout, thus stopping the frame request queue.
	 */
	function onAjaxLoading (ajaxRequest) {
		if(notSarted()) {	
			clearRequestTimeout();
			
			var timeout = XPMobileSDKSettings.videoConnectionTimeout;
			self.ajaxRequestTimeout = setTimeout(function () {
				if (!ajaxRequest) return;
				
				logger.warn('aborting video request for ' + self.videoId);
				ajaxRequest.onreadystatechange = function () {};
				ajaxRequest.abort();
				XPMobileSDK.library.Ajax.activeRequestCount--;
				
				callMethodOnObservers('onError', ajaxRequest);
			}.bind(this), timeout);
		}
	}
	
	/**
	 * Receives and parses the response from the server for the next frame.
	 */
	function onAjaxSuccess (ajaxRequest) {
		
		// K2 2016: Broken AJAX responses - indicate observers!
		if (ajaxRequest.status == 0 && (!ajaxRequest.response || ajaxRequest.response.byteLength === 0)) {
			callMethodOnObservers('onHTTPError', ajaxRequest);
			return;
		}
		
		if(notClosed()){
			
			callMethodOnObservers('notifyChannel', true);
			clearRequestTimeout();
			
			try {
				
				var res = ajaxRequest.response;
				
				var currentData = new XPMobileSDK.library.VideoHeaderParser(res);
				if (currentData.duration) {
					var delay = currentData.duration * 1000 * 0.8;
				}

				callMethodOnObservers('notifyObservers', currentData);
				clearRequestTimeout();
				
				if (self.videoConnectionState == XPMobileSDK.library.VideoConnectionState.running) {
					
					if(currentData.stream && currentData.stream.timeBetweenFrames) {
						// give some time fo rthe download but don't flood the network in order to give time to other streams (6 simultanous request)
						frameInterval = (currentData.stream.timeBetweenFrames * 2) / 3;
						self.requestNextFrameInterval = frameInterval;
					}
					else if (frameInterval) {
						self.requestNextFrameInterval = frameInterval;
					}
					else if (!currentData.dataSize && self.signalType == XPMobileSDK.interfaces.VideoConnectionSignal.live) {
						self.requestNextFrameInterval = Math.min(NETWORK.MAX_REQUEST_TIME, self.requestNextFrameInterval * getRandomIntAround(NETWORK.REQUEST_TIME_GROW_PER_EMPTY_FRAME * 100) / 100);
					} else {
						self.requestNextFrameInterval = delay || NETWORK.requestTime;
					}
					
					requestNextFrame(self.requestNextFrameInterval);
					
				}
				lastFrame = currentData;
			} 
			catch (e) {
				logger.error('Exception in video connection ajax response', e);
				logger.error(e.stack);
				
				callMethodOnObservers('onHTTPError', ajaxRequest);
			}
		}
	};
	
	function onAjaxFailure (request) {
		logger.error('ERROR in ajax request for frame for video channel ' + videoURL);
		callMethodOnObservers('onHTTPError', request);
	};
	
	this.restartConnection = function (request) {
		try {
			if (request) {
				callMethodOnObservers('videoConnectionTemporaryDown', request.status);
			} else {
				callMethodOnObservers('videoConnectionTemporaryDown', -2);
			}
			
			if (self.videoConnectionState == XPMobileSDK.library.VideoConnectionState.closed) {
			    return;
			}

			callMethodOnObservers('restart');
		}
		catch (e) {
			// for some reason IE9 throws exception when trying to access request.status
			callMethodOnObservers('videoConnectionTemporaryDown', -1);
		};
	};
	
	this.cleanupCommunication = function() {
		clearNextFrameTimeout();
		clearRequestTimeout();
		clearRequest();
		frameInterval = 0;
	};
	
	function clearNextFrameTimeout() {
		if (self.nextFrameTimeout) {
			clearTimeout(self.nextFrameTimeout);
			self.nextFrameTimeout = null;
		}
	}

	function clearRequestTimeout() {
		if (self.ajaxRequestTimeout) {
			clearTimeout(self.ajaxRequestTimeout);
			self.ajaxRequestTimeout = null;
		}
	}
	
	function clearRequest() {
		if (self.ajaxRequest) {
			if (self.ajaxRequest.readyState != 4 || self.ajaxRequest.status != 200) { 
				self.ajaxRequest.abort();
			}
			delete self.ajaxRequest;
			self.ajaxRequest = null;
		}
	}
	
	this.startCommunication = function (timeout) {
		this.cleanupCommunication();
		requestNextFrame(timeout);
	};
	
	this.videoConnectionChangedState = function(videoConnectionState){
		self.videoConnectionState = videoConnectionState;
	};
	
	this.addObserver = function (observer) {
		observers.push(observer);
	};
	
	this.removeObserver = function(observer) {
		var index = observers.indexOf(observer);
		index != -1 && observers.splice(index, 1);
	};
	
	function getRandomIntAround(number) {
		var min = number - 10;
		var max = number + 10;
		return Math.floor(Math.random() * (max - min + 1)) + min;
	}
	
	function callMethodOnObservers(method, arg) {
		observers.forEach(function(observer) {
			if (observer && observer[method]) {
				observer[method](arg);
			}
		});
	}	
};