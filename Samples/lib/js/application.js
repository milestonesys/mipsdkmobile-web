(function () {
    // Custom Event polyfill
    // https://developer.mozilla.org/en-US/docs/Web/API/CustomEvent/CustomEvent

    if (typeof window.CustomEvent === "function") {
        return;
    }

    function CustomEvent(event, params) {
        params = params || { bubbles: false, cancelable: false, detail: undefined };
        var evt = document.createEvent('CustomEvent');
        evt.initCustomEvent(event, params.bubbles, params.cancelable, params.detail);
        return evt;
    }

    CustomEvent.prototype = window.Event.prototype;

    window.CustomEvent = CustomEvent;
})();

function RequestStreamParams(cameraId, signalType) {
    return {
        CameraId: cameraId,
        DestWidth: 400,
        DestHeight: 300,
        SignalType: signalType /*'Live' or 'Playback'*/,
        MethodType: 'Push' /*'Pull'*/,
        Fps: 25, // This doesn't work for Pull mode, but we have to supply it anyway to keep the server happy
        ComprLevel: 71,
        KeyFramesOnly: 'No' /*'Yes'*/, // Server will give only key frame thumb nails. This will reduce FPS
        RequestSize: 'Yes',
        StreamType: 'Transcoded'
    };
}

var Application = new function () {
    this.connectionDidLogIn = connectionDidLogIn;
    var attachContainerClick = true;
	
    /**
	 * Connection state observing. 
	 */
    function connectionDidLogIn(container, doNotAttackOnContainerClick) {
        container = container || document.body;

        if (doNotAttackOnContainerClick) {
            attachContainerClick = false;
        }

		XPMobileSDK.getAllViews(function (items) {
		    for (var i = 0; i < items[0].Items[0].Items[0].Items.length; i++) {
		        buildCameraElement(items[0].Items[0].Items[0].Items[i], container);
		    }
		});
    }

    /**
     * Builds camera element
     */
    function buildCameraElement(item, wrapper) {
        var container = document.createElement('div');
        container.setAttribute('id', 'container' + item.Id);
        container.setAttribute('class', 'camera');

        var headerElement = document.createElement('h4');
        headerElement.innerHTML = item.Name || '';
        headerElement.setAttribute('class', 'camera-name');
        container.appendChild(headerElement);

        var canvasElement = document.createElement('canvas');
        container.appendChild(canvasElement);

        var videoElement = document.createElement('video');
        container.appendChild(videoElement);

        var bottombar = document.createElement('div');
        bottombar.setAttribute('class', 'bottombar');

        var pauseButton = document.createElement('div');
        pauseButton.setAttribute('class', 'pauseButton btn');
        pauseButton.setAttribute('title', 'Pause');
        bottombar.appendChild(pauseButton);

        var playbackBarButtons = document.createElement('div');
        playbackBarButtons.setAttribute('class', 'playbackBarButtons');

        var playBackButton = document.createElement('div');
        playBackButton.setAttribute('class', 'playBackButton btn');
        playBackButton.setAttribute('title', 'Play backward');
        playbackBarButtons.appendChild(playBackButton);

        var playBackTime = document.createElement('div');
        playBackTime.setAttribute('class', 'playTimeIndex');
        playbackBarButtons.appendChild(playBackTime);

        var playForwardButton = document.createElement('div');
        playForwardButton.setAttribute('class', 'playForwardButton btn');
        playForwardButton.setAttribute('title', 'Play forward');
        playbackBarButtons.appendChild(playForwardButton);


        bottombar.appendChild(playbackBarButtons);
        container.appendChild(bottombar);

        container.addEventListener('click', Camera);

        wrapper.appendChild(container);

        var event = new CustomEvent('cameraElementAdded', {
            detail: {
                cameraItem: item,
                cameraContainer: container
            }
        });

        wrapper.dispatchEvent(event);
    };
    
	function Camera(event) {
	    var container = event.target;

	    if (event.currentTarget.classList.contains("pauseButton")) {
	        var Id = event.currentTarget.parentNode.parentNode.id.replace('container', '');
	    }
	    else {
	        var Id = event.currentTarget.id.replace('container', '');
	    }
	    
	    var canvas = document.querySelector("#container" + Id + ' canvas');
	    var canvasContext = canvas.getContext('2d');
	    var video = document.querySelector("#container" + Id + ' video');
	    var image = document.createElement('img');
	    image.addEventListener('load', onImageLoad);
	    image.addEventListener('error', onImageError);
	    var imageURL, videoController;
	    var drawing = false;

        // Audio autoplay
	    try {
	        var audio = event.currentTarget.querySelector('audio');

	        if (audio) {
	            var playPromise = audio.play();

	            if (playPromise !== undefined) {
	                playPromise.catch(function (e) {
	                    // Auto-play was prevented
	                    // Show a UI element to let the user manually start playback
	                    console.error(e);
	                }).then(function (e) {
	                    // Auto-play started
	                    console.warn(e);
	                });
	            }
	        }
	    }
	    catch (e) {
	        console.error(e);
	    }

	    var videoConnectionObserver = {
	            videoConnectionReceivedFrame: videoConnectionReceivedFrame
	    }

        XPMobileSDK.library.Connection.webSocketBrowser = false;
	    /**
	     * Requesting a video stream. 
	     */
	    var streamRequest = XPMobileSDK.RequestStream(RequestStreamParams(Id, 'Live'), requestStreamCallback, function (error) { } );

	    /**
	     * Video stream request callback 
	     */
	    function requestStreamCallback(videoConnection) {
	        videoController = videoConnection;
	        videoConnection.addObserver(videoConnectionObserver);
	        videoConnection.open();

	        var event = new CustomEvent('playStream', {
	            detail: {
                    cameraId: Id,
	                videoConnection: videoConnection
	            }
	        });

	        container.parentNode.dispatchEvent(event);
	    }

	    document.getElementById('container' + Id).classList.add('playing', 'live');
	    document.getElementById('container' + Id).removeEventListener('click', Camera);

	    if (attachContainerClick) {
	        document.getElementById('container' + Id).addEventListener('click', switchToPlayback);
	    }
	    
	    document.querySelector('#container' + Id + ' .bottombar').setAttribute("style", "display:none;");
	    document.querySelector('#container' + Id + ' .bottombar').classList.remove("onPause");
	    document.querySelector('#container' + Id + ' .playBackButton').addEventListener('click', playBackwardTrigger);
	    document.querySelector('#container' + Id + ' .playForwardButton').addEventListener('click', playForwardTrigger);

	    var playbackTimestamp = new Date();
	    var playbackSpeed = 0;

	    var isLive = true;

	    /**
	     * Executed on received frame. 
	     */
	    function videoConnectionReceivedFrame(frame) {

	        if (!drawing && frame.dataSize > 0) {

	            drawing = true;

	            if (frame.hasSizeInformation) {
	                var multiplier = (frame.sizeInfo.destinationSize.resampling * XPMobileSDK.getResamplingFactor()) || 1;
	                image.width = multiplier * frame.sizeInfo.destinationSize.width;
	                image.height = multiplier * frame.sizeInfo.destinationSize.height;
	            }

	            if (imageURL) {
	                window.URL.revokeObjectURL(imageURL);
	            }

	            imageURL = window.URL.createObjectURL(frame.blob);

	            image.src = imageURL

	            if (!isLive && frame.timestamp.getTime() != playbackTimestamp.getTime())
	            {
	                 updateTime(frame.timestamp);
	            }
	        }
	    }

	    /**
	     * Executed on image load. 
	     */
	    function onImageLoad(event) {
	        canvas.width = image.width;
	        canvas.height = image.height;
	        canvasContext.drawImage(image, 0, 0, canvas.width, canvas.height);

	        drawing = false;
	    }

	    function onImageError(event) {

	        drawing = false;
	    }

	    /**
	     * Stop camera stream 
	     */
	    function stop() {

            if (videoController) {
                videoController.removeObserver(videoConnectionObserver);
                videoController.close();
                videoController = null;
            }

	        if (streamRequest) {
	            XPMobileSDK.cancelRequest(streamRequest);
	            streamRequest = null;
	        }

	        document.getElementById('container' + Id).removeEventListener('click', stop);
	    };

	    function resetState() {

	        playbackSpeed = 0;
	        updatePlaybackButtons();

	        if (streamRequest) {
	            XPMobileSDK.cancelRequest(streamRequest);
	            streamRequest = null;
	        }
	    }

	    /**
	     * Switch to camera playback mode. 
	     */
	    function switchToPlayback() {

	        if (!isLive) return;

	        isLive = false;

	        stop();

	        document.getElementById('container' + Id).removeEventListener('click', switchToPlayback);
	        document.getElementById('container' + Id).classList.remove('live');
	        
	        playbackTimestamp = new Date();

	        showPlaybackControls();
	        resetState();

	        updateTime(playbackTimestamp);

	        streamRequest = XPMobileSDK.RequestStream(RequestStreamParams(Id, 'Playback'), requestStreamCallback, null);
	    }

	    /**
	     * Switch camera to live video
	     */
	    function switchToLive(e) {
	        e.stopPropagation();
	        e.preventDefault();

	        if (isLive) return;

	        isLive = true;

	        stop();

	        document.getElementById('container' + Id).removeEventListener('click', switchToLive);
	        document.getElementById('container' + Id).addEventListener('click', switchToPlayback);
	        document.getElementById('container' + Id).classList.add('playing', 'live');
	        document.querySelector('#container' + Id + ' .bottombar').setAttribute("style", "display:none;");
	        document.querySelector('#container' + Id + ' .bottombar').classList.remove("onPause");

	        resetState();
            
	        streamRequest = XPMobileSDK.RequestStream(RequestStreamParams(Id, 'Live'), requestStreamCallback, function (error) { } );
	    }

	    /**
	     * Trigger camera play backwards
	     */
	    function playBackwardTrigger() {
	        if (playbackSpeed < 0) {
	            playbackChangeSpeed(0);
	        }
	        else {
	            playbackChangeSpeed(-1);
	        }
	    }

	    /**
	     * Trigger camera play forward
	     */
	    function playForwardTrigger() {
	        if (playbackSpeed > 0) {
	            playbackChangeSpeed(0);
	        }
	        else {
	            playbackChangeSpeed(1);
	        }
	    }

	    /**
	     * Show camera playback controls
	     */
	    function showPlaybackControls() {
	        document.getElementById('container' + Id).removeEventListener('click', switchToPlayback);
	        document.getElementById('container' + Id).classList.remove('playing');

	        document.querySelector('#container' + Id + ' .bottombar').setAttribute("style", "display:block;");
	        document.querySelector('#container' + Id + ' .bottombar').classList.add("onPause");
	        
	        document.querySelector('#container' + Id + ' .pauseButton').setAttribute('title', 'Live');
	        document.querySelector('#container' + Id + ' .pauseButton').addEventListener('click', switchToLive);
	    }

	    /**
	     * Change video speed
	     */
	    function playbackChangeSpeed(speed) {
	        if (!videoController || speed == playbackSpeed) return;

	        speed = Math.round(speed);
            
            var params = {
                VideoId: videoController.videoId,
                Speed: speed
            };

            XPMobileSDK.ChangeStream(params, function () {
                var eventType = speed === 0 ? 'pauseStream' : 'playStream';
                var event = new CustomEvent(eventType, {
                    detail: {
                        videoConnection: videoController
                    }
                });

                container.parentNode.dispatchEvent(event);
            });

	        if (speed == 0) {
	            playbackSpeed = 0;
	        }
	        else if (speed < 0) {
	            playbackSpeed = -1;
	        }
	        else if (speed > 0) {
	            playbackSpeed = 1;
	        }

	        updatePlaybackButtons();
	    }

	    /**
	     * Update playback controls depending on the video speed
	     */
	    function updatePlaybackButtons() {
	        var playForwardButton = document.querySelector('#container' + Id + ' .playForwardButton');
	        var playBackButton = document.querySelector('#container' + Id + ' .playBackButton');

	        if (playbackSpeed == 0) {
	            playForwardButton.classList.remove('active');
	            playForwardButton.title = "Play forward";
	            playBackButton.classList.remove('active');
	            playBackButton.title = "Play backwards";
	        }
	        else if (playbackSpeed < 0) {
	            playForwardButton.classList.remove('active');
	            playForwardButton.title = "Play forward";
	            playBackButton.classList.add('active');
	            playBackButton.title = "Pause";
	        }
	        else if (playbackSpeed > 0) {
	            playForwardButton.classList.add('active');
	            playForwardButton.title = "Pause";
	            playBackButton.classList.remove('active');
	            playBackButton.title = "Play backwards";
	            document.getElementById('container' + Id).classList.add('playing');
	        }
	    }

	    /**
	     * Updates time element
	     */
	    function updateTime(timestamp) {

	        if (isLive) return;

	        playbackTimestamp = timestamp;

	        var date = new Date(timestamp);

	        var hours = date.getHours();
	        var minutes = "0" + date.getMinutes();
	        var seconds = "0" + date.getSeconds();
	        var formattedTime = hours + ':' + minutes.substr(-2) + ':' + seconds.substr(-2);

	        document.querySelector('#container' + Id + ' .playTimeIndex').innerHTML = formattedTime;
	    }
	}
};