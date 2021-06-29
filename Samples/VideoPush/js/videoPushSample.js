(function (undefined) {
    var VideoPushController = function () {
        var self = this;

        self.container;
        self.isVideoPushConnectionCreated = false;
        self.canvas;
        self.canvasContext;
        self.videoPushConnection;
        self.pushInterval;
        self.isPushing = false;

        function pushFrameToServer() {
            if (!self.isPushing) {
                return;
            }

            // Push frame to server
            self.videoPushConnection.send(self.canvas.toDataURL('image/jpeg', 0.9));
        }

        function initializeSourceCanvas() {
            /*
                THIS METHOD IS JUST FOR DEMO PURPOSES
                THE CANVAS SOURCE CAN BE TAKEN FROM ANYTHING ELSE YOU WANT TO STREAM 
            */

            var r = 255,
                g = 255,
                b = 255,
                i = 0;

            self.canvasContext.font = '30px Arial';

            self.pushInterval = setInterval(function () {
                r = Math.round(Math.random() * 255);
                g = Math.round(Math.random() * 255);
                b = Math.round(Math.random() * 255);

                self.canvasContext.fillStyle = 'rgb(' + r + ',' + g + ',' + b + ')';
                self.canvasContext.fillRect(0, 0, self.canvas.width, self.canvas.height);

                self.canvasContext.fillStyle = 'rgb(' + (255 - r) + ',' + (255 - g) + ',' + (255 - b) + ')';
                self.canvasContext.fillText('Frame ' + i, 20, 50);

                i++;

                if (i > 999) {
                    i = 0;
                }

                pushFrameToServer();
            }, 1000);
        }

        function toggleVideoPush() {
            if (self.isPushing) {
                self.isPushing = false;

                clearInterval(self.pushInterval);

                // Close video push connection
                // Open video push connection
                self.videoPushConnection.close();
            }
            else {
                initializeSourceCanvas();

                // Open video push connection
                self.videoPushConnection.open(function () {
                    self.isPushing = true;
                }, function (error) {
                    console.error(error);
                });
            }
        }

        function createVideoPush() {
            if (self.isVideoPushConnectionCreated) {
                return;
            }

            self.isVideoPushConnectionCreated = true;

            self.canvas = document.getElementById('push-canvas');
            self.canvasContext = self.canvas.getContext('2d');

            // Initialize video push connection
            XPMobileSDK.createVideoPushConnection(function (videoPushConnection) {
                var togglePushButton = document.getElementById('toggle-video-push-button');
                
                self.videoPushConnection = videoPushConnection;

                togglePushButton.style.display = 'block';
                togglePushButton.addEventListener('click', toggleVideoPush);
            }, function () { }, true);
        }

        function init(event) {
            self.container = event.detail.cameraContainer;

            self.container.addEventListener('playStream', createVideoPush);
        }

        return {
            init: init
        };
    };

    var connectionDidLogIn = function () {
        // Check if VideoPush is enabled
        if (!XPMobileSDK.features.VideoPush) {
            alert('VideoPush is false!');

            return;
        }

        var container = document.getElementById('streams-container');

        container.addEventListener('cameraElementAdded', function (event) {
            var videoPush = new VideoPushController();

            videoPush.init(event);
        });

        Application.connectionDidLogIn(container);
    };

    window.addEventListener('load', function () {
        var params = {
            connectionDidLogIn: connectionDidLogIn
        };

        LoginManager.loadAndLogin(params);
    });
})();