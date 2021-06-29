/**
 * Network parameters - see CommunicationStability.
 * 
 * @author rvp
 */
var NETWORK = {
	
	/**
	 * Constant.
	 * This is the lower bound for the NETWORK.minRequestTime.
	 */
	MIN_REQUEST_TIME_LOWER_BOUND: 100,
	
	/**
	 * Constant.
	 * This is the upper bound for the NETWORK.minRequestTime.
	 */
	MIN_REQUEST_TIME_UPPER_BOUND: 1000,
	
	/**
	 * Constant.
	 * Interval: maximum interval for requesting next camera frame after the last frame is received from the server.
	 * This is the upper bound for the NETWORK.requestTime which can grow exponentially for cameras that are currently not working and do not receive frames. 
	 */
	MAX_REQUEST_TIME: 10000,
	
	/**
	 * Constant.
	 * Interval: maximum interval for requesting next camera frame after the last frame is not received due to a HTTP error. 
	 */
	MAX_REQUEST_TIME_ON_FAILURE: 4000,
	
	/**
	 * Constant.
	 * Coefficient: when the server returns only header instead of frame for a certain camera stream, the next frame will be requested with delay, determined by this coefficient. 
	 */
	REQUEST_TIME_GROW_PER_EMPTY_FRAME: 1.32,
	
	/**
	 * Constant.
	 * Coefficient: how much the NETWORK.requestTime and NETWORK.requestTimeOnFailure grow depending on the number of recent HTTP errors 
	 */
	REQUEST_TIME_GROW_PER_HTTP_ERROR: 10,

	/**
	 * Constant.
	 * Coefficient: how much the NETWORK.minRequestTime grows when HTTP errors occur
	 */
	MIN_REQUEST_TIME_GROW: 1.4,
	
	/**
	 * Constant.
	 * Difference between dates: used to reduce NETWORK.minRequestTime if no HTTP errors have recently occurred. 
	 */
	MIN_REQUEST_TIME_DECREASE: 30000,
	
	/**
	 * Constant.
	 * Difference between dates: used to increase NETWORK.minRequestTime if HTTP errors have recently occurred. 
	 */
	MIN_REQUEST_TIME_INCREASE: 15000,
	
	/**
	 * Constant.
	 * Denominator: determines how fast the HTTP errors on the video channel become obsolete. 
	 * errors -= 1 + errors / pace
	 */
	VIDEO_PROTOCOL_RECOVER_PACE: 13,
	
	/**
	 * Constant.
	 * Interval: monitors the number of recent HTTP errors and modifies the NETWORK.minRequestTime if no errors have recently occurred. 
	 */
	VIDEO_FAILS_MONITOR: 7000,
	
	/**
	 * Variable.
	 * Interval: minimal interval for requesting next camera frame after the last frame is received from the server, i.e. the minimal value of NETWORK.requestTime.
	 * It changes based on the number of HTTP request errors for a given time. 
	 */
	minRequestTime: 10,
	
	/**
	 * Variable.
	 * Interval: current interval for requesting next camera frame after the last frame is received from the server.
	 * Calculated based on the NETWORK.minRequestTime and the number of HTTP request errors for a given time. 
	 */
	requestTime: 10,
	
	/**
	 * Variable.
	 * Interval: current interval for requesting next camera frame after the last frame is not received due to a HTTP error. 
	 */
	requestTimeOnFailure: 2000,
	
	/**
	 * Variable.
	 * Interval: current interval for sending empty message through WebSocket to the server. This will help the reconnection of WebSockets when network ticks occure. 
	 */
	websocketSendMessage: 1000
};
