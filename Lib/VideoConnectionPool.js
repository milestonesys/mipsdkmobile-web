/**
 * A pool of reusable video connections. 
 * 
 * A video connection can be reused if a client needs to open more than one stream for the same camera. In this case the client needs to 
 * provide an additional parameter to the command Connection.requestStream. 
 * 
 * @author rvp
 */
XPMobileSDK.library.VideoConnectionPool = new function() {
	
	/**
	 * An abstraction of a camera in the pool.
	 * 
	 * @param {String} id: the camera id
	 */
	var Camera = function(id, videoConn) {
		this.id = id;
		this.videoConnection = videoConn;
		this.response = undefined;
		this.count = 1;
		this.pendingCallbacks = [];
	};
	
	this.cameras = [];

	/**
	 * Checks if the pool contains a camera with the given cameraId.
	 */
	this.containsCameraByVideoId = function(cameraId,videoId) {
		return this.cameras.some(c => c.id === cameraId && c.videoConnection && c.videoConnection.videoId === videoId);
		
	};

	/**
	 * Adds a camera to the pool.
	 */
	this.addCamera = function(cameraId,videoConn) {
		this.cameras.push(new Camera(cameraId,videoConn));
	};
	
	/**
	 * Removes the camera with the given cameraId from the pool. Further attempts to open a stream for the same camera will result in a new RequestStream command. 
	 */
	this.removeCamera = function(cameraId,videoId) {
		var index = this.cameras.findIndex((c)=>{return c.id == cameraId  && c.videoConnection &&c.videoConnection.videoId == videoId;});
		this.cameras.splice(index, 1);
	};

	/**
	 * Removes all cameras from the pool.
	 */
	this.clear = function() {
		this.cameras = [];
	};
	

	this.getCameraByVideoId = function(cameraId, videoId) {
		return this.cameras.find(c => c.id === cameraId && c.videoConnection && c.videoConnection.videoId == videoId);
	}.bind(this);
};
