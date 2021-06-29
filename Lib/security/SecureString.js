/**
 * Encrypt/Decrtpt a string based on the user share key taken at login
 * 
 * @author 		tvh
 */
XPMobileSDK.library.SecureString = {

	sharedKey: null,
	
	/**
	 * Creates an encrypted string using the Diffie-Hellmen shared key and random initialization vector
	 * Both vector and encrypted string are concatenated using ":".
	 * First part is base64 encoded initialization vector and the second one is AES ancrypted string that use the initialization vector and shared key
	 *
	 * @param			string		string			String to encrypt
	 * @return						string			Encrypted string
	 */
	encrypt: function(string) {
		var key = this.generateKey();
		var iv = CryptoJS.lib.WordArray.random(16);
		var params = { 'iv': iv };
		if (Settings.DefaultEncryptionPadding && CryptoJS.pad[Settings.DefaultEncryptionPadding]) {
		    params.padding = CryptoJS.pad[Settings.DefaultEncryptionPadding];
		}
		var cip = CryptoJS.AES.encrypt(string, CryptoJS.SHA256(key), params);
		return cip.iv.toString(CryptoJS.enc.Base64) + ':' + cip.ciphertext.toString(CryptoJS.enc.Base64);
	},
	
	/**
	 * Decrypt a string which was encrypted byt the encrypt method
	 *
	 * @param			string		string			Base64 string to decrypt
	 * @return						string			Decrypted string
	 */
	decrypt: function(string) {
		var result = '';
		if(string.indexOf(':') > -1) {
		
			var key = this.generateKey();
			var data = string.split(':');
			var iv = CryptoJS.enc.Base64.parse(data[0]);
			var cip = CryptoJS.enc.Base64.parse(data[1]);
			var params = { 'iv': iv };
			if (Settings.DefaultEncryptionPadding && CryptoJS.pad[Settings.DefaultEncryptionPadding]) {
			    params.padding = CryptoJS.pad[Settings.DefaultEncryptionPadding];
			}
			var result = CryptoJS.AES.decrypt({ciphertext: cip}, CryptoJS.SHA256(key),params);
			result = CryptoJS.enc.Utf8.stringify(result);
		}
		return result;
	},
	
	/**
	 * Generate a key based on the shared key used in Diffie-Hellman that will be used to AES ancrypt the string
	 *
	 * @return			string			SHA256 encrypted string
	 */
	generateKey: function() {
		var sharedKey = '';
		if(!this.sharedKey) {
		    if (XPMobileSDK.library.Connection.dh) {
			    sharedKey = this.sharedKey = XPMobileSDK.library.Connection.dh.getSharedKey().toUpperCase();
			}
		    else if (XPMobileSDK.library.CHAP.sharedKey) {
		        sharedKey = this.sharedKey = XPMobileSDK.library.CHAP.sharedKey.toUpperCase();
			}
		}
		else {
			sharedKey = this.sharedKey;
		}
		return sharedKey;
	}
	
};