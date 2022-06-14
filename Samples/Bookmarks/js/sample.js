(function () {
    window.addEventListener('load', function () {
        var connectionDidLogIn = function () {
            var container = document.getElementById('bookmarks-container');
            Application.connectionDidLogIn(container);
            Application.initialize();
        };

        var params = {
            connectionDidLogIn: connectionDidLogIn
        };

        LoginManager.loadAndLogin(params);
    });
})();