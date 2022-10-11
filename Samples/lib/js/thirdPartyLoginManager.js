(function () {
    var thirdPartyLoginManager = function (settings) {
        var self = this;
        self.connectionDidLogIn;
        self.connectionFailedToLogIn;
        self.ExternalLoginProgress;
        self.authorization_endpoint;
        self.token_endpoint;
        self.code;
        self.connectForm;
        self.loginFormContainer;
        self.loginForm;
        self.lastObserver;
        self.defaultServer;
        self.connectButton;
        self.loginHeader;

        function connectToServer() {
            // Connect to the desired server (defaults to the current URL)
            let serverNameEl = document.querySelector('.server-name');
            let serverName = serverNameEl ? serverNameEl.value : '';
            let url = serverName || XPMobileSDKSettings.MobileServerURL || window.location.origin

            if (!/^http/.test(url)) {
                url = 'http://' + url;
            }

            XPMobileSDKSettings.MobileServerURL = url;

            if (self.lastObserver) {
                XPMobileSDK.removeObserver(self.lastObserver);
            }

            self.lastObserver = {
                connectionDidConnect: connectionDidConnect,
                connectionDidLogIn: self.connectionDidLogIn,
                connectionFailedToLogIn: self.connectionFailedToLogIn
            };

            XPMobileSDK.addObserver(self.lastObserver);
            XPMobileSDK.connect(url);

            serverNameEl = null;
        }

        function toggleLoginFormHandler() {
            if (self.connectForm.classList.contains('display-none')) {
                self.connectForm.classList.remove('display-none');

                XPMobileSDK.removeObserver(self.lastObserver);
                XPMobileSDK.disconnect();
            }
            else {
                self.connectForm.classList.add('display-none');
                self.loginForm.classList.add('display-none');
            }
        }

        function toggleLoginForm() {
            self.loginHeader = document.querySelector('.login-form-header');
            self.loginHeader.removeEventListener('click', toggleLoginFormHandler);
            self.loginHeader.addEventListener('click', toggleLoginFormHandler);
        }

        function initInternal() {
            self.connectForm = document.querySelector('.connect-form-content');
            self.loginForm = document.querySelector('.login-form-content');
            self.loginFormContainer = document.querySelector('.login-form');
            self.defaultServer = document.querySelector('.default-server');
            self.connectButton = document.querySelector('.connect-button');
            self.defaultServer.textContent = '(defaults to: ' + (XPMobileSDKSettings.MobileServerURL || window.location.origin) + ')';
            self.connectButton.addEventListener('click', connectToServer);

            // Display the connect form
            toggleLoginForm();
        }

        function connectionDidConnect() {
            initExternalLogin();
            self.loginForm.classList.remove('display-none');
            if (self.ExternalLoginProgress) {
                self.ExternalLoginProgress = false;
                const code_verifier = XPMobileSDK.sessionStorage.getItem('externalCodeVerifier');
                const redirectURL = encodeURIComponent(location.protocol + '//' + location.hostname + ":" + location.port + location.pathname)
                const scope = encodeURIComponent(thirdPartyLoginManager.ExternalLoginConfig.scope)
                const grant_type = thirdPartyLoginManager.ExternalLoginConfig.grantType
                const client_id = thirdPartyLoginManager.ExternalLoginConfig.clientId

                XPMobileSDK.sessionStorage.removeItem('externalCodeVerifier');
                XPMobileSDK.library.Ajax.Request(self.token_endpoint, {
                    method: 'post',
                    contentType: 'application/x-www-form-urlencoded',
                    postBody: `grant_type=${grant_type}&code=${encodeURIComponent(self.code)}&code_verifier=${code_verifier}&redirect_uri=${redirectURL}&scope=${scope}&client_id=${client_id}`,
                    onSuccess: onGetToken.bind(this),
                    onFailure: onFailureGetToken.bind(this)
                });
            }
        }

        function initExternalLogin() {
            let serverName = XPMobileSDKSettings.MobileServerURL || thirdPartyLoginManager.ServerName;
            serverName = !serverName.endsWith('/') && serverName.concat('/');

            XPMobileSDK.library.Ajax.Request(serverName + thirdPartyLoginManager.IdpRelativePath + '' + thirdPartyLoginManager.IdpConfiguration, {
                method: 'get',
                contentType: 'application/json',
                onSuccess: onGetIDPConfig.bind(this),
                onFailure: onFailureIDPConfig.bind(this)
            });
        }

        function onGetIDPConfig(response) {
            try {
                var data = JSON.parse(response.responseText);
                const { authorization_endpoint, token_endpoint, external_providers_uri } = data
                self.authorization_endpoint = authorization_endpoint;
                XPMobileSDK.sessionStorage.setItem('tokenEndPoint', token_endpoint);

                XPMobileSDK.library.Ajax.Request(external_providers_uri, {
                    method: 'get',
                    contentType: 'application/json',
                    onSuccess: onGetExternalProviders.bind(this),
                    onFailure: onFailureGetExternalProviders.bind(this)
                });

                const send_state = XPMobileSDK.sessionStorage.getItem('externalState');
                XPMobileSDK.sessionStorage.removeItem('externalState');

                const search = new URLSearchParams(window.location.search)
                const state = search.get("state")
                self.code = search.get("code")

                if (!self.code && state !== send_state) {
                    XPMobileSDK.sessionStorage.removeItem('externalCodeVerifier');
                    self.ExternalLoginProgress = false;
                }
            } catch (e) {
                logger.error('can`t parse response from idp config', e);
            }
        }

        function onFailureIDPConfig(err) {
            logger.error('can`t get idp config', err);
        }

        function onGetExternalProviders(response) {
            try {
                const providers = JSON.parse(response.responseText);
                const state = thirdPartyLoginManager.ExternalLoginConfig.state
                const response_type = thirdPartyLoginManager.ExternalLoginConfig.responseType
                const code_challenge_method = thirdPartyLoginManager.ExternalLoginConfig.codeChallengeMethod
                const client_id = thirdPartyLoginManager.ExternalLoginConfig.clientId
                const culture = thirdPartyLoginManager.ExternalLoginConfig.culture
                const prompt = thirdPartyLoginManager.ExternalLoginConfig.prompt
                const scope = encodeURIComponent(thirdPartyLoginManager.ExternalLoginConfig.scope)
                const redirectURL = encodeURIComponent(location.protocol + '//' + location.hostname + ":" + location.port + location.pathname)

                providers.forEach((provider) => {
                    const acrValue = encodeURIComponent(`${thirdPartyLoginManager.ExternalLoginConfig.acrValue}:${provider.loginProviderId}`)
                    const codeVerified = XPMobileSDK.library.PKCECode.getCodeVerifier()
                    const codeChallenge = XPMobileSDK.library.PKCECode.getCodeChallenge()

                    let element = document.querySelector('.btn-oidc');
                    element.setAttribute('href', self.authorization_endpoint + `?response_type=${response_type}&nonce=${codeVerified}&state=${state}&code_challenge=${codeChallenge}&code_challenge_method=${code_challenge_method}&client_id=${client_id}&scope=${scope}&redirect_uri=${redirectURL}&acr_values=${acrValue}&culture=${culture}&prompt=${prompt}`);
                    element.innerHTML = `Log in with ${provider.displayName}`;
                    element.addEventListener('click', function () {
                        XPMobileSDK.sessionStorage.setItem('externalCodeVerifier', codeVerified);
                        XPMobileSDK.sessionStorage.setItem('externalState', state);
                    })
                    element.parentElement.classList.contains('hide') && element.parentElement.classList.remove('hide');
                    element = null;
                })
            } catch (e) {
                logger.error('can`t parse external providers', e);
            }
        }

        function onFailureGetExternalProviders(err) {
            logger.error('can`t get external providers', err);
        }

        function onGetToken(response) {
            try {
                const { access_token, id_token, refresh_token } = JSON.parse(response.responseText);
                XPMobileSDK.externalLogin(thirdPartyLoginManager.ExternalLoginConfig.clientId, id_token, access_token, refresh_token, thirdPartyLoginManager.ExternalLoginConfig.loginType, {});
            } catch (e) {
                logger.error('can`t parse response from get token', e);
            }
        }

        function onFailureGetToken(err) {
            logger.error('can`t get token for idp', err);
        }

        function showLoginErrorMessage() {
            document.getElementsByClassName('error-text')[0].classList.remove('display-none');
        }

        function init() {
            const search = new URLSearchParams(window.location.search)
            const code = search.get("code")
            const state = search.get("state")

            self.connectionDidLogIn = settings.connectionDidLogIn || function () { };
            self.connectionFailedToLogIn = settings.connectionFailedToLogIn || function () { };
            
            initInternal();
            toggleLoginForm();

            if (code && state) {
                self.ExternalLoginProgress = true;
                self.token_endpoint = XPMobileSDK.sessionStorage.getItem('tokenEndPoint');
                self.code = code;

                setTimeout(connectToServer, 800);
            }
        }

        function destroy() {
            self.loginFormContainer.classList.add('hide');
            XPMobileSDK.sessionStorage.removeItem('tokenEndPoint');

            self.connectionDidLogIn = null;
            self.connectionFailedToLogIn = null;
            self.ExternalLoginProgress = null;
            self.authorization_endpoint = null;
            self.token_endpoint = null;
            self.code = null;
            self.connectForm = null;
            self.loginForm = null;
            self.lastObserver = null;
            self.defaultServer = null;
            self.connectButton = null;
            self.loginHeader = null;
        }

        return {
            init: init,
            destroy: destroy,
            showLoginErrorMessage: showLoginErrorMessage
        };
    };

    thirdPartyLoginManager.loadAndLogin = function (params) {
        function loadLoginManager() {
            let loginContainer;

            params.loginContainerId = params.loginContainerId || 'login-form';
            loginContainer = document.getElementById(params.loginContainerId);

            // You can pass username and password for auto-login (just for simplicity in the sample, otherwise - NOT RECOMMENDED)
            var loginManager = new thirdPartyLoginManager({
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

    thirdPartyLoginManager.ExternalLoginConfig = {
        requestLogin: "requestLogin",
        responseType: "code",
        codeChallengeMethod: "S256",
        clientId: "VmsWebClient",
        culture: "en-US",
        prompt: "login",
        scope: "openid profile managementserver offline_access email",
        acrValue: "idp",
        state: "requestLogin",
        loginType: "External",
        grantType: "authorization_code",
    }

    thirdPartyLoginManager.IdpRelativePath = "IDP";
    thirdPartyLoginManager.IdpConfiguration = "/.well-known/openid-configuration";
    thirdPartyLoginManager.ServerName = "https://localhost:8082/";

    window.ThirdPartyLoginManager = thirdPartyLoginManager;
})();