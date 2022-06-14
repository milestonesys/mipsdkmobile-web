class AudioAvailability {

    static mimecodec = "audio/mpeg";

    static isOutgoingAudioNotSupported() {
        var notSupported = !XPMobileSDKSettings.SupportsAudioIn ||
            !XPMobileSDK.features.SupportsOutgoingAudio;

        return notSupported;
    };

    static isOutgoingPTTAudioNotSupported() {
        var notSupported = !XPMobileSDKSettings.SupportsAudioIn || !XPMobileSDK.features.SupportsOutgoingPTTAudio;

        return notSupported;
    };

    static isLiveFeatureNotSupported() {
        return AudioAvailability.isOutgoingAudioNotSupported();
    };

    static isPlaybackFeatureNotSupported() {
        return AudioAvailability.isOutgoingAudioNotSupported() && AudioAvailability.isOutgoingPTTAudioNotSupported();
    };

    static noAvailableMics(microphones) {

        var notSupported = AudioAvailability.isOutgoingAudioNotSupported() ||
            !microphones ||
            !microphones.length;

        return notSupported;
    };

    static noAvailableSpeakers(speakers) {
        var notSupported = AudioAvailability.isOutgoingPTTAudioNotSupported() ||
            !speakers ||
            !speakers.length;

        return notSupported;
    };
}

XPMobileSDK.library.AudioAvailability = AudioAvailability;