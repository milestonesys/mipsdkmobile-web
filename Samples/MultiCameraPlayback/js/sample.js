/*

    README:

    To use the sample follow these steps:

    1. Click on any camera thumbnail
    2. Start it with the top(common) playback controls
    3. You can enable any other camera at any time and it will dynamically sync with the playback controller
    4. Use the top controls to play forward, backward or pause
    5. Enjoy!

    P.S. If you want to start all cameras simultaneously uncomment startCameras();

*/

; (function (undefined) {
    var playbackController;

    function buildTopBar(controller) {
        var topBar = document.querySelector('.bottombar.topbar');
        var playBackButton = topBar.querySelector('.playBackButton');
        var playForwardButton = topBar.querySelector('.playForwardButton');

        playBackButton.addEventListener('click', controller.playBackwardTrigger);
        playForwardButton.addEventListener('click', controller.playForwardTrigger);

        topBar.style.display = 'block';
    }

    function startCameras() {
        var cameras = document.getElementsByClassName('camera');
        var event = new Event('click');

        for (var a = 0; a < cameras.length; a++) {
            cameras[a].dispatchEvent(event);
        }
    }

    function Controls(playbackControllerId) {
        this.play = function (speed) {
            XPMobileSDK.changeMultipleStreams({
                PlaybackControllerId: playbackControllerId,
                Speed: typeof speed == 'number' ? speed : 1
            }, function (parameters) { });
        };

        this.pause = function () {
            this.play(0);
        };

        this.goToTime = function (timestamp) {
            XPMobileSDK.changeMultipleStreams({
                PlaybackControllerId: playbackControllerId,
                SeekType: 'Time',
                Time: timestamp
            }, function (parameters) { });
        };
    }

    function Controller() {
        var id;
        var videoConnection;
        var playbackSpeed = 0;
        var controls;
        var self = this;

        function createPlaybackControllerCallback(connection) {
            var connectionResponse = connection.response;
            videoConnection = connection;
            id = connection.response.parameters.PlaybackControllerId;

            var videoConnectionObserver = {
                videoConnectionReceivedFrame: onReceivedFrame,
                videoConnectionTemporaryDown: function () { },
                videoConnectionRecovered: function () { },
                videoConnectionNotAvailable: function () { }
            };

            videoConnection.addObserver(videoConnectionObserver);

            if (videoConnection.getState() == XPMobileSDK.library.VideoConnectionState.notOpened) {
                videoConnection.open();
            }

            controls = new Controls(id);

            buildTopBar(self);

            //startCameras();
        }

        function createPlaybackController() {
            XPMobileSDK.createPlaybackController(
				{
				    SeekType: 'Time',
				    Time: new Date().getTime()
				},
				createPlaybackControllerCallback,
				function (error) { });
        }

        var timeStamp;
        function onReceivedFrame(frame) {

            if (frame.hasPlaybackInformation) {
                onPlaybackEvents(frame.currentPlaybackEvents);
            }

            timeStamp = frame.timestamp;
            updateTime(frame.timestamp);
        }

        function onPlaybackEvents(playbackEvents) {

            if (playbackEvents & XPMobileSDK.library.ItemHeaderParser.PlaybackFlags.Stopped) {
                // onPlaybackStopped();
            }
            if (playbackEvents & XPMobileSDK.library.ItemHeaderParser.PlaybackFlags.Forward) {
                // onPlaybackForward();
            }
            if (playbackEvents & XPMobileSDK.library.ItemHeaderParser.PlaybackFlags.Backward) {
                // onPlaybackBackwards();
            }
        }

        /**
	     * Updates time element
	     */
        function updateTime(timestamp) {
            playbackTimestamp = timestamp;

            var date = new Date(timestamp);

            var hours = date.getHours();
            var minutes = "0" + date.getMinutes();
            var seconds = "0" + date.getSeconds();
            var formattedTime = hours + ':' + minutes.substr(-2) + ':' + seconds.substr(-2);

            document.querySelector('.topbar .playTimeIndex').innerHTML = formattedTime;
        }

        /**
	     * Change video speed
	     */
        function playbackChangeSpeed(speed) {
            if (!videoConnection || speed == playbackSpeed) return;

            speed = Math.round(speed);

            controls.play(speed);

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
            var playForwardButton = document.querySelector('.topbar .playForwardButton');
            var playBackButton = document.querySelector('.topbar .playBackButton');

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
            }
        }

        self.playBackwardTrigger = function () {
            if (playbackSpeed < 0) {
                playbackChangeSpeed(0);
            }
            else {
                playbackChangeSpeed(-1);
            }
        }

        self.playForwardTrigger = function () {
            if (playbackSpeed > 0) {
                playbackChangeSpeed(0);
            }
            else {
                playbackChangeSpeed(1);
            }
        }

        self.getId = function () { return id; }

        createPlaybackController();
    }

    var connectionDidLogIn = function () {
        var container = document.getElementById('streams-container');

        Application.connectionDidLogIn(container, true);

        playbackController = new Controller();
    };

    window.RequestStreamParams = function (cameraId) {
        return {
            CameraId: cameraId,
            DestWidth: 400,
            DestHeight: 300,
            SignalType: 'Playback',
            MethodType: 'Push' /*'Pull'*/,
            Fps: 25, // This doesn't work for Pull mode, but we have to supply it anyway to keep the server happy
            ComprLevel: 71,
            KeyFramesOnly: 'No' /*'Yes'*/, // Server will give only key frame thumb nails. This will reduce FPS
            RequestSize: 'Yes',
            StreamType: 'Transcoded',
            PlaybackControllerId: playbackController.getId()
        };
    };

    window.addEventListener('load', function () {
        var params = {
            connectionDidLogIn: connectionDidLogIn
        };

        LoginManager.loadAndLogin(params);
    });
})();