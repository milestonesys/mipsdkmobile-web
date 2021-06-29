; (function (undefined) {
    function ExportController() {
        var cameraItem;
        var container;
        var progressIndicator;
        var image = document.createElement('img');
        var canvas;
        var canvasContext;
        var exportId;

        function getThumbnailCallback(thumbnail, timestamp) {
            const imageBlob = b64toBlob(thumbnail, 'image/jpeg', 512);

            var imageURL = window.URL.createObjectURL(imageBlob);

            image.src = imageURL;
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

        function startExport() {
            // generate start and end time of the export with duration of 10 s
            var end = new Date().getTime();
            var start = end - 10000;
            var exportRequest = XPMobileSDK.startVideoExport(cameraItem.Id, start, end, startExportCallback, exportError);
        }

        function exportError(error) {
            alert('Error on export. Code: ' + error.code);
        }

        function startExportCallback(expId) {
            exportId = expId;

            updateStatus();
        }

        var updateStatus = function () {
            XPMobileSDK.getExport(exportId, getExportCallback, exportError)
        }

        function getExportCallback(status) {
            // update UI
            progressIndicator.style.width = status.State * 3.8 + 'px'; 

            // continue with the refresh or downlaod the prepared export
            if ((status.State >= 0) & (status.State <= 100)) {
                setTimeout(() => { updateStatus() }, 1000);
            }
            else if (status.State == 101) {
                XPMobileSDK.createExportDownloadLink(status.ExportId, status.InvestigationId, status.Type, openGeneratedLink.bind(this))
            }
        }

        var openGeneratedLink = function (generatedLink) {
            window.location.href = "/" + generatedLink;
            this.exportButton.disabled = false;
        }.bind(this);

        var addExportButton = function () {
            var overlay = document.createElement('div');
            var progressBar = document.createElement('div');
            progressIndicator = document.createElement('div');
            progressIndicator.id = "progress-indicator";
            var button = document.createElement('button');

            function stopPropagation(event) { event.stopPropagation(); };

            progressBar.appendChild(progressIndicator);
            progressBar.classList.add('progress');
            progressBar.addEventListener('click', stopPropagation);

            overlay.classList.add('cloak');
            overlay.addEventListener('click', stopPropagation);

            button.classList.add('start-export-button');
            button.addEventListener('click', (event) => {
                getThumbnail(event);
                startExport();
                button.disabled = "disabled";
            });

            button.innerText = 'Start export';

            container.appendChild(overlay);
            container.appendChild(progressBar);
            container.appendChild(button);

            this.exportButton = button;
        }.bind(this);

        function init(event) {
            cameraItem = event.detail.cameraItem;
            container = event.detail.cameraContainer;

            image.addEventListener('load', onImageLoad);

            canvas = container.querySelector('canvas');
            canvasContext = canvas.getContext('2d');

            addExportButton();
        }

        return {
            init: init
        };
    }

    var connectionDidLogIn = function () {
        var container = document.getElementById('export-container');

        Application.connectionDidLogIn(container);

        container.addEventListener('cameraElementAdded', function (event) {
            var thumbnailController = new ExportController();

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