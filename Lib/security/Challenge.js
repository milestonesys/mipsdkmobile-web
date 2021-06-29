/**
 * Generate a challenge that will be used to hash connectino id
 * 
 * @param 		value			string		Value of the challenge
 * @author 		tvh
 */
XPMobileSDK.library.Challenge = function(value) {
	/**
	 * UTC time when challenge received
	 * 
	 * @var			Date
	 * @access		public
	 */
	var date = Date.now();
	
	/**
	 * Time to live constant - in seconds
	 * 
	 * @var			integer
	 * @access		public
	 */
	this.ttl = 59 * 60; // 5 * Connection.serverTimeout;


	/**
	 * Check if the challenge is valid or not
	 * 
	 * @access					public
	 * @return					boolean		true if challenge is suitable for usage / false otherwise
	 */
	this.isValid = function () {
		return this.getTime() / 1000 < this.ttl;
	};
	

	/**
	 * Return the value of the challege
	 * 
	 * @access					public
	 * @return					string		Value of the challenge
	 */
	this.getValue = function() {
		return value;
	};
	
	/**
	 * Return the time in seconds of how long we keep the challenge in memory
	 * 
	 * @access					public
	 * @return					number		seconds
	 */
	this.getTime = function() {
		return Date.now() - date;
	};
	
	/**
	 * Destructor
	 * 
	 * @access					public
	 */
	this.destroy = function() {
	};

};