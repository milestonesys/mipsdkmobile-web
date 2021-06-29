XPMobileSDK.library.Bytes = new function () {

	var fromInt = function (integer, bytes) {
		
		return fromHex(integer.toString(16), bytes);
		
	};
		
	var fromGuid = function (guid, bytes) {
		
		return fromHex(guid.replace(/[^a-f0-9]/gi, ''), bytes);
		
	};

	var fromBase64 = function (base64, bytes) {
		
		var string = atob(base64.replace(/^.*?,/, '')).slice(- bytes);
		var array = new Array(bytes ? bytes - string.length : 0);
		
		for (var i = 0; i < string.length; i++)
			array.push(string.charCodeAt(i));
		
		return array;

	};

	var fromHex = function (hex, bytes) {
		
		hex = hex.length % 2 ? "0" + hex : hex;
		
		var numbers = hex.match(/../g).splice(- bytes);
		var array = new Array(bytes ? bytes - numbers.length : 0);
		
		array.push.apply(array, numbers);
		array.forEach(function (item, index) {
			array[index] = parseInt(item || 0, 16);
		});
				
		return array;
				
	};
	
	return {
		fromInt: fromInt,
		fromGuid: fromGuid,
		fromBase64: fromBase64,
		fromHex: fromHex
	}

};