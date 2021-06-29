/**
 * This library:
 *		1. aims to solve the problem related to preserving types when it comes to web storage; 
 *		2. includes an expiration mechanism similar to the one cookies have. 
 *
 * By using localStorage and sessionStorage, no matter what kind of a value is saved, this value is always converted to a string. This might lead to unpleasant results. 
 * This library provides proxies for these storages, called XPMobileSDK.localStorage nad XPMobileSDK.sessionStorage. 
 * Use the methods setItem, getItem, removeItem and clear in the same way described in the specification. Expect the type to be preserved. 
 *
 * Example:
 *		XPMobileSDK.sessionStorage.setItem('myKey', true);
 *		XPMobileSDK.sessionStorage.getItem('myKey') === true;
 *
 * The method setItem provides an additional optional parameter: milliseconds. The item will not be available that many milliseconds from the moment of saving. 
 *
 * Example:
 *		XPMobileSDK.sessionStorage.setItem('myKey', 'myValue', 1000 * 60);
 *		// after a minute
 *		XPMobileSDK.sessionStorage.getItem('myKey') === null;
 *
 * @author rvp
 */
(function () {
	
	if (!window.localStorage || !window.sessionStorage) {
		return;
	}

	var storages = ['sessionStorage', 'localStorage'];

	for (var i in storages) {

		XPMobileSDK[storages[i]] = {
			
			storage: window[storages[i]],

			setItem: function (key, value, expiration) {

				if (expiration) {
					
					var obj = {
						value: value,
						expiration: new Date().getTime() + expiration
					};
					this.storage.setItem(key, 'expiration::' + JSON.stringify(obj));
					return ;
				}

				if (typeof value == 'boolean') {
					this.storage.setItem(key, 'boolean::' + value);
					return;
				}

				if (typeof value == 'number') {
					this.storage.setItem(key, 'number::' + value);
					return;
				}

				if (typeof value == 'object') {
					this.storage.setItem(key, 'object::' + JSON.stringify(value));
					return;
				}

				this.storage.setItem(key, value);
			},

			getItem: function (key) {

				var value = this.storage.getItem(key);
				
				if (value == null) {
					return null;
				}

				if (value.indexOf('expiration::') == 0) {
					
					var obj = JSON.parse(value.substr(value.indexOf('::') + 2));
					if (new Date().getTime() > obj.expiration) {
						this.storage.removeItem(key);
						return null;
					} 
					return obj.value;
				}

				if (value.indexOf('boolean::') == 0) {
					return value == 'boolean::true';
				}

				if (value.indexOf('number::') == 0) {
					return parseFloat(value.substr(value.indexOf('::') + 2));
				}

				if (value.indexOf('object::') == 0) {
					return JSON.parse(value.substr(value.indexOf('::') + 2));
				}

				return value;
			},
			
			removeItem: function (key) {
				this.storage.removeItem(key);
			},
			
			clear: function () {
				this.storage.clear();
			},
			
			key: function (index) {
				return this.storage.key(index);
			}
		};
		
	}

})();