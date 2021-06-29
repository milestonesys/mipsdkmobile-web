(function (undefined) {
    var PtzController = function () {
        var self = this;

        self.videoConnection;
        self.container;

        var ptzTrigger = function (command) {
            XPMobileSDK.ptzMove(self.videoConnection, command);
        };

        var ptzCommands = {
            up: function () { ptzTrigger('Up'); },
            right: function () { ptzTrigger('Right'); },
            down: function () { ptzTrigger('Down'); },
            left: function () { ptzTrigger('Left'); },
            upRight: function () { ptzTrigger('UpRight'); },
            upLeft: function () { ptzTrigger('UpLeft'); },
            downRight: function () { ptzTrigger('DownRight'); },
            downLeft: function () { ptzTrigger('DownLeft'); },
            home: function () { ptzTrigger('Home'); },
            zoomIn: function () { ptzTrigger('ZoomIn'); },
            zoomOut: function () { ptzTrigger('ZoomOut'); }
        };

        function attachPtzControlBar() {
            var ptzTemplate = document.getElementsByClassName('tmpl_ptzManualButtonsOverlay')[0].innerHTML;

            var ptzControl = document.createElement('div');

            ptzControl.innerHTML = ptzTemplate;

            self.container.appendChild(ptzControl);

            ptzControl.classList.add('manualButtonsOverlay');

            // Attach PTZ events
            ptzControl.addEventListener('click', function (event) {
                event.stopPropagation();
            });

            ptzControl.querySelector('.ptz-up').addEventListener('click', ptzCommands.up);
            ptzControl.querySelector('.ptz-right').addEventListener('click', ptzCommands.right);
            ptzControl.querySelector('.ptz-down').addEventListener('click', ptzCommands.down);
            ptzControl.querySelector('.ptz-left').addEventListener('click', ptzCommands.left);
            ptzControl.querySelector('.ptz-upRight').addEventListener('click', ptzCommands.upRight);
            ptzControl.querySelector('.ptz-upLeft').addEventListener('click', ptzCommands.upLeft);
            ptzControl.querySelector('.ptz-downRight').addEventListener('click', ptzCommands.downRight);
            ptzControl.querySelector('.ptz-downLeft').addEventListener('click', ptzCommands.downLeft);
            ptzControl.querySelector('.ptz-home').addEventListener('click', ptzCommands.home);
            ptzControl.querySelector('.ptz-zoomIn').addEventListener('click', ptzCommands.zoomIn);
            ptzControl.querySelector('.ptz-zoomOut').addEventListener('click', ptzCommands.zoomOut);
        }

        function applyPtzPreset(event) {
            event.stopPropagation();

            XPMobileSDK.ptzPreset(self.videoConnection, event.currentTarget.innerHTML);
        }

        function displayPtzPresets(presets) {
            var presetsElement = self.container.querySelector('.ptz-presets');
            var ptzList;
            var tempLi;

            if (presetsElement) {
                self.container.removeChild(presetsElement);
            }

            if (!presets) {
                return;
            }

            presetsElement = document.createElement('div');
            presetsElement.classList.add('ptz-presets');
            presetsElement.innerHTML = document.querySelector('.tmpl_ptzPresets').innerHTML;

            self.container.appendChild(presetsElement);

            ptzList = presetsElement.querySelector('.ptz-list');

            for (var id in presets) {
                tempLi = document.createElement('li');
                tempLi.innerHTML = presets[id];
                tempLi.addEventListener('click', applyPtzPreset);

                ptzList.appendChild(tempLi);
            }
        }

        function requestPtzPresets() {
            // PTZ Presets
            if (!self.videoConnection.supportsPTZPresets) {
                return;
            }

            XPMobileSDK.getPtzPresets(self.videoConnection.cameraId, displayPtzPresets);
        }

        function init(event) {
            var hasPtz = event.detail.cameraItem.PTZ == 'Yes';

            self.container = event.detail.cameraContainer;

            // For the purposes of this demo
            // Do not show cameras without PTZ
            if (!hasPtz) {
                self.container.parentNode.removeChild(self.container);

                return;
            }

            attachPtzControlBar();

            self.container.addEventListener('playStream', function (event) {
                self.videoConnection = event.detail.videoConnection;
                self.videoConnection.cameraId = event.detail.cameraId;

                requestPtzPresets();
            });

            self.container.addEventListener('pauseStream', function (event) {
                self.videoConnection = null;
            });
        }

        return {
            init: init
        };
    };

    function connectionDidLogIn() {
        var container = document.getElementById('streams-container');

        container.addEventListener('cameraElementAdded', function (event) {
            var ptz = new PtzController();

            ptz.init(event);
        });

        Application.connectionDidLogIn(container);
    }

    window.addEventListener('load', function () {
        var params = {
            connectionDidLogIn: connectionDidLogIn
        };

        LoginManager.loadAndLogin(params);
    });
})();