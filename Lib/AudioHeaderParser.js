; (function (undefined) {
    var audioParser = function (data) {
        var self = this;

        XPMobileSDK.library.ItemHeaderParser.call(self, data);

        /**
         * Parse audio frame headers
         */
        function parseAudioHeader() {
            self.uuid = self.getGUID();
            
            self.skipBytes(18);

            var mainHeader = self.readBytes(2);

            self.skipBytes(4);

            if (mainHeader & XPMobileSDK.library.ItemHeaderParser.HeaderExtensionDynamicInfo) {
                self.parseDynamicInformation();
            }
        };

        /**
         * Initialize the prototype
         */
        function initialize() {
            parseAudioHeader();
        }

        initialize();
    };

    XPMobileSDK.library.AudioHeaderParser = audioParser;
})();