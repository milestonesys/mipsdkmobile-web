(function () {
    // Custom Event polyfill
    // https://developer.mozilla.org/en-US/docs/Web/API/CustomEvent/CustomEvent

    if (typeof window.CustomEvent === "function") {
        return;
    }

    function CustomEvent(event, params) {
        params = params || { bubbles: false, cancelable: false, detail: undefined };
        var evt = document.createEvent('CustomEvent');
        evt.initCustomEvent(event, params.bubbles, params.cancelable, params.detail);
        return evt;
    }

    CustomEvent.prototype = window.Event.prototype;

    window.CustomEvent = CustomEvent;
})();

var Application = new function () {
    this.connectionDidLogIn = connectionDidLogIn;
    this.initialize = initialize;
    let attachContainerClick = true;
    const bookmarkSection = document.getElementById('bookmarks-container');
    const bookmarkSelectOptions = document.getElementById('cameras');
    const bookmarkForm = document.getElementById('bookmarkForm');
    const allBookmarksTable = document.getElementById('allBookmarks');

    /**
     * Connection state observing. 
     */
    function connectionDidLogIn(container, doNotAttackOnContainerClick) {
        container = container || document.body;

        if (doNotAttackOnContainerClick) {
            attachContainerClick = false;
        }

        bookmarkSection.classList.remove('hide');

        XPMobileSDK.getAllViews(function (items) {
            for (var i = 0; i < items[0].Items[0].Items[0].Items.length; i++) {
                addCamera(items[0].Items[0].Items[0].Items[i], bookmarkSelectOptions);
            }

            var event = new CustomEvent('cameraElementsAdded', {
                detail: {
                    cameraItems: items[0].Items[0].Items[0].Items,
                    cameraContainer: container
                }
            });

            container.dispatchEvent(event);
        });
    }

    function initialize() {
        bookmarkForm.addEventListener('submit', createBookmark);
        allBookmarksTable.addEventListener('getBookmarks', getAllBookmarks);
        getAllBookmarks();
    }

    /**
     * Builds bookmarks panel
     */
    function addCamera(item, wrapper) {
        var option = document.createElement('option');
        option.value = item.Id;
        option.innerHTML = item.Name;
        wrapper.appendChild(option);
    }

    /**
     * Function which create a single bookmark in the mobile server.
     * Required parameters: CameraId, Time, Name, successCallback, errorCallback
     * Optional parameters: Description, StartTime, EndTime
     */
    function createBookmark(event) {
        event.preventDefault();
        const data = serializeFormData(event.target);
        let objRequest = {
            requestData: {
                CameraId: data.Id,
                Name: data.Headline,
                Time: Date.parse(data.DateTime)
            },
            successCreateBookmark,
            failCreateBookmark
        };

        if (data.Description) {
            objRequest.requestData['Description'] = data.Description;
        }

        if (data.StartTime) {
            objRequest.requestData['StartTime'] = Date.parse(data.StartTime);
        }

        if (data.EndTime) {
            objRequest.requestData['EndTime'] = Date.parse(data.EndTime);
        };

        XPMobileSDK.CreateBookmark(objRequest.requestData, objRequest.successCreateBookmark, objRequest.failCreateBookmark);
    }

    let serializeFormData = function (formInput) {
        let data = {};
        const formData = new FormData(formInput)
        for (const pair of formData.entries()) {
            data[pair[0]] = pair[1];
        }

        if (data.DateTime) {
            data.DateTime = new Date(data.DateTime).toUTCString();
        }

        if (data.EndTime) {
            data.DateTime = new Date(data.DateTime).toUTCString();
        }

        return data;
    }

    let successCreateBookmark = function (event) {
        setTimeout(() => {
            allBookmarksTable.dispatchEvent(new CustomEvent('getBookmarks', { detail: { data: '' } }));
        }, 100);

        document.dispatchEvent(new CustomEvent('createBookmark', { detail: { success: true } }));
    };

    let failCreateBookmark = function (event) {
        document.dispatchEvent(new CustomEvent('createBookmark', { detail: { success: false } }));
    };

    /**
     * Function which requests all bookmarks from the mobile server. The default number of requested bookmarks will be 31.
     * Needed parameter Count: bookmarkSize, successCallback, errorCallback
     */
    function getAllBookmarks(event) {
        // Always get the latest 30 bookmarks
        getAllBookmarks = function (callback, errorCallback) {
            XPMobileSDK.getBookmarks({ Count: 30 }, parseGetBookmarksResult, failGetAllBookmarks);
        };

        getAllBookmarks();
    }

    let parseGetBookmarksResult = function (data) {
        removeAllBookmarks();

        const result = {
            Id: '',
            Name: '',
            Description: '',
            Reference: '',
            StartTime: '',
            EndTime: '',
            Time: ''
        };


        const tbodyElement = document.querySelector('tbody');

        for (const [key, value] of Object.entries(data)) {
            const trElement = document.createElement('tr');
            for (const [keyObj, valueObj] of Object.entries(value)) {
                if (result.hasOwnProperty(keyObj)) {

                    result[keyObj] = valueObj;

                    if (valueObj !== "") {
                        if (keyObj === 'StartTime' || keyObj === 'EndTime' || keyObj == 'Time') {
                            result[keyObj] = new Date(parseInt(result[keyObj])).toUTCString();
                        }
                    }
                }
            }

            for (const property in result) {
                const tdElement = document.createElement('td');
                tdElement.innerHTML = result[property];
                trElement.appendChild(tdElement);
            }

            const tdAction = document.createElement('td');
            const button = document.createElement('button');
            button.addEventListener('click', deleteBookmark);

            button.classList.add('remove');
            button.setAttribute('type', 'submit');
            button.setAttribute('bookmarkId', result['Id']);
            button.innerHTML = "Remove";

            tdAction.appendChild(button);
            trElement.appendChild(tdAction);
            tbodyElement.appendChild(trElement);
        }
    }

    let failGetAllBookmarks = function (event) {
        document.dispatchEvent(new CustomEvent('getBookmarks', { detail: { success: false } }));
    };

    let removeAllBookmarks = function () {
        let bookmarkRows = document.querySelectorAll('tbody tr');
        bookmarkRows.forEach(element => { element.remove() })
    }

    /**
     * Function which delete single bookmark from the mobile server.
     * Needed parameter bookmarkId, successCallback, errorCallback
     */
    function deleteBookmark(event) {
        const bookmarkId = event.target.attributes['bookmarkid'].value;
        XPMobileSDK.deleteBookmark(bookmarkId, onSuccess(event), onError)
    }

    let onSuccess = function (event) {
        let element = event.target.parentNode.parentNode;
        element.remove();
    };

    let onError = function () {
        console.error('removed unsuccessfully');
    };
};