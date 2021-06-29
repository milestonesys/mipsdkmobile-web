(function () {
    'use strict';
    if (!window.customElements) {
        let script = document.createElement('script');
        script.addEventListener('load', startApp);
        script.src = 'js/polyfill-webcomponents-bundle.js';
        document.querySelector('head').appendChild(script);
    } else {
        startApp();
    }

    function startApp() {
        var params = {
            connectionDidLogIn: function () {
                if (!XPMobileSDK.library.Connection.directStreamingServer) {
                    alert('Your server does not support Live Direct Streaming!');
                } else {
                    XPMobileSDK.getAllViews(function (items) {
                        for (var i = 0; i < items[0].Items[0].Items[0].Items.length; i++) {
                            let videoElement = document.createElement('videos-stream');
                            videoElement.cameraId = items[0].Items[0].Items[0].Items[i].Id;
                            videoElement.name = items[0].Items[0].Items[0].Items[i].Name;
                            document.body.appendChild(videoElement);
                            videoElement.dispatchEvent(new CustomEvent('start'));
                            videoElement.addEventListener('fallback', (event) => {
                                let player = event.target.shadow.lastElementChild.getElementsByClassName('player')[0];
                                let errorMsg = document.createElement('div');
                                errorMsg.innerHTML = "Could not start direct streaming.";
                                player && player.parentNode.appendChild(errorMsg);
                                player && player.parentNode.removeChild(player);
                                errorMsg = null;
                                player = null;
                            });
                        }
                    });
                }
            }
        };
        LoginManager.loadAndLogin(params);
    }
})();