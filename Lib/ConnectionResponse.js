/**
 * The connection response class is internal and instances should only be created from the ConnectionRequest class.
 * The goal of the class is to parse response from the server and serve it as simpler JavaScript object. 
 * 
 * @class ConnectionResponse
 */
XPMobileSDK.library.ConnectionResponse = function (xmlString) {
	
	var self = this;
	
	self.sequenceID = 0;
	self.command = '';
	self.isResponse = false;
	self.isProcessing = false;
	self.isError = false;
	self.outputParameters = null; 
	self.subItems = null; // XML Node, because they are not based on fixed structure
	self.thumbnailBase64 = null; // Base 64 encoded thumbnail. This is used only for the GetThumbnail command
	self.exports = [];
	self.sequences = []; 
	self.actions = [];
	self.items = [];
	self.errorCode = 0;
	self.errorString = '';
	
	//xmlString = xmlString.replace('<Result>', '<Items><Item Type="Investiagtion" Id="ef305713-ed63-4888-9fdc-53a5294fc62b" Name="Bahur"><Properties State="New" StartTime="1412173087831" EndTime="1412176810831"/><Items><Item Type="Camera" Name="Syzdyrma" Id="af81b01d-f623-45d9-951a-6452b94ee561" ><Properties SrcWidth="1920" SrcHeight="1080"/></Item><Item Type="Camera" Name="Babek" Id="b1bddc78-87ad-470f-b488-9db6352aab82" ><Properties SrcWidth="720" SrcHeight="576" /></Item></Items></Item></Items><Result>');
	
	var xmlDoc = parseXML(xmlString);
	var CommunicationNode = xmlDoc.getElementsByTagName('Communication')[0];
	var CommandNode = CommunicationNode.getElementsByTagName('Command')[0];
	var TypeNode = CommandNode.getElementsByTagName('Type')[0];
  if (XMLNodeTextContent(TypeNode) == 'Processing') {
    logger.log('Processing...');
		self.isProcessing = true;
	} else if (XMLNodeTextContent(TypeNode) == 'Response') {
		self.isResponse = true;
		var tmp;
		tmp = CommandNode.getElementsByTagName('OutputParams');
		if (tmp.length > 0) {
			self.outputParameters = {};
			var OutputParamsNode = tmp[0];
			var paramsNodes = OutputParamsNode.getElementsByTagName('Param');
			for (var i = 0, c = paramsNodes.length; i < c; i++) {
				var paramNode = paramsNodes[i];
				var key = '', value = '';
				var attributes = paramNode.attributes;
				for (var j = 0; j < attributes.length; j++) {
					var attr = attributes[j];
					if (attr.name == 'Name') {
						key = attr.value;
					} else if (attr.name == 'Value') {
						value = attr.value;
					}
				}
				if (key && value) {
                    if(this.outputParameters[key] && typeof this.outputParameters[key] == 'string') {
                            var paramValue = this.outputParameters[key];
                            this.outputParameters[key] = new Array();
                            this.outputParameters[key].push(paramValue);
                    }
                    else if (typeof this.outputParameters[key] == 'object') {
                            this.outputParameters[key].push(value);
                    }
                    else {
                            this.outputParameters[key] = value;
                    }
				}
			}
		}
		
		tmp = CommandNode.getElementsByTagName('SubItems');
		if (tmp.length > 0) {
			self.subItems = tmp[0];
		}

		tmp = CommandNode.getElementsByTagName('ServerStatus');
		if (tmp.length > 0) {
			self.ServerStatus = {};
			var cpu = tmp[0].getElementsByTagName('CpuUsage');
			if(cpu.length > 0) {
				self.ServerStatus.CPU = XMLNodeTextContent(cpu[0]);
			}
			
			var DiskUsage = tmp[0].getElementsByTagName('DiskUsage');
			if(DiskUsage.length > 0) {
				self.ServerStatus.HDD = {};
				var recording = DiskUsage[0].getElementsByTagName('RecordingDiskUsageInBytes');
				if(recording.length > 0) {
					self.ServerStatus.HDD.recorded = XMLNodeTextContent(recording[0]);
				}
				var exp = DiskUsage[0].getElementsByTagName('ExportsDiskUsageInBytes');
				if(exp.length > 0) {
					self.ServerStatus.HDD.exports = XMLNodeTextContent(exp[0]);
				}
				var user = DiskUsage[0].getElementsByTagName('UserDiskUsageInBytes');
				if(user.length > 0) {
					self.ServerStatus.HDD.user = XMLNodeTextContent(user[0]);
				}
				var other = DiskUsage[0].getElementsByTagName('OtherDiskUsageInBytes');
				if(other.length > 0) {
					self.ServerStatus.HDD.other = XMLNodeTextContent(other[0]);
				}
				var free = DiskUsage[0].getElementsByTagName('FreeSpaceInBytes');
				if(free.length > 0) {
					self.ServerStatus.HDD.free = XMLNodeTextContent(free[0]);
				}
			}
		}

		parseThumbnail(CommandNode);

		parseExports(CommandNode);
		
		parseSequences(CommandNode);
		
		parseActions(CommandNode);
		
		parseItems(CommandNode);

		var ResultNode = CommandNode.getElementsByTagName('Result')[0];
		
		if (XMLNodeTextContent(ResultNode) != 'OK') {
			self.isError = true;
			tmp = CommandNode.getElementsByTagName('ErrorString');
			if (tmp.length > 0) {
				self.errorString = XMLNodeTextContent(tmp[0]);
			}
			tmp = CommandNode.getElementsByTagName('ErrorCode');
			if (tmp.length > 0) {
				self.errorCode = parseInt(XMLNodeTextContent(tmp[0]));
			}

			self.error = {
				code: self.errorCode || XPMobileSDK.library.ConnectionError.Unknown,
				message: self.errorString || ''
			};

			const commandNameNode = CommandNode.getElementsByTagName('Name');
			if (commandNameNode.length > 0) {
				const commandName = XMLNodeTextContent(commandNameNode[0]);
				let logError = true;
				if (commandName === "CloseStream") {
					logError = false;
				}
				if (commandName === "LogIn" && self.errorCode === XPMobileSDK.library.ConnectionError.SecondStepAuthenticationRequired) {
					logError = false;
				}
				if (logError) {
					logger.error('Response error ' + (self.errorString || getError(self.errorCode)) + ' ' + (self.errorCode || '') + ' Complete response: ' + xmlString);
				}
			}
		}
	}
	
	/**
	 * Gets an error string by error code as defined in XPMobileSDK.library.ConnectionError
	 */
	function getError(errorCode) {
		var result;
		Object.keys(XPMobileSDK.library.ConnectionError).forEach(function(key) { 
				if (XPMobileSDK.library.ConnectionError[key] == errorCode) { 
					result = key; 
				} 
			});
		return result;
	}

	/**
	 * Parses the Thumbnail or ThumbnailJSON tag and extracts a BASE64 image.
	 *
	 * @param CommandNode the Command tag.
	 */
	function parseThumbnail(CommandNode) {

		var thumbnail = CommandNode.getElementsByTagName('Thumbnail')[0];
		if (thumbnail) {
			self.thumbnailBase64 = 'data:image/jpeg;base64,' + XMLNodeTextContent(thumbnail);
			return;
		}

		var thumbnailJSON = CommandNode.getElementsByTagName('ThumbnailJSON')[0];
		if (thumbnailJSON) {
			self.thumbnailJSON = XMLNodeTextContent(thumbnailJSON);
			return;
		}
		
	};
	
	/**
	 * Parses the Exports tag and saves the Export entries within this.exports.
	 *
	 * @param CommandNode the Command tag.
	 */
	function parseExports(CommandNode) {

		var exportsNodes = CommandNode.getElementsByTagName('Exports');

		if (exportsNodes.length > 0) {

			self.exports = [];
			var exportNodes = exportsNodes[0].getElementsByTagName("Export");

			for (var i = 0; i < exportNodes.length; i++) {
				var exp = attributesToObject(exportNodes[i], {
					numbers: ['Size', 'State'],
					dates: ['StartTime', 'EndTime', 'CompletedTime', 'QueuedTime']
				});
				
				self.exports.push(exp);
			}
		}
	};

	/**
	* Parses the Sequences tag and saves the sequence entries within this.sequences.
	*
	* @param CommandNode the Command tag.
	*/
	function parseSequences(CommandNode) {
		
		var rootNode = CommandNode.getElementsByTagName('Sequences');

		if (rootNode.length > 0) {

			self.sequences = [];
			var sequencesNodes = rootNode[0].getElementsByTagName("Sequence");

			for (var i = 0; i < sequencesNodes.length; i++) {
				
				var sequence = attributesToObject(sequencesNodes[i], {
					dates: ['StartTime', 'EndTime', 'TimeStamp']
				});

				self.sequences.push(sequence);
			}
		}
	};
	
	/**
	 * Parses the Outputs and Events (Actions) and saves them within this.actions.
	 * 
	 * @param CommandNode the Command tag.
	 */
	function parseActions(CommandNode) {
		
		var EMPTY_CAMERA_NAME = '00000000-0000-0000-0000-000000000000';
		
		self.actions = [];
		
		var headerGroups = CommandNode.getElementsByTagName('OEHeaderGroup');
		
		if (headerGroups.length == 0) {
			return;
		}
		
		Array.prototype.forEach.call(headerGroups, function(headerGroup) {
			var items = headerGroup.getElementsByTagName('OEItem');
			Array.prototype.forEach.call(items, function(item) {
				var action = attributesToObject(item);
				action.Type = headerGroup.getAttribute('Name');
				self.actions.push(action);
			});
		});
		
		self.actions.sort(function(first, second) {
			
			// sort types (outputs go first, then events)
			if (first.Type == 'Outputs' && second.Type == 'Events')
				return -1;
			else if (first.Type == 'Events' && second.Type == 'Outputs')
				return 1;
			
			// if types match, sort by assignment status (assigned outputs go first, then unassigned)
			if (first.CameraId != EMPTY_CAMERA_NAME && second.CameraId == EMPTY_CAMERA_NAME)
				return -1;
			else if (first.CameraId == EMPTY_CAMERA_NAME && second.CameraId != EMPTY_CAMERA_NAME)
				return 1;

			// if types and statuses match, sort alphabetically
			if (first.Name < second.Name)
				return -1;
			else if (first.Name > second.Name)
				return 1;
			
			return 0;
		});
	};
	
	/**
	* Parses the Items tag
	*
	* @param CommandNode the Command tag.
	*/
	function parseItems(CommandNode) {

		var findItems = function(node) {
			var subNodes = node.childNodes;
			var ItemsNode = null;
			
			for(var i = 0; i < subNodes.length; i++) {
				if(subNodes[i].nodeName == 'Items') {
					ItemsNode = subNodes[i];
				}
			}
			
			if(ItemsNode) {
				self.items = processItem(ItemsNode);
			}
		
		};
		
		var processItem = function(node) {
			
			var result = [];
			var subNodes = node.childNodes;
			
			for(var i = 0; i < subNodes.length; i++) {
				if(subNodes[i].nodeName == 'Item') {
					var itemData = {};
					
					if(subNodes[i].attributes.length > 0) {
						for(var j = 0; j < subNodes[i].attributes.length; j++) {
							itemData[subNodes[i].attributes[j].name] = safe(subNodes[i].attributes[j].value);
						}
					}

					for(var j = 0; j < subNodes[i].childNodes.length; j++) {
						
						if(subNodes[i].childNodes[j].nodeName == 'Properties') {
							for(var k = 0; k < subNodes[i].childNodes[j].attributes.length; k++) {
								itemData[subNodes[i].childNodes[j].attributes[k].name] = safe(subNodes[i].childNodes[j].attributes[k].value);
							}
						}
						else if (subNodes[i].childNodes[j].nodeName == 'Items') {
							itemData.Items = processItem(subNodes[i].childNodes[j]);
						}
					}
					
					result.push(itemData);
				}
			}
			return result;
		};
		
		findItems(CommandNode);
	};

	/**
	 * Converts a XML Node object to a JavaScript object converting all attributes of the node as properties of the object. 
	 * The default type of the properties is String. Use the options argument to change that behavior. 
	 *
	 * @param node: a XML Node.
	 * @param options: optional parameter, an object describing how attributes should be converted to different types; may contains the following properties:
	 *	- numbers: an array of the attributes that should be converted to numbers.
	 *	- dates: an array of the attributes that should be converted to dates from the given UTC timestamp.
	 * @return object representing the given node.
	 */
	function attributesToObject(node, options) {

		var result = {};

		for (var i = 0; i < node.attributes.length; i++) {

			var attribute = node.attributes[i];

			if (options && options.numbers && options.numbers.indexOf(attribute.name) != -1) {
				result[attribute.name] = Number(attribute.value);
			} else if (options && options.dates && options.dates.indexOf(attribute.name) != -1) {
				result[attribute.name] = new Date(parseInt(attribute.value));
			} else {
				result[attribute.name] = safe(attribute.value);
			}
		}

		return result;
	}
	
	/**
	 * Removes unsafe symbols.
	 * 
	 * @param string: a value coming from the server
	 * @return a safe version of the string
	 */
	function safe(string) {
		
		var symbols = ['<', '>'];

		for (var i = 0, max = symbols.length; i < max; ++i) {
			string = string.replace(new RegExp(symbols[i], 'g'), '');
		}
		
		return string;
	}
};

//////////////
// XML Parser
//////////////

var parseXML;
var XMLNodeTextContent;
if (typeof window.DOMParser != "undefined") {
	parseXML = function (xmlStr) {
    	return ( new window.DOMParser() ).parseFromString(xmlStr, "text/xml");
	};
	XMLNodeTextContent = function (node) {
		return node.textContent;
	};
} else if (typeof window.ActiveXObject != "undefined" &&
       new window.ActiveXObject("Microsoft.XMLDOM")) {
    parseXML = function(xmlStr) {
        var xmlDoc = new window.ActiveXObject("Microsoft.XMLDOM");
        xmlDoc.async = "false";
        xmlDoc.loadXML(xmlStr);
        return xmlDoc;
    };
    XMLNodeTextContent = function (node) {
		return node.text;
	};
} else {
    throw new Error("No XML parser found");
}