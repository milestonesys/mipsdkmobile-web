; (function (undefined) {
    function ThumbnailController() {
        var cameraItem;
        var container;
        var image = document.createElement('img');
        var canvas;
        var canvasContext;

        function getThumbnailCallback(thumbnail, timestamp) {
            const imageBlob = b64toBlob(thumbnail, 'image/jpeg', 512);

            var imageURL = window.URL.createObjectURL(imageBlob);

            image.src = imageURL;

            updateTime(Number(timestamp));
        }

        function b64toBlob(b64Data, contentType, sliceSize) {
            const byteCharacters = atob(b64Data);
            const byteArrays = [];

            for (let offset = 0; offset < byteCharacters.length; offset += sliceSize) {
                const slice = byteCharacters.slice(offset, offset + sliceSize);

                const byteNumbers = new Array(slice.length);
                for (let i = 0; i < slice.length; i++) {
                    byteNumbers[i] = slice.charCodeAt(i);
                }

                const byteArray = new Uint8Array(byteNumbers);
                byteArrays.push(byteArray);
            }

            const blob = new Blob(byteArrays, { type: contentType });
            return blob;
        }

        function getThumbnailErrorCallback(error) {
            alert('Error getting thumbnail. Code: ' + error.code);
        }

        /**
         * Request thumbnail for given time
         */
        function getThumbnail(event) {
            event.stopPropagation();

            // This is the time you request from the server
            // You can set it to any valid timestamp
            var thumbnailTime = Date.now();

            var params = {
                cameraId: cameraItem.Id,
                width: 400,
                height: 225,
                time: thumbnailTime
            };

            /**
             * Requesting a thumbnail. 
             */
            XPMobileSDK.getThumbnailByTime(params, getThumbnailCallback, getThumbnailErrorCallback);
        }

        function onImageLoad(event) {
            canvas.width = image.width;
            canvas.height = image.height;

            canvasContext.drawImage(image, 0, 0, canvas.width, canvas.height);
        }

        function addGetThumbnailButton() {
            var overlay = document.createElement('div');
            var button = document.createElement('button');

            overlay.classList.add('cloak');
            overlay.addEventListener('click', function (event) {
                event.stopPropagation();
            });

            button.classList.add('get-thumbnail-button');
            button.addEventListener('click', getThumbnail);
            button.innerText = 'Get Thumbnail';

            container.appendChild(overlay);
            container.appendChild(button);
        }

        function init(event) {
            cameraItem = event.detail.cameraItem;
            container = event.detail.cameraContainer;

            image.addEventListener('load', onImageLoad);

            canvas = container.querySelector('canvas');
            canvasContext = canvas.getContext('2d');

            addGetThumbnailButton();
        }

        function updateTime(timestamp) {
            var date = new Date(timestamp);
            var hours = date.getHours();
            var minutes = "0" + date.getMinutes();
            var seconds = "0" + date.getSeconds();
            var formattedTime = hours + ':' + minutes.substr(-2) + ':' + seconds.substr(-2);

            container.querySelector('.playTimeIndex').innerHTML = formattedTime;
        }

        return {
            init: init
        };
    }

    var connectionDidLogIn = function () {
        var container = document.getElementById('streams-container');

        Application.connectionDidLogIn(container);

        container.addEventListener('cameraElementAdded', function (event) {
            var thumbnailController = new ThumbnailController();

            thumbnailController.init(event);
        });
    };

    window.addEventListener('load', function () {
        var params = {
            connectionDidLogIn: connectionDidLogIn
        };

        LoginManager.loadAndLogin(params);
    });
})();