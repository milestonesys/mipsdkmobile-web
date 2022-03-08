/**
 * Implement the CHAP security alorythm that will secure the connection(session) ID
 * 
 *  This library requires SHA512 (http://code.google.com/p/crypto-js/#SHA-2)
 *
 * @see			http://en.wikipedia.org/wiki/Challenge-Handshake_Authentication_Protocol
 * 
 * @author 		tvh
 */
 
XPMobileSDK.library.CHAP = {
	/**
	 * Stores a list of salts that will be used for hashing
	 */
	challenges: [],
	
	/**
	 * Diffie-Hellman shared key
	 */
	sharedKey: '',
	
	/**
	 * Minimum amount of challenges that needs to be kept in cache
	 */
	minChallenges: 200,

	/**
	 * Amount of challenges kept in the list betor the system halts. Set in the initialize method
	 */
	haltThreshold: 0,

	/**
	 * Flag defining if the system id haled for lack of challenges
	 */
	halt: false,

	/**
	 * Flag indicating that the component is waiting for challenges and not to request more until the data is received
	 */
	waitingForData: false,
	
	/**
	 * Constructor
	 */
	initialize: function () {
		this.haltThreshold = this.minChallenges * 5 / 100,
		XPMobileSDK.library.Connection.addObserver(this);
	},
	
	/**
	 * Start the checking mechanism of the challenges status
	 */
	start: () =>  { },
	
	/**
	 * Check challenges
	 */
	cleanUp: function() {
		// Uncomment this line if sorting is required.
		// Currently it is made without sorting because the rule is first in last out from the array
		//this.challenges.sort(this.sort);

		if (!XPMobileSDK.library.Connection.connectionId) return;
		if (this.waitingForData) return;
	    
		if(this.challenges.length > 0) {
		    for(var i = 0; i < this.challenges.length; i++) {
		        if (!this.challenges[i].isValid()) {
		            this.challenges[i].destroy();
		            this.challenges.splice(i, 1);
		        }
		    }
		}
		if(this.challenges.length < this.minChallenges) {
			var params = {NumChallenges: 100};
			if (this.challenges.length <= this.haltThreshold) {
				params.Reset = 'Yes';
			}
			this.waitingForData = true;
			XPMobileSDK.requestChallenges(params, () => {
				this.waitingForData = false;
			});
		}
	},
	
	/**
	 * Add new challenges
	 *
	 * @param	challenges		array		List of challenges
	 */
	add: function (challenges) {
	    
		if(typeof challenges == 'string') {
			var challenge = new XPMobileSDK.library.Challenge(challenges);
			this.challenges.push(challenge);
		}
		else if(typeof challenges == 'object' && challenges.length > 0) {
			for(var i = 0; i < challenges.length; i++) {
				var challenge = new XPMobileSDK.library.Challenge(challenges[i]);
				this.challenges.push(challenge);
			}
		}
		this.start();
	},
	
	/**
	 * Try to find a valid challenge
	 *
	 * @return		string		Valid challege value
	 */
	takeValidChallenge: function () {
		this.cleanUp();
	    if(this.challenges.length > 0) {
	        for (var i = 0; i < this.challenges.length; i++) {

				var challenge = this.challenges.shift();

				if (this.challenges.length < this.haltThreshold) {
					this.haltSystem();
				} else {
					this.unHaltSystem();
                }

            if (challenge.isValid()) {
              logger.log('Challenge:' + challenge.getValue(), 'Seconds until expire:' + challenge.ttl);
	                return challenge;
	            }
				challenge.destroy();
	        }
	    }
	    else {
	        logger.warn('No challenges in the list!');
	        return {getValue: function(){}, getTime: function(){}};
	    }
	},
	
	/**
	 * Export all challenges. Used for stored in the localStorage when page is reloaded
	 *
	 * @return		array		Array of all challeges
	 */
	exportAll: function() {
		var result = [];
		this.challenges.forEach(function(challenge){
			var value = challenge.getValue();
			if(value) {
				result.push(value);
			}
		});
		return result;
	},
	
	/**
	 * Sort an array of Challenge object based on their expiration time.
	 *
	 * @param	first		object		Challenge object
	 * @param	second		object		Challenge object
	 */
	sort: function(first, second) {
		return second.getTime() - first.getTime();
	},
	
	/**
	 * Calculate the challenge answer
	 */
	calculate: function() {
	    var challenge = this.takeValidChallenge();

	    if (challenge)
	    {
	        return {
	            'Challenge': challenge.getValue(),
	            'ChalAnswer': CryptoJS.SHA512((challenge.getValue() + this.sharedKey).toUpperCase()).toString(CryptoJS.enc.Base64),
	            'timeout': (challenge.ttl - challenge.getTime()) * 1000
	        };
	    }

	    return {
	        'Challenge': undefined,
	        'ChalAnswer': undefined,
	        'timeout': undefined
	    };
	},
	
	/**
	 * Connection state observing
	 */ 
	connectionLostConnection: function () {
		this.destroy();
	},
	
	/**
	 * Connection state observing
	 */ 
	connectionDidDisconnect: function () {
		this.destroy();
	},

	haltSystem() {
		document.getElementById('systemErrorModal').setAttribute("show", true);
		this.halt = true;
	},

	unHaltSystem() {
		if (!this.halt) {
			return;
		}

		this.halt = false;
		document.getElementById('systemErrorModal').removeAttribute("show");
	},
	
	/**
	 * Connection request observer
	 */ 
	connectionRequestSucceeded: function(request, response) {
	    if (XPMobileSDK.library.Connection.CHAPSupported == 'Yes'
            && response
            && response.parameters
            && response.parameters.Challenge
            && XPMobileSDK.library.Connection.connectionId) {
			this.add(response.parameters.Challenge);
		}
	},
	
	/**
	 * Destructor
	 */
	destroy: function() {
		if(this.challenges.length > 0) {
			for(var i = 0; i < this.challenges.length; i++) {
				var challenge = this.challenges.shift();
				challenge.destroy();
			}
		}
		this.challenges = [];
		this.unHaltSystem();
		XPMobileSDK.library.SecureString.sharedKey = null;
	}
};