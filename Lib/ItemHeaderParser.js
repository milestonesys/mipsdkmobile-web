; (function (undefined) {
    /**
     * Binary parser
     * Do not create instances of this class directly. They are only created by the video connection object and served to you 
     * via its callback. You can then read its properties and data. Which are:
     *  - imageURL - if the frame represents an image, this will be a base64 encoded image;
     *  - frameNumber - index of the frame;
     *  - timestamp - data and time of the frame (Date object);
     *  - hasSizeInformation, hasLiveInformation, hasPlaybackInformation - whether the frame has the corresponding extensions.
     *  If hasSizeInformation is set to true:
     *  	- sizeInfo - contains information about frame size and cropping.
     *  If hasLiveInformation is set to true:
     *  	- changedLiveEvents and currentLiveEvents - masks of flags. See ItemHeaderParser.LiveFlags.
     *  If hasPlaybackInformation is set to true:
     *  	- changedPlaybackEvents and currentPlaybackEvents - masks of flags. See ItemHeaderParser.PlaybackFlags.
     *  
     *  @class ItemHeaderParser
     *  @param 		binary		data		Binary data represented header with all information about the frame and the frame itself
     */
    var parser = function (data) {
        // Stores the context of execution
        var self = this;

        // Stores the pointer to the current bytes offset.
        var bytesOffset = 0;

        // Define data view variable used in older browsers that does not support TypedArray
        var dataView = null;

        var readBytesProcessor = function (arg) {
            return arg;
        };

        var readBytesReversedProcessor = function (arr) {
            return Array.prototype.reverse.call(arr);
        };

        function skipBytes(bytesToSkip) {
            bytesOffset += bytesToSkip;
        }

        function parseDeviceStateInfo(dataCount) {
            var tempErrorCode;
            var tempGUID;

            self.errorCodes = [];

            for (var a = 0; a < dataCount; a++) {
                tempGUID = getGUID();
                tempErrorCode = readBytes(8);

                self.errorCodes.push({ code: tempErrorCode, guid: tempGUID });
            }
        }

        /**
         * Read bytes from ArrayBuffer
         * 
         * @param number bytesCount Number of bytes to read from ArrayByffer
         */
        function readBytes(bytesCount) {
            var bytes = new Uint8Array(data, bytesOffset, bytesCount);
            var result = 0;

            bytesOffset += bytesCount;

            for (var i = 0; i < bytesCount; i++) {
                result += bytes[i] * Math.pow(2, 8 * i);
            }

            return result;
        }

        /**
         * Get frame timestamp in milliseconds unix timestamp  
         */
        function readBytesAsCharacters(bytesCount, flipEndians) {
            var result = [];

            for (var i = 0; i < bytesCount; i++) {
                result.push(String.fromCharCode(readBytes(1)));
            }

            return flipEndians ? result.reverse().join("") : result.join("");
        }

        /**
         * Converts byte to hex string
         * @param {} v 
         * @returns {} 
         */
        function uintToHexString(v) {
            var res = '';
            var map = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'a', 'b', 'c', 'd', 'e', 'f'];

            var vl = (v & 0xf0) >> 4;
            res += map[vl];

            var vr = v & 0x0f;
            res += map[vr];

            return res;
        }

        /**
         * Base method for reading bytes from buffer, processing them and converts to hex string
         * @param {} count - number of bytes to read
         * @returns {} string - hex representation of the bytes read
         */
        function readToStringBase(count, processor) {
            var arr = new Uint8Array(data, bytesOffset, count);
            var processed = processor(arr);
            var res = '';
            for (var i = 0; i < count; i++) {
                res += uintToHexString(processed[i]);
            }
            bytesOffset += count;
            return res;
        }

        /**
         * Reads bytes from buffer, reverse bytes in the array and converts to hex string
         * @param {} count - number of bytes to read
         * @returns {} string - hex representation of the bytes read
         */
        function readToString(count) {
            return readToStringBase(count, readBytesProcessor);
        }

        /**
         * Reads bytes from buffer and converts to hex string
         * @param {} count - number of bytes to read
         * @returns {} string - hex representation of the bytes read
         */
        function readAndReverseToString(count) {
            return readToStringBase(count, readBytesReversedProcessor);
        }

        /**
         * Retrieving string of guid from its binary representation
         */
        function getGUID() {
            var res = '';

            res += readAndReverseToString(4);
            res += '-';
            res += readAndReverseToString(2);
            res += '-';
            res += readAndReverseToString(2);
            res += '-';
            res += readToString(2);
            res += '-';
            res += readToString(6);

            return res;
        }

        self.readBytes = readBytes;
        self.skipBytes = skipBytes;
        self.getGUID = getGUID;

        /**
         * Get all information from header related with frame size
         */
        self.parseSizeInformation = function () {
            self.sizeInfo = { sourceSize: {}, sourceCrop: {}, destinationSize: {} };
            self.sizeInfo.sourceSize.width = readBytes(4);
            self.sizeInfo.sourceSize.height = readBytes(4);
            self.sizeInfo.sourceCrop.left = readBytes(4);
            self.sizeInfo.sourceCrop.top = readBytes(4);
            self.sizeInfo.sourceCrop.right = readBytes(4);
            self.sizeInfo.sourceCrop.bottom = readBytes(4);
            self.sizeInfo.sourceCrop.width = self.sizeInfo.sourceCrop.right - self.sizeInfo.sourceCrop.left;
            self.sizeInfo.sourceCrop.height = self.sizeInfo.sourceCrop.bottom - self.sizeInfo.sourceCrop.top;
            self.sizeInfo.destinationSize.width = readBytes(4);
            self.sizeInfo.destinationSize.height = readBytes(4);
            self.sizeInfo.destinationSize.resampling = readBytes(4);

            // Not currently used
            self.sizeInfo.destinationSize.top = readBytes(4);
            self.sizeInfo.destinationSize.right = readBytes(4);
            self.sizeInfo.destinationSize.bottom = readBytes(4);
        };

        /**
         * Get video connection GUID 
         */
        self.parseLiveInformation = function () {
            self.currentLiveEvents = readBytes(4);
            self.changedLiveEvents = readBytes(4);
        };

        /**
         * Get playback events information 
         */
        self.parsePlaybackInformation = function () {
            self.currentPlaybackEvents = readBytes(4);
            self.changedPlaybackEvents = readBytes(4);
        };

        /**
         * Get stream information 
         */
        self.parseStreamInfo = function () {
            self.stream = {};
            self.stream.headerSize = readBytes(4);
            self.stream.headerVesion = readBytes(4);

            self.stream.reserved = readBytes(4);
            self.stream.validFields = readBytes(4);

            self.stream.timeBetweenFrames = readBytes(4);
            self.stream.dataType = readBytesAsCharacters(4, true);
            self.stream.flags = readBytes(4);

            self.stream.profile = readBytes(4);
            self.stream.level = readBytes(4);

            self.stream.compatibility = readBytes(4);
            self.stream.constrains = readBytes(8);

            self.stream.frameCount = readBytes(4);

            self.stream.hasKeyFrame = (self.stream.flags & parser.StreamInfoFlags.HasKeyFrame) === parser.StreamInfoFlags.HasKeyFrame;
        };

        /**
         * Retrieve frame binary data  
         */
        self.retrieveData = function () {
            self.data = new Uint8Array(data, self.headerSize, self.dataSize);
        };

        self.parseDynamicInformation = function () {
            var dataCount,
                dataType;

            skipBytes(8);

            dataCount = readBytes(4);
            dataType = readBytes(4);

            if (dataType == parser.DynamicInfoDataType.HeaderTypeDeviceStateInfo) {
                parseDeviceStateInfo(dataCount);
            }
        };
    };

    parser.Type = {};
    parser.Type.Frame = 1;
    parser.Type.Fragment = 2;

    parser.Error = {};
    parser.Error.NonFatal = 0x01;
    parser.Error.Fatal = 0x02;

    parser.MainHeaderLength = 36;
    parser.SizeInfoHeaderLength = 32;
    parser.LiveInfoHeaderLength = 8;
    parser.PlaybackInfoHeaderLength = 8;

    parser.HeaderExtensionSize = 0x01;
    parser.HeaderExtensionLiveEvents = 0x02;
    parser.HeaderExtensionPlaybackEvents = 0x04;
    parser.HeaderExtensionNative = 0x08;
    parser.HeaderExtensionMotionEvents = 0x10;
    parser.HeaderExtensionLocationInfo = 0x20;
    parser.HeaderExtensionStreamInfo = 0x40;
    parser.HeaderExtensionCarouselInfo = 0x80;
    parser.HeaderExtensionDynamicInfo = 0x100;

    parser.LiveFlags = {};
    parser.LiveFlags.LiveFeed = 0x01;
    parser.LiveFlags.Motion = 0x02;
    parser.LiveFlags.Recording = 0x04;
    parser.LiveFlags.Notification = 0x08;
    parser.LiveFlags.CameraConnectionLost = 0x10;
    parser.LiveFlags.DatabaseFail = 0x20;
    parser.LiveFlags.DiskFull = 0x40;
    parser.LiveFlags.ClientLiveStopped = 0x80;

    parser.PlaybackFlags = {};
    parser.PlaybackFlags.Stopped = 0x01;
    parser.PlaybackFlags.Forward = 0x02;
    parser.PlaybackFlags.Backward = 0x04;
    parser.PlaybackFlags.DatabaseStart = 0x10;
    parser.PlaybackFlags.DatabaseEnd = 0x20;
    parser.PlaybackFlags.DatabaseError = 0x40;

    parser.DynamicInfoDataType = {};
    parser.DynamicInfoDataType.HeaderTypeDeviceStateInfo = 0;

    parser.StreamInfoFlags = {};
    parser.StreamInfoFlags.HasKeyFrame = 0x01;

    XPMobileSDK.library.ItemHeaderParser = parser;
})();