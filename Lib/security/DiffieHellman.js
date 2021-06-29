/**
 * Implementing Diffie Hellman algorithm for exchange shared key between two parties
 * 
 *  This library requires BigInt (http://www.leemon.com/crypto/BigInt.js) and 
 *  Advanced Encryption Standard library (http://crypto-js.googlecode.com/svn/tags/3.1/build/rollups/aes.js) 
 *
 * @see			http://en.wikipedia.org/wiki/Diffie%E2%80%93Hellman_key_exchange
 * 
 * @author 		tvh <tvh@milestonesys.com>
 */

XPMobileSDK.library.DiffieHellman = function(params) {
	/**
	 * Server and client prime key
	 * 
	 * @var			string
	 * @access		private
	 */
    var primeKey = {
        1024: "F488FD584E49DBCD20B49DE49107366B336C380D451D0F7C88B31C7C5B2D8EF6F3C923C043F0A55B188D8EBB558CB85D38D334FD7C175743A31D186CDE33212CB52AFF3CE1B1294018118D7C84A70A72D686C40319C807297ACA950CD9969FABD00A509B0246D3083D66A45D419F9C7CBD894B221926BAABA25EC355E92F78C7",
        2048: "87A8E61DB4B6663CFFBBD19C651959998CEEF608660DD0F25D2CEED4435E3B00E00DF8F1D61957D4FAF7DF4561B2AA3016C3D91134096FAA3BF4296D830E9A7C209E0C6497517ABD5A8A9D306BCF67ED91F9E6725B4758C022E0B1EF4275BF7B6C5BFC11D45F9088B941F54EB1E59BB8BC39A0BF12307F5C4FDB70C581B23F76B63ACAE1CAA6B7902D52526735488A0EF13C6D9A51BFA4AB3AD8347796524D8EF6A167B5A41825D967E144E5140564251CCACB83E6B486F6B3CA3F7971506026C0B857F689962856DED4010ABD0BE621C3A3960A54E710C375F26375D7014103A4B54330C198AF126116D2276E11715F693877FAD7EF09CADB094AE91E1A1597"
    };
	
	/**
	 * Converted prime key into big int
	 * 
	 * @var			array
	 * @access		private
	 */
    var primeKeyBigInt = str2bigInt(primeKey[XPMobileSDKSettings.primeLength], 16, 1);
	
	/**
	 * Generator key
	 * 
	 * @var			array
	 * @access		private
	 */
	var generator = str2bigInt('2',10,1);
	
	/**
	 * Client specific random key
	 * 
	 * @var			array
	 * @access		private
	 */
	var randKey = [];

	/**
	 * Server public key
	 * 
	 * @var			array
	 * @access		private
	 */
	var serverKey = null;
	
	/**
	 * Stores context of execution
	 * 
	 * @var			object
	 * @access		private
	 */
	var self = this;
	
	/**
	 * Convert string to byte array
	 * 
	 * @param 		str			string		String to convert to
	 * @access					private
	 * @return					array		Converted string to byte array
	 */
	var str2byteArray = function (str) {
		if (str.length % 2 != 0) {
            str = '0' + str;
		}

		var result = [];
		for(var i=0; i<str.length; i=i+2)
			result.push(parseInt(str.substring(i,i+2),16));
		
		result.reverse();
		return result;
	};
	
	/**
	 * Generates client public key
	 * 
	 * @access					public
	 * @return					string		Base64 encoded public key
	 */
	this.createPublicKey = function () {
		randKey = randBigInt(160, 0);
		var byteArrayKey = str2byteArray(bigInt2str(powMod(generator,randKey,primeKeyBigInt),16));
		byteArrayKey.push(0);
		var key = Base64.encodeArray(byteArrayKey);
		return key;
	};

	/**
	 * Decode and set server public key
	 * 
	 * @param 		str			string		Server public key
	 * @access					public
	 */
	this.setServerPublicKey = function (publicKey) {
		var decodedServerKey = Base64.decodeBinary(publicKey);

		var reversedServerKey = [];
		
		for(i=decodedServerKey.length-1; i>=0; i--)
			reversedServerKey.push(decodedServerKey[i]);
		
		serverKey = CryptoJS.enc.Base64.parse(Base64.encodeArray(reversedServerKey)).toString();
	};

	/**
	 * Return the skared key
	 * 
	 * @return					string		Shared key
	 * @access					public
	 */
	this.getSharedKey = function () {
		var secretKey = str2byteArray(bigInt2str(powMod(str2bigInt(serverKey,16,1),randKey,primeKeyBigInt),16));
		return CryptoJS.enc.Base64.parse(Base64.encodeArray(secretKey)).toString();
	};
	
	/**
	 * Encode a string using client and server public keys
	 * 
	 * @param 		str			string		String to encode
	 * @access					public
	 * @return					string		Base64 encoded encrypted string
	 */
	this.encodeString = function(str) {
		var secretString = this._sharedKey || this.getSharedKey().substring(0, 96);

		var key = CryptoJS.enc.Hex.parse(secretString.substring(32, 96)); 
		var iv = CryptoJS.enc.Hex.parse( secretString.substring(0,32) ); 
		
		var params = { 'iv': iv };
		if (XPMobileSDKSettings.defaultEncryptionPadding && CryptoJS.pad[XPMobileSDKSettings.defaultEncryptionPadding]) {
		    params.padding = CryptoJS.pad[XPMobileSDKSettings.defaultEncryptionPadding];
		}
		return CryptoJS.AES.encrypt(str, key, params).ciphertext.toString(CryptoJS.enc.Base64);
	};
};