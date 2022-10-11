
XPMobileSDK.library.PKCECode = {

	codeVerifier: '',

	/**
	 * Generate Code Verifier for 3rd part login
	 *
	 * @return			string			random string
	 */
	getCodeVerifier: function () {
		this.codeVerifier = CryptoJS.lib.WordArray.random(56 / 2).toString();
		return this.codeVerifier;
	},

	/**
	 * Generate Code Challange for 3rd part login
	 *
	 * @return			string			SHA256 encrypted string
	 */
	getCodeChallenge: function () {
		if (!this.codeVerifier) {
			this.getCodeVerifier();
		}

		return encodeURIComponent(CryptoJS.SHA256(this.codeVerifier).toString(CryptoJS.enc.Base64).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''));
	}
};