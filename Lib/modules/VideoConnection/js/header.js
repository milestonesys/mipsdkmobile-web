import { FrameHeaders } from './config.js';


/**
 * This class is presponsible for parsing video frames from mobile server
 *
 * @param ArrayByffer the raw frame data from mobile server
 */
export default class VideoFrame {
    constructor(data) {
        this.rowData = data;
        this.bytesOffset = 0;
        this.parseHeader();
        this.getData();
    }

    /**
    * Parse video frame headers
    */
    parseHeader() {
        this.uuid = this.getGUID();

        this.timestamp = new Date(this.readBytes(8));
        this.frameNumber = this.readBytes(4);
        this.dataSize = this.readBytes(4);
        this.headerSize = this.readBytes(2);

        let MainHeader = this.readBytes(2);

        this.hasSizeInformation = MainHeader & FrameHeaders.HeaderExtensionSize;
        this.hasLiveInformation = MainHeader & FrameHeaders.HeaderExtensionLiveEvents;
        this.hasPlaybackInformation = MainHeader & FrameHeaders.HeaderExtensionPlaybackEvents;
        this.hasNativeData = MainHeader & FrameHeaders.HeaderExtensionNative;
        this.hasMotionInformation = MainHeader & FrameHeaders.HeaderExtensionMotionEvents;
        this.hasLocationData = MainHeader & FrameHeaders.HeaderExtensionLocationInfo;
        this.hasStreamInfo = MainHeader & FrameHeaders.HeaderExtensionStreamInfo;
        this.hasCarouselInfo = MainHeader & FrameHeaders.HeaderExtensionCarouselInfo;

        if (this.hasSizeInformation) {
            this.parseSizeInformation();
        }

        if (this.hasLiveInformation) {
            this.parseLiveInformation();
        }
        if (this.hasPlaybackInformation) {
            this.parsePlaybackInformation();
        }
        if (this.hasNativeData) {
            this.nativeData = this.readBytes(4); // Remove this by header parser when we have support for Native data
        }
        if (this.hasMotionInformation) {
            this.parseMotionInformation();
        }
        if (this.hasLocationData) {
            this.locationData = this.readBytes(4); // Remove this by header parser when we have support for Stream location
        }
        if (this.hasStreamInfo) {
            this.parseStreamInfo();
        }
        if (this.hasCarouselInfo) {
            this.parseCarouselInfo();
        }
    }

    /**
    * Read bytes from ArrayBuffer
    * 
    * @param number bytesCount Number of bytes to read from ArrayByffer
    */
    readBytes(bytesCount) {
        let bytes = new Uint8Array(this.rowData, this.bytesOffset, bytesCount);
        let result = 0;

        this.bytesOffset += bytesCount;

        for (let i = 0; i < bytesCount; i++) {
            result += bytes[i] * Math.pow(2, 8 * i);
        }

        return result;
    }

    /**
    * Retrieving string of guid from its binary representation
    */
    getGUID() {
        var res = '';

        res += this.readAndReverseToString(4);
        res += '-';
        res += this.readAndReverseToString(2);
        res += '-';
        res += this.readAndReverseToString(2);
        res += '-';
        res += this.readToString(2);
        res += '-';
        res += this.readToString(6);

        return res;
    }

    /**
    * Reads bytes from buffer and converts to hex string
    * 
    * @param {} count - number of bytes to read
    * @returns {} string - hex representation of the bytes read
    */
    readAndReverseToString(count) {
        return this.readToStringBase(count, this.readBytesReversedProcessor);
    }

    readBytesReversedProcessor(arr) {
        return Array.prototype.reverse.call(arr);
    }

    /**
    * Base method for reading bytes from buffer, processing them and converts to hex string
    * @param {} count - number of bytes to read
    * @returns {} string - hex representation of the bytes read
    */
    readToStringBase(count, processor) {
        const arr = new Uint8Array(this.rowData, this.bytesOffset, count);
        const processed = processor(arr);
        let res = '';
        for (let i = 0; i < count; i++) {
            res += this.uintToHexString(processed[i]);
        }
        this.bytesOffset += count;
        return res;
    }

    /**
    * Get frame timestamp in milliseconds unix timestamp  
    */
    readBytesAsCharacters(bytesCount, flipEndians) {
        let result = [];

        for (let i = 0; i < bytesCount; i++) {
            result.push(String.fromCharCode(this.readBytes(1)));
        }

        return flipEndians ? result.reverse().join("") : result.join("");
    }

    /**
    * Reads bytes from buffer, reverse bytes in the array and converts to hex string
    * 
    * @param {} count - number of bytes to read
    * @returns {} string - hex representation of the bytes read
    */
    readToString(count) {
        return this.readToStringBase(count, this.readBytesProcessor);
    }

    readBytesProcessor(arg) {
        return arg;
    }

    /**
    * Converts byte to hex string
    * @param {} v 
    * @returns {} 
    */
    uintToHexString(v) {
        let res = '';
        const map = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'a', 'b', 'c', 'd', 'e', 'f'];

        const vl = (v & 0xf0) >> 4;
        res += map[vl];

        const vr = v & 0x0f;
        res += map[vr];

        return res;
    }

    /**
     * Get all information from header related with frame size
     */
    parseSizeInformation () {
        this.sizeInfo = { sourceSize: {}, sourceCrop: {}, destinationSize: {} };
        this.sizeInfo.sourceSize.width = this.readBytes(4);
        this.sizeInfo.sourceSize.height = this.readBytes(4);
        this.sizeInfo.sourceCrop.left = this.readBytes(4);
        this.sizeInfo.sourceCrop.top = this.readBytes(4);
        this.sizeInfo.sourceCrop.right = this.readBytes(4);
        this.sizeInfo.sourceCrop.bottom = this.readBytes(4);
        this.sizeInfo.sourceCrop.width = this.sizeInfo.sourceCrop.right - this.sizeInfo.sourceCrop.left;
        this.sizeInfo.sourceCrop.height = this.sizeInfo.sourceCrop.bottom - this.sizeInfo.sourceCrop.top;
        this.sizeInfo.destinationSize.width = this.readBytes(4);
        this.sizeInfo.destinationSize.height = this.readBytes(4);
        this.sizeInfo.destinationSize.resampling = this.readBytes(4);

        // Not currently used
        this.sizeInfo.destinationSize.top = this.readBytes(4);
        this.sizeInfo.destinationSize.right = this.readBytes(4);
        this.sizeInfo.destinationSize.bottom = this.readBytes(4);
    }

    /**
     * Get live events information
     */
    parseLiveInformation() {
        this.currentLiveEvents = this.readBytes(4);
        this.changedLiveEvents = this.readBytes(4);
    }

    /**
    * Get playback events information 
    */
    parsePlaybackInformation() {
        this.currentPlaybackEvents = this.readBytes(4);
        this.changedPlaybackEvents = this.readBytes(4);
    }

    /**
    * Get motion amount information 
    */
    parseMotionInformation() {
        this.motionHeaderSize = this.readBytes(4);
        this.motionAmount = this.readBytes(4);
    }

    /**
    * Get stream information 
    */
    parseStreamInfo() {
        this.stream = {};
        this.stream.headerSize = this.readBytes(4);
        this.stream.headerVesion = this.readBytes(4);

        this.stream.reserved = this.readBytes(4);
        this.stream.validFields = this.readBytes(4);

        this.stream.timeBetweenFrames = this.readBytes(4);
        this.stream.dataType = this.readBytesAsCharacters(4, true);
        this.stream.flags = this.readBytes(4);

        this.stream.profile = this.readBytes(4);
        this.stream.level = this.readBytes(4);

        this.stream.compatibility = this.readBytes(4);
        this.stream.constrains = this.readBytes(8);

        this.stream.frameCount = this.readBytes(4);

        this.stream.hasKeyFrame = (this.stream.flags & FrameHeaders.StreamInfoFlags.HasKeyFrame) === FrameHeaders.StreamInfoFlags.HasKeyFrame;
    }

    /**
    * Get carousel information
    */
    parseCarouselInfo () {
        this.carousel = {};
        this.carousel.headerSize = this.readBytes(4);
        this.carousel.headerVesion = this.readBytes(4);
        this.carousel.itemId = this.getGUID();
    };

    /**
    * Called to get the video data from the binary
    *
    * @param dataView, binary, video data
    */
    getData() {
        if (this.dataSize <= 0) {
            return;
        }

        this.retrieveData();

        if (this.stream) {
            switch (this.stream.dataType) {
                case 'JPEG': this.convertToImage(); break;
            }
        }
        else {
            this.convertToImage();
        }
    }

    /**
    * Retrieve frame binary data  
    */
    retrieveData () {
        this.data = new Uint8Array(this.rowData, this.headerSize, this.dataSize);
    }

    /**
    * Encode the data using Blob
    */
    convertToImage() {
        this.type = FrameHeaders.Type.Frame;
        this.blob = new Blob([this.data], { type: 'image/jpeg' });
    };
}