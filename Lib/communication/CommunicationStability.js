/**
 * This singleton monitors the stability of the communication between the Web Client and the Mobile Server.
 * Such kind of monitoring is necessary due to the limitation of the simultaneous AJAX requests that the server can process. 
 * 
 * The server gets constantly overloaded when the Web Client shows many cameras on the screen or/and there are many Web Clients connected to the same Mobile Server.
 * When the server is overloaded, some/all of the HTTP requests fail with different HTTP error codes, HTTP error 0 (zero) being the most frequent one.
 * In such situations, the AJAX requests should become less frequent, i.e. the interval between requesting frames for streams should get bigger. 
 * Also, the LiveMessage command should always be with higher priority than the video stream requests to avoid log-out. Loosely speaking, the command channel
 * should be with higher priority than the video channel. 
 * 
 * This singleton modifies the variables declared in the NETWORK object. NETWORK.requestTime is probably the most important, as it defines the interval between two 
 * requests for video frames. The general rule is that if the communication is overloaded, the requestTime interval is bigger, so the server gets a chance to recover. 
 * 
 * @author rvp
 */
var CommunicationStability = new function() {
	
	// Counter for HTTP errors on the command channel. +1 is added on error, -1 is added on success after failure
	var connectionProtocolFails = 0;
	
	// Counter for the recent HTTP errors on the video channel. It tends to zero, as zero means that no HTTP errors have recently occurred
	var videoProtocolFails = 0;
	
	// the last time that an HTTP error occurred on the video channel and the NETWORK.requestTime got bigger
	var videoProtocolFailDate = null;
	
	// reduces videoProtocolFails each second, until it becomes zero
	setInterval(function() {
		
		videoProtocolFails = Math.max(0, videoProtocolFails - 1 - parseInt(videoProtocolFails / NETWORK.VIDEO_PROTOCOL_RECOVER_PACE));
		
		NETWORK.requestTime = NETWORK.minRequestTime + videoProtocolFails * NETWORK.REQUEST_TIME_GROW_PER_HTTP_ERROR;
		NETWORK.requestTimeOnFailure = Math.min(NETWORK.MAX_REQUEST_TIME_ON_FAILURE, NETWORK.requestTime * NETWORK.REQUEST_TIME_GROW_PER_HTTP_ERROR);
		
//		console.show(NETWORK.requestTime + ' request time', 0);
//		console.show(NETWORK.minRequestTime + ' min request time', 1);
//		console.show(NETWORK.requestTimeOnFailure + ' request time on failure', 2);
		
	}, 1000);
	
	// reduces NETWORK.minRequestTime if no recent HTTP errors have occurred
	setInterval(function() {
		if (noRecentVideoFails(NETWORK.MIN_REQUEST_TIME_DECREASE)) {
			NETWORK.minRequestTime = Math.max(NETWORK.MIN_REQUEST_TIME_LOWER_BOUND, NETWORK.minRequestTime * 0.9);
		}
	}, NETWORK.VIDEO_FAILS_MONITOR);
	
	/**
	 * Call this method to indicate that a command (on the command channel) has failed. 
	 * 
	 * @param object: the ConnectionRequest instance
	 */
	this.addBreakDown = function(object) {
		
		if (object.brokenDown) {
			return;
		}
		
		connectionProtocolFails++;
		object.brokenDown = true;
	};
	
	/**
	 * Call this method to indicate that a command (on the command channel) has succeeded. 
	 * 
	 * @param object: the ConnectionRequest instance
	 */
	this.removeBreakDown = function(object) {
		
		if (!object.brokenDown) {
			return;
		}
		
		connectionProtocolFails--;
		object.brokenDown = false;
	};
	
	/**
	 * Call this method to indicate that a video request has failed.
	 */
	this.addVideoBreakDown = function() {
		
		videoProtocolFails++;
		
		if (!videoProtocolFailDate) {
			videoProtocolFailDate = new Date();
		} else {
			if (noRecentVideoFails(NETWORK.MIN_REQUEST_TIME_INCREASE)) {
				NETWORK.minRequestTime = Math.min(NETWORK.MIN_REQUEST_TIME_UPPER_BOUND, NETWORK.minRequestTime * NETWORK.MIN_REQUEST_TIME_GROW);
				videoProtocolFailDate = new Date();
			}
		}
	};
	
	/**
	 * Checks whether the command channel is broken down. 
	 */
	this.isBrokenDown = function() {
		return connectionProtocolFails > 0;
	};
	
	function noRecentVideoFails(interval) {
		return videoProtocolFailDate && new Date().getTime() - videoProtocolFailDate.getTime() > interval;
	}
};