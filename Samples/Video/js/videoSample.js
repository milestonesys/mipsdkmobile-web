(function () {
    window.addEventListener('load', function () {
        var connectionDidLogIn = function () {
            var container = document.getElementById('streams-container');

            Application.connectionDidLogIn(container);
        };

        var params = {
            connectionDidLogIn: connectionDidLogIn
        };

        LoginManager.loadAndLogin(params);
    });
})();