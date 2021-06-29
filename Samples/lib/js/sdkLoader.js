(function () {
    window.LoadMobileSdk = function (callback) {
        callback = callback || function () { };

        var startApp = function () {
            XPMobileSDK.onLoad = callback;
            if (XPMobileSDK.isLoaded()) {
                callback();
            }
        }

        if (!window.SDKModuleLoader) {
            let module = document.createElement('script');
            module.addEventListener('load', function () { SDKModuleLoader.call();});
            module.src = '../lib/js/ModuleLoader.js';
            document.querySelector('head').appendChild(module);
        }

        if ('XPMobileSDK' in window) {
            startApp();
        }
        else {
            script = document.createElement('script');
            script.addEventListener('load', startApp);
            script.src = '../../XPMobileSDK.js';

            document.querySelector('head').appendChild(script);
        }
    };
})();