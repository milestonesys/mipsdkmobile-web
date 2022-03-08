let VideoStreamState = {
	new: 0,
	open: 1,
	closed: 2
};

class VideoStream {
	constructor(videoId, connectionRequest, callbacks) {
		this.videoConnectionElement = document.createElement('video-connection');
		this.videoConnectionElement.videoId = this.videoId = videoId;
		this.videoConnectionElement.location = XPMobileSDKSettings.MobileServerURL + XPMobileSDKSettings.videoChanel;
		this.videoConnectionElement.addEventListener('onReceivedFrame', this.onReceivedFrame.bind(this));
		let videoConnectionManagerElement = document.getElementsByTagName('videos-video-connection-manager')[0];
		if (videoConnectionManagerElement) {
			videoConnectionManagerElement.appendChild(this.videoConnectionElement);
        }

		this.request = {
			parameters: connectionRequest.params,
			options: connectionRequest.options
		};

		this.response = {
			parameters: connectionRequest.response.outputParameters
		};

		if (this.request.options) {
			this.cameraId = this.request.options.cameraId;
			this.signalType = this.request.options.signal;
			this.isReusable = this.request.options.reuseConnection;
		}
		this.isPush = this.request.parameters.MethodType == 'Push';
		this.isDirectStreaming = this.request.parameters.StreamType == 'FragmentedMP4';

		this.supportsPTZ = this.response.parameters.PTZ == 'Yes';
		this.supportsPTZPresets = this.response.parameters.Preset == 'Yes';
		this.supportsPlayback = this.response.parameters.Playback == 'Yes';
		this.supportsExport = this.response.parameters.ExportAvi == 'Yes';

		this.callbacks = callbacks || {};
		this.callbacks.onClose = this.callbacks.onClose || function (videoConnection) { };
		this.callbacks.onRestart = this.callbacks.onRestart || function (videoConnection) { };
		this.callbacks.onPushFailed = this.callbacks.onPushFailed || function () { };

		this.observers = [];

		this.state = VideoStreamState.new;
	}

	open() {
		if (this.state === VideoStreamState.closed) {
			return
        }
		this.videoConnectionElement.dispatchEvent(new CustomEvent('start'));
		this.state = VideoStreamState.closed;
	}

	close() {
		let videoConnectionManagerElement = document.getElementsByTagName('videos-video-connection-manager')[0];
		if (videoConnectionManagerElement && videoConnectionManagerElement.contains(this.videoConnectionElement)) {
			videoConnectionManagerElement.removeChild(this.videoConnectionElement);
		}
		this.videoConnectionElement.dispatchEvent(new CustomEvent('destroy'));
		XPMobileSDK.closeStream(this.videoId);
		this.state = VideoStreamState.close;
	}

	onReceivedFrame(event) {
		if (this.observers.length > 0) {
			this.callMethodOnObservers('videoConnectionReceivedFrame', event.detail.frame);
		}
		else {
			logger.warn('Video connection received an item but doesn\'t have observer to send it to!');
			this.close();
			return;
		}
	}

	/**
	 * Adds an observer for the video connection.
	 * 
	 * @method addObserver
	 * @param observer Any object. Should implement methods from the VideoConnectionObserverInterface.
	 */
	addObserver(observer) {
		this.observers.push(observer);
	}

	/**
	 * Removes an observer for the video connection. 
	 * 
	 * @method removeObserver
	 * @param observer: any object implementing VideoConnectionObserverInterface that should not receive further notifications
	 */
	removeObserver(observer) {
		let index = this.observers.indexOf(observer);
		index != -1 && this.observers.splice(index, 1);
	}

	callMethodOnObservers(method, arg) {
		this.observers.forEach(function (observer) {
			if (observer && observer[method]) {
				observer[method](arg);
			}
		});
	}
};