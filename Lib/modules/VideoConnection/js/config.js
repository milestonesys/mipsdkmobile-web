/**
 * Video connection state definition 
 */

const VideoConnectionState = {
    notOpened: 0, // Connection not opened yet
    running: 1, // Connection started and receiving frames
    closed: 2, // Connection has been closed and done with
    closing: 3 // Connection is currently closing
};


/**
 * Video frame header and flags definition
 */

const FrameHeaders = {
    Type: {
        Frame: 1,
        Fragment: 2
    },
    Error: {
        NonFatal: 0x01,
        Fatal: 0x02
    },
    MainHeaderLength: 36,
    SizeInfoHeaderLength: 32,
    LiveInfoHeaderLength: 8,
    PlaybackInfoHeaderLength: 8,
    HeaderExtensionSize: 0x01,
    HeaderExtensionLiveEvents: 0x02,
    HeaderExtensionPlaybackEvents: 0x04,
    HeaderExtensionNative: 0x08,
    HeaderExtensionMotionEvents: 0x10,
    HeaderExtensionLocationInfo: 0x20,
    HeaderExtensionStreamInfo: 0x40,
    HeaderExtensionCarouselInfo: 0x80,
    HeaderExtensionDynamicInfo: 0x100,
    LiveFlags: {
        LiveFeed: 0x01,
        Motion: 0x02,
        Recording: 0x04,
        Notification: 0x08,
        CameraConnectionLost: 0x10,
        DatabaseFail: 0x20,
        DiskFull: 0x40,
        ClientLiveStopped: 0x80
    },
    PlaybackFlags: {
        Stopped: 0x01,
        Forward: 0x02,
        Backward: 0x04,
        DatabaseStart: 0x10,
        DatabaseEnd: 0x20,
        DatabaseError: 0x40
    },
    DynamicInfoDataType: {
        HeaderTypeDeviceStateInfo: 0
    },
    StreamInfoFlags: {
        HasKeyFrame: 0x01
    }
}

export { VideoConnectionState, FrameHeaders };