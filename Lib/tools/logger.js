var logger = {
  info: function (...infoMessage) {
    console && console.info(...infoMessage)
  },
  error: function (...errorMessage) {
    console && console.error(...errorMessage)
  },
  warn: function (...warnMessage) {
    console && console.warn(...warnMessage)
  },
  log: function (...logMessage) {
    console && console.log(...logMessage)
  },
  init: function () {
    if (!XPMobileSDKSettings.EnableConsoleLog) {
      logger.log = function () { };
      logger.info = function () { };
      logger.error = function () { };
      logger.warn = function () { };
    } else if (XPMobileSDKSettings.EnableConsoleLog === "error") {
      logger.log = function () { };
      logger.info = function () { };
      logger.warn = function () { };
    } else if (XPMobileSDKSettings.EnableConsoleLog === "warn") {
      logger.log = function () { };
      logger.info = function () { };
    }
  }
};

logger.init();
