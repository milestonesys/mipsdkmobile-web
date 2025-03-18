if (typeof Object.assign != "function") {
  Object.assign = function (target, varArgs) {
    if (target == null) {
      throw new TypeError("Cannot convert undefined or null to object");
    }
    var result = Object(target);

    for (var index = 1; index < arguments.length; index++) {
      var nextSource = arguments[index];

      if (nextSource) {
        for (var nextKey in nextSource) {
          // Avoid bugs when hasOwnProperty is shadowed
          if (Object.prototype.hasOwnProperty.call(nextSource, nextKey)) {
            result[nextKey] = nextSource[nextKey];
          }
        }
      }
    }
    return result;
  };
}
