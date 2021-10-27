(function (undefined) {
    var loginManager = function (settings) {
        var self = this;

        self.container;
        self.streamsContainer;
        self.loginFormShown;
        self.connectionDidLogIn;
        self.connectionFailedToLogIn;
        self.credentials;

        var connectForm,
            loginForm,
            lastObserver,
            audioController,
            microphoneStreaming;

        var findInner = function (selector) {
            return self.container.querySelector(selector);
        };

        function connectToServer() {
            // Connect to the desired server (defaults to the current URL)
            var serverNameEl = findInner('.server-name'),
                serverName = serverNameEl ? serverNameEl.value : '',
                url = serverName || XPMobileSDKSettings.MobileServerURL || window.location.origin;

            if (!/^http/.test(url)) {
                url = 'http://' + url;
            }

            XPMobileSDKSettings.MobileServerURL = url;

            if (lastObserver) {
                XPMobileSDK.removeObserver(lastObserver);
            }

            lastObserver = {
                connectionDidConnect: connectionDidConnect,
                connectionDidLogIn: self.connectionDidLogIn,
                connectionFailedToLogIn: self.connectionFailedToLogIn
            };

            XPMobileSDK.addObserver(lastObserver);

            XPMobileSDK.connect(url);
        }

        function loginCommand(username, password, loginType = null) {
            XPMobileSDK.login(username, password, loginType, {
                SupportsAudioIn: 'Yes',
                SupportsAudioOut: 'Yes'
            });
        }

        function login() {
            // Login with the provided credentials
            var username = findInner('.username').value,
                password = findInner('.password').value,
                loginType = findInner("#authentication").value;

            loginCommand(username, password, loginType);
        }

        function toggleLoginFormHandler() {
            if (connectForm.classList.contains('display-none')) {
                connectForm.classList.remove('display-none');

                self.streamsContainer.innerHTML = '';

                self.loginFormShown();

                XPMobileSDK.removeObserver(lastObserver);
                XPMobileSDK.disconnect();
            }
            else {
                connectForm.classList.add('display-none');
                loginForm.classList.add('display-none');
                self.streamsContainer.classList.remove('display-none');
            }
        }

        function toggleLoginForm() {
            var loginHeader = findInner('.login-form-header');

            loginHeader.removeEventListener('click', toggleLoginFormHandler);
            loginHeader.addEventListener('click', toggleLoginFormHandler);
        }

        function initInternal() {
            connectForm = findInner('.connect-form-content');
            loginForm = findInner('.login-form-content');

            // Display the connect form
            toggleLoginForm();

            findInner('.default-server').textContent = '(defaults to: ' + (XPMobileSDKSettings.MobileServerURL || window.location.origin) + ')';

            findInner('.connect-button').addEventListener('click', connectToServer);
        }

        function connectionDidConnect() {
            var loginButton = findInner('.login-button');

            // Display the login form
            loginForm.classList.remove('display-none');

            loginButton.removeEventListener('click', login);
            loginButton.addEventListener('click', login);

            document.querySelector('.username.input').focus();
        }

        function loadMarkup() {
            var template = '../lib/loginManagerTemplate.htm';

            var xhttp = new XMLHttpRequest();

            xhttp.onreadystatechange = function () {
                if (this.readyState == 4) {
                    if (this.status == 200) {
                        self.container.innerHTML = this.responseText;

                        initInternal();
                    }
                }
            }

            xhttp.open('GET', template, true);
            xhttp.send();
        }

        function normalizeSettings() {
            self.container = settings.container || {};
            self.streamsContainer = settings.streamsContainer || {};
            self.loginFormShown = settings.loginFormShown || function () { };
            self.connectionDidLogIn = settings.connectionDidLogIn || function () { };
            self.connectionFailedToLogIn = settings.connectionFailedToLogIn || function () { };
            self.credentials = settings.credentials;
        }

        function showLoginErrorMessage() {
            document.getElementsByClassName('error-text')[0].classList.remove('display-none');
        }

        function init() {
            normalizeSettings();

            if (self.credentials) {
                connectionDidConnect = function () {
                    loginCommand(self.credentials.user, self.credentials.pass, self.credentials.type);
                };

                setTimeout(connectToServer, 800);

                return;
            }

            loadMarkup();
        }

        function destroy() {
            var container = document.getElementById('login-form-container');

            connectForm.classList.add('display-none');
            loginForm.classList.add('display-none');
            document.getElementsByClassName('error-text')[0].classList.add('display-none');

            container.parentNode.removeChild(container);
        }

        return {
            init: init,
            destroy: destroy,
            showLoginErrorMessage: showLoginErrorMessage
        };
    };

    loginManager.loadAndLogin = function (params) {
        function loadLoginManager() {
            var loginContainer,
                credentials;

            if (!!params.user && !!params.pass) {
                credentials = {
                    user: params.user,
                    pass: params.pass,
                    type: params.type || null
                };
            }

            params.loginContainerId = params.loginContainerId || 'login-form-container';

            loginContainer = document.getElementById(params.loginContainerId);


            // You can pass username and password for auto-login (just for simplicity in the sample, otherwise - NOT RECOMMENDED)
            var loginManager = new LoginManager({
                credentials: credentials,
                container: loginContainer,
                connectionDidLogIn: function () {
                    loginManager.destroy();

                    params.connectionDidLogIn();
                },
                connectionFailedToLogIn: function () {
                    loginManager.showLoginErrorMessage();
                }
            });

            loginManager.init();
        }

        LoadMobileSdk(loadLoginManager);
    };

    window.LoginManager = loginManager;
})();