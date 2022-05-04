Ext.namespace('Zarafa.core');

/**
 * @class Zarafa.core.Request
 * @extends Ext.util.Observable
 *
 * Request object for asynchronous communication with the server. The request object
 * automatically serialises single or multiple action requests into corresponding
 * JSON and provides a callback system to allow asynchronous handling of the
 * response from the server.
 * <p>
 * The request object supports global events surrounding the sending of the data
 * to the server. For handling the responses it communicates directly with the
 * {@link Zarafa.core.ResponseRouter ResponseRouter} on which events are provided
 * surrounding the receiving of the Responses (as well as handling of the Notifications).
 * <p>
 * You shouldn't have to instantiate this class yourself as a global instance
 * can be obtained from the globally available {@link Zarafa.core.Container container}
 * object.
 * <p>
 * The structure of data that will be used for communication will be like
 * <pre><code>
 * zarafa: {
 *	module_name: {
 *		module_id: {
 *			action_type: {
 *				// data
 *			}
 *		}
 *	}
 * }
 * </code></pre>
 */
Zarafa.core.Request = Ext.extend(Ext.util.Observable, (function() {
	/**
	 * True if the connection has been {@link #paralyze}. This will
	 * prevent any requests from being send to the server, or any responses
	 * from being processed.
	 * @property
	 * @type Boolean
	 * @private
	 */
	var paralyzed = false;

	/**
	 * True if the Webapp has been {@link #interrupt}. This will
	 * queue all requests which will be send to the server, until the connection
	 * is restored again.
	 * @property
	 * @type Boolean
	 * @private
	 */
	var interrupted = false;

	/**
	 * The current base number for the generating new requestsIds
	 * using the {@link #getRequestId} function.
	 * @property
	 * @type Number
	 * @private
	 */
	var requestIdBase = 0;

	/**
	 * The current JSON object containing all requests which
	 * should be send to the server on the next call to
	 * {@link #send}. Will be reset on {@link #reset}.
	 * @property
	 * @type Object
	 * @private
	 */
	var zarafaTag;

	/**
	 * The flag to indicate if zarafaTag holds JSON data.
	 * This influences if the contents of zarafaTag will be encoded or not.
	 * @property
	 * @type Boolean
	 * @private
	 */
	var hasJson = false;

	/**
	 * The flag to indicate if zarafaTag holds RAW data.
	 * This influences if the contents of zarafaTag will be encoded or not.
	 * @property
	 * @type Boolean
	 * @private
	 */
	var hasData = false;

	/**
	 * The list of request ids as generated by {@link #getRequestId} of all
	 * requests which are added after a {@link #reset} and before {@link #send}.
	 * These will be merged into {@link #activeRequests} on {@link #send}.
	 * @property
	 * @type Array
	 * @private
	 */
	var queuedRequests = [];

	/**
	 * Key-value list of request ids and the corresponding {@link XMLHttpRequest} objects
	 * which was used to send the request to the server. These requests are all pending
	 * on the PHP side. These will be cleared as soon as the response has been received.
	 * As long as a request is listed here, it can be canceled using {@link #cancelActiveRequest}.
	 * @property
	 * @type Array
	 * @private
	 */
	var activeRequests = {};

	/**
	 * The list of {@link #XMLHttpRequest} objects which are queued while the
	 * {@link #interrupted connection is interrupted}. These will be dequeued
	 * later when the connection is restored.
	 * @property
	 * @type Array
	 * @private
	 */
	var queuedInterruptedHttpRequests = [];

	/**
	 * The unique id for subsystem which will be used to differentiate between two sessions of same user
	 * using same browser but in different tabs.
	 * @property
	 * @type String
	 * @private
	 */
	var subSystemId;

	return {
		// public variables
		/**
		 * @cfg {String} defaultUrl
		 * The url used to send the requests to. defaults to grommunio.php.
		 */
		defaultUrl: 'grommunio.php',

		/**
		 * @cfg {Object} defaultHeaders
		 * The default headers to be applied to the request. defaults to
		 *	'Content-Type' => 'application/json; charset=utf-8;'
		 */
		defaultHeaders: undefined,

		/**
		 * @cfg {String} subSystemPrefix string that will be used to generate session filename which
		 * will be used to store session data in php. current timestamp will be appended to this string
		 * so different tabs opened in same browser will have different session data. So every request object
		 * corresponds to one unique subSystem string id (accuracy upto miliseconds).
		 */
		subSystemPrefix: 'webapp',

		/**
		 * @cfg {Object} requestHeaders
		 * Headers that should be sent with every request.
		 */
		requestHeaders: undefined,

		/**
		 * @constructor
		 * @param {Object} config Configuration object
		 */
		constructor: function(config)
		{
			config = config || {};

			Ext.apply(config, {
				// Apply here instead of class prototype, to prevent
				// accidental sharing of object between all instances.
				defaultHeaders: {
					'Content-Type': 'application/json; charset=utf-8;'
				},
				requestHeaders: {}
			});

			Ext.apply(this, config);

			this.addEvents(
				/**
				 * @event connectionparalyzed
				 * Fired when the window is about to be unloaded. At this moment
				 * grommunio Web will shutdown and start dropping all communication with the PHP
				 * @param {Zarafa.core.Request} request
				 * @param {Zarafa.core.data.ParalyzeReason} reason The reason to paralyze the grommunio Web
				 */
				'connectionparalyzed',
				/**
				 * @event connectioninterrupted
				 * Fired when the connection to the server has been lost, but is likely
				 * to be restored soon. grommunio Web will start pausing all communication with
				 * the PHP until the connection has been restored.
				 * @param {Zarafa.core.Request} request
				 * @param {Zarafa.core.PingService} service The ping service which will
				 * be used to ping for the connection restoration.
				 */
				'connectioninterrupted',
				/**
				 * @event connectionrestored
				 * Fired when the connection to the server has been restored. This will
				 * resend any requests to the PHP which were scheduled while the connection
				 * was lost.
				 * @param {Zarafa.core.Request} request
				 */
				'connectionrestored',
				/**
				 * @event beforesend
				 * Fires before the XmlHttpRequest sends a request to the server.
				 * Return false to not send request to server.
				 * @param {Zarafa.core.Request} request
				 * @param {window.XMLHttpRequest} xmlHttpRequest XmlHttpRequest object
				 */
				'beforesend',
				/**
				 * @event aftersend
				 * Fires after the XmlHttpRequest sent a request to the server.
				 * @param {Zarafa.core.Request} request
				 * @param {window.XMLHttpRequest} xmlHttpRequest XmlHttpRequest object
				 */
				'aftersend'
			);

			Zarafa.core.Request.superclass.constructor.call(this, config);

			// Initialize all private variables
			this.initialize();
		},

		/**
		 * Initialize all private variables of the Request object
		 * @private
		 */
		initialize: function()
		{
			paralyzed = false;
			interrupted = false;
			requestIdBase = 0;
			zarafaTag = undefined;
			hasJson = false;
			hasData = false;
			queuedRequests = [];
			activeRequests = {};
			queuedInterruptedHttpRequests = [];
			subSystemId = this.subSystemPrefix + '_' + new Date().getTime();
		},

		/**
		 * Set the {@link #paralyzed} property which will prevent any requests from
		 * being send out to the server. This will fire the {@link #connectionparalyzed} event.
		 * @param {Zarafa.core.data.ParalyzeReason} reason The reason to paralyze grommunio Web
		 */
		paralyze: function(reason)
		{
			if (this.isParalyzed()) {
				return;
			}

			paralyzed = true;
			this.fireEvent('connectionparalyzed', this, reason);
		},

		/**
		 * @return {Boolean} True if the connection is {@link #paralyzed}.
		 */
		isParalyzed: function()
		{
			return paralyzed;
		},

		/**
		 * Set the {@link #interrupted} property which will pause all requests to be send out
		 * to the server. These will be send when the connection is {@link #restore restored}.
		 * @private
		 */
		interrupt: function()
		{
			if (this.isInterrupted() || this.isParalyzed()) {
				return;
			}

			interrupted = true;

			// Instantiate the PingService for polling the
			// server for the recovery of the connection.
			var service = new Zarafa.core.PingService({
				url: this.defaultUrl,
				headers: this.defaultHeaders
			});

			// Add event handler which will restore interaction with
			// the PHP server when the link has been restored.
			service.on('restored', this.restore, this);

			// Add some event handlers which will stop the PingService
			// as soon as the connection is restored, or if grommunio Web
			// is being paralyzed. We defer the connectionrestored by 1 ms,
			// so we force the 'stop' event from the service to be fired after
			// all 'restored' event handlers from the service have been handled.
			this.on('connectionparalyzed', service.stop, service);
			this.on('connectionrestored', service.stop, service, { delay: 1 });

			// Fire the event, allow interested parties to register
			// for events on the service before we start it.
			this.fireEvent('connectioninterrupted', this, service);

			// start the service
			service.start();
		},

		/**
		 * Clear the {@link #interrupted} property which will restore all requests which were
		 * paused while the connection was interrupted.
		 * @param {Zarafa.core.PingService} service This object
		 * @param {Object} response The response as send by the server
		 * @private
		 */
		restore: function(service, response)
		{
			if (!this.isInterrupted()) {
				return;
			}

			// If the response object indicates that our session
			// is no longer active, we must paralyze grommunio Web
			// as no further requests can be send to the server.
			if (response && response.active === false) {
				this.paralyze(Zarafa.core.data.ParalyzeReason.SESSION_EXPIRED);
				return;
			} else {
				interrupted = false;
				this.fireEvent('connectionrestored', this);

				// If there was a HTTP request queued, we should
				// send the first one now. The next one will be
				// send when the first one has responded. (This prevents
				// a DDOS if the connection was lost for a long time,
				// and many clients are connected to the server).
				if (this.hasQueuedHttpRequests()) {
					this.dequeueHttpRequest();
				}
			}
		},

		/**
		 * @return {Boolean} True if the connection is {@link #interrupted}.
		 */
		isInterrupted: function()
		{
			return interrupted;
		},

		/**
		 * Sets request headers that will be sent with every request made through {@link Zarafa.core.Request} object.
		 * @param {String} key header key.
		 * @param {String} value header value.
		 */
		setRequestHeader: function(key, value)
		{
			this.requestHeaders[key] = value;
		},

		/**
		 * Generates a new unique Request ID, which can be used to match
		 * the request with a response.
		 * @param {String} prefix (optional) The prefix for the unique request id.
		 * @return {String} request ID
		 */
		getRequestId: function(prefix)
		{
			return (prefix || 'z-gen') + (++requestIdBase);
		},

		/**
		 * Function will be used to cancel a previously generated request which is waiting for the server request.
		 * When doing multiple requests we need to make sure that previous requests are cancelled otherwise data
		 * can be overwritten by previous requests. Special requirement was that we can't do {@link window.XMLHttpRequest#abort}
		 * as it will abort the whole request and discard data that was added to response by server side, which is not
		 * good when server has added any notification data to response (like new mail), so we will need to overwrite
		 * responseHandler of this particular request with {@link Zarafa.core.data.DummyResponseHandler}, which will
		 * have empty functions for discarding response came from server and notifications will be handled normally.
		 * @param {String} requestId The request id.
		 */
		cancelActiveRequest: function(requestId)
		{
			var responseRouter = container.getResponseRouter();

			// If the request is still queued, we have an opportunity to
			// prevent the entire request. However this is only possible
			// if no other request was queued, as then we can cancel all the
			// pending data. If that is not the case, we have to register the
			// DummyResponseHandler
			if (queuedRequests.indexOf(requestId) >= 0) {
				if (queuedRequests.length === 1) {
					// Reset environment
					this.reset();
					responseRouter.removeRequestResponseHandler(requestId);
				} else {
					responseRouter.addRequestResponseHandler(requestId, new Zarafa.core.data.DummyResponseHandler());
				}
				return;
			}

			// If there is a link interruption, then the request might still be queued.
			// This means we can interrupt the request before it is being send to the
			// server.
			if (this.hasQueuedHttpRequests()) {
				// Search through the list of pending HTTP requests
				// to find the one which holds our cancelled request id.
				for (var i = 0; i < queuedInterruptedHttpRequests.length; i++) {
					var xhrObj = queuedInterruptedHttpRequests[i];
					var index = xhrObj.queuedRequests.indexOf(requestId);

					if (index >= 0) {
						// We found the request, but now comes the problem.
						// We can only cancel the entire HTTPRequest if this
						// was the only request on the object. Because we don't
						// know which part of the JSON corresponds to this request.
						if (xhrObj.queuedRequests.length === 1) {
							queuedInterruptedHttpRequests.splice(i, 1);
							responseRouter.removeRequestResponseHandler(requestId);
							return;
						}

						// If we can't cancel the request, we can break
						// the loop and just change the response handler.
						break;
					}
				}

				// We didn't find the request to which the request corresponds,
				// or we couldn't cancel the entire request. In either case,
				// we have to register the DummyResponseHandler.
				responseRouter.addRequestResponseHandler(requestId, new Zarafa.core.data.DummyResponseHandler());
				return;
			}

			// If the request has been send out to the server, we cannot cancel
			// it and thus we will have to register the DummyResponseHandler to
			// prevent the response from being processed. However we can mark
			// the corresponding xmlHttpRequest so we will not retry it if all
			// requests have been cancelled.
			var xhrObj = activeRequests[requestId];
			if (Ext.isDefined(xhrObj)) {
				// Only prevent the retry if all requests attached
				// to the xmlHttpRequest have been cancelled.
				if (xhrObj.queuedRequests.length === 1) {
					xhrObj.preventRetry = true;
				}
				responseRouter.addRequestResponseHandler(requestId, new Zarafa.core.data.DummyResponseHandler());
				return;
			}
		},

		/**
		 * Queue a request to {@link #queuedRequests}. This can be dequeued
		 * in {@link #dequeueRequests}.
		 * @param {String} The request to be queued
		 * @private
		 */
		queueRequest: function(request)
		{
			queuedRequests.push(request);
		},

		/**
		 * Obtain and dequeue any requests from {@link #queuedRequests}. Use
		 * {@link #activateRequests} to add them the the {@link #activeRequests} array
		 * once the request has been send out.
		 * @return {Array} The array of previously queued requests
		 * @private
		 */
		dequeueRequests: function()
		{
			var requests = queuedRequests;
			queuedRequests = [];
			return requests;
		},

		/**
		 * Move all requests into {@link #activeRequests}. The provided requests
		 * should previously have been obtained through {@link #dequeueRequests}.
		 * @param {Array} requests The list of requests to activate.
		 * @private
		 */
		activateRequests: function(requests, xmlHttpRequest)
		{
			for (var i = 0; i < requests.length; i++) {
				activeRequests[requests[i]] = xmlHttpRequest;
			}
		},

		/**
		 * Remove all given requests from the {@link #activeRequests} queue.
		 * @param {Array} requests The list of requests to complete
		 * @private
		 */
		completeRequests: function(requests)
		{
			for (var i = 0, len = requests.length; i < len; i++) {
				delete activeRequests[requests[i]];
			}
		},

		/**
		 * Prepare a {@link XMLHttpRequest} object which will be used to transmit data to the server for processing.
		 * it also registers a callback function for onreadystatechange event that will be called when server sends response.
		 * @param {Mixed} requestData data that will be send using this request object, for XML request it
		 * will be XML document or else it will be JSON string.
		 * @param {Boolean} encoded True of the requestData is encoded, and must be decoded to be used.
		 * @param {String} url (optional) url to post to. Defaults to {@link #defaultUrl}
		 * @param {Object} headers (optional) headers to apply to the request. Defaults to {@link #defaultHeaders}
		 * @return {XMLHttpRequest} The initialized XMLHttpRequest
		 * @private
		 */
		prepareHttpRequest: function(requestData, encoded, url, headers)
		{
			var xmlHttpRequest = new XMLHttpRequest();

			if (!url) {
				url = this.defaultUrl;
				url = Ext.urlAppend(url, 'subsystem=' + subSystemId);
			}

			xmlHttpRequest.open('POST', url, true);
			xmlHttpRequest.requestUrl = url;

			// Apply header from argument, or apply the default headers
			headers = Ext.apply({}, this.requestHeaders, headers || this.defaultHeaders);
			for (var key in headers) {
				xmlHttpRequest.setRequestHeader(key, headers[key]);
			}
			xmlHttpRequest.requestHeaders = headers;

			// Store requestData into the xmlHttpRequest, when the request failed,
			// we can still determine report the failure back to the requestee.
			xmlHttpRequest.requestData = requestData;
			xmlHttpRequest.requestDataEncoded = encoded;
			xmlHttpRequest.queuedRequests = this.dequeueRequests();

			return xmlHttpRequest;
		},

		/**
		 * Clone a {@link XMLHttpRequest} instance which was prepared by {@link #prepareHttpRequest} and
		 * has previously been attempted to be {@link #sendHttpRequest send out} but failed due to a broken
		 * connection. This will clone the instance, so the request can be retried when the connection
		 * returns.
		 * @param {XMLHttpRequest} xmlHttpRequest The request object to clone
		 * @return {XMLHttpRequest} The cloned XMLhttpRequest object
		 * @private
		 */
		cloneRequest: function(xmlHttpRequest)
		{
			var cloneRequest = new XMLHttpRequest();
			cloneRequest.open('POST', xmlHttpRequest.requestUrl, true);
			cloneRequest.requestUrl = xmlHttpRequest.requestUrl;

			var headers = xmlHttpRequest.requestHeaders;
			for (var key in headers) {
				cloneRequest.setRequestHeader(key, headers[key]);
			}
			cloneRequest.requestHeaders = headers;

			cloneRequest.requestData = xmlHttpRequest.requestData;
			cloneRequest.requestDataEncoded = xmlHttpRequest.requestDataEncoded;
			cloneRequest.queuedRequests = xmlHttpRequest.queuedRequests;

			return cloneRequest;
		},

		/**
		 * Send out a {@link XMLHttpRequest} which was initialized by {@link #prepareHttpRequest}. This will
		 * perform the final step for transmitting the request, by firing the {@link #beforesend} event,
		 * and {@link #activeRequests activating the queued requests}.
		 * @param {XMLHttpRequest} xmlHttpRequest The request object
		 * @private
		 */
		sendHttpRequest: function(xmlHttpRequest)
		{
			var requestData = xmlHttpRequest.requestData;
			var requests = xmlHttpRequest.queuedRequests;

			// When the connection paralyzed, we cannot handle any incoming data anymore.
			// So all outgoing requests will be dropped.
			if (this.isParalyzed()) {
				return;
			}

			if (this.fireEvent('beforesend', this, xmlHttpRequest) === false) {
				return;
			}

			// Register the onready StateChange event handler
			xmlHttpRequest.onreadystatechange = this.stateChange.createDelegate(this, [xmlHttpRequest]);

			// Move the queued requests to the active list.
			this.activateRequests(requests, xmlHttpRequest);

			// send request
			xmlHttpRequest.send(requestData);

			this.fireEvent('aftersend', this, xmlHttpRequest);
		},

		/**
		 * {@link #queuedInterruptedHttpRequests Queue} a {@link XMLHttpRequest} which was initialized by
		 * {@link #prepareHttpRequest}. This will keep the request instance until it can be send
		 * to the server at a {@link #dequeueHttpRequest later time}.
		 * @param {XMLHttpRequest} xmlHttpRequest The request object
		 * @private
		 */
		queueHttpRequest: function(xmlHttpRequest)
		{
			queuedInterruptedHttpRequests.push(xmlHttpRequest);
		},

		/**
		 * Check if there are queued {@link #queuedInterruptedHttpRequests HTTP requests}
		 * @return {Boolean} True if there are queued HTTP requests
		 * @private
		 */
		hasQueuedHttpRequests: function()
		{
			return !Ext.isEmpty(queuedInterruptedHttpRequests);
		},

		/**
		 * Dequeue a {@link #queuedInterruptedHttpRequests HTTP request} and {@link #sendHttpRequest send it} to the server
		 * @private
		 */
		dequeueHttpRequest: function()
		{
			var xmlHttpRequest = queuedInterruptedHttpRequests.shift();
			if (xmlHttpRequest) {
				this.sendHttpRequest(xmlHttpRequest);
			}
		},

		/**
		 * Called by XMLHttpRequest when a response from the server is coming in. When the entire response has been
		 * completed it calls {@link Zarafa.core.ResponseRouter#receive receive}} which handles the rest of the process.
		 * @param {Object} xmlHttpRequest The raw HTTP request object that is used for communication.
		 * @private
		 */
		stateChange: function(xmlHttpRequest)
		{
			var requestIds = xmlHttpRequest.queuedRequests;
			var responseRouter = container.getResponseRouter();
			var response;

			// When the connection is paralyzed, we cannot handle any incoming data anymore.
			// All incoming responses from the server will be dropped.
			if (this.isParalyzed()) {
				return;
			}

			// The readyState can be 4 values:
			// 0 - Object is created, but not initialized
			// 1 - Request has been opened, but send() has not been called yet
			// 2 - send() has been called, no data available yet
			// 3 - Some data has been received, responseText nor responseBody are available
			// 4 - All data has been received
			//
			// readyState 0 - 3 can be completely ignored by us, as they are only updates
			// about the current progress. Only on readyState 4, should we continue and
			// start checking for the response status.
			if (xmlHttpRequest.readyState != 4) {
				return;
			}

			// The transaction is complete, all requests must now be cleared from the list.
			// Note that when we got a HTTP error, the requests are still removed, since
			// the HTTP request is no longer pending.
			this.completeRequests(requestIds);

			// HTTP request must have succeeded
			switch (xmlHttpRequest.status) {
				case 401: /* Unauthorized */
					// Indicate that the user is no longer logged in, and
					// he must re-authenticate. This must be done through the
					// normal logon page, so here we just paralyze the Request.
					// The exact reason for the paralyzation can be found in the
					// headers.
					var reason = xmlHttpRequest.getResponseHeader('X-Zarafa-Hresult');
					if (reason === 'MAPI_E_INVALID_WORKSTATION_ACCOUNT') {
						this.paralyze(Zarafa.core.data.ParalyzeReason.SESSION_INVALID);
					} else {
						this.paralyze(Zarafa.core.data.ParalyzeReason.SESSION_EXPIRED);
					}
					return;
				case 500: /* Internal Server Error */
					// The connection is present, if there still are queued
					// HTTP requests, we can send the next one right now.
					if (this.hasQueuedHttpRequests()) {
						this.dequeueHttpRequest();
					}

					// Indicate that the request failed
					// inside the server and exit the function.
					this.receiveFailure(xmlHttpRequest);
					return;
				case 200: /* OK */
					// The connection is present, if there still are queued
					// HTTP requests, we can send the next one right now.
					if (this.hasQueuedHttpRequests()) {
						this.dequeueHttpRequest();
					}
					break;
				default: /* Connection errors */
					// Interrupt the connection
					this.interrupt();

					// Clone the XMLHttpRequest and queue it
					// for when the connection is restored.
					if (xmlHttpRequest.preventRetry !== true) {
						var clone = this.cloneRequest(xmlHttpRequest);
						this.queueHttpRequest(clone);
					}
					return;
			}

			// Depending on the response type, convert it into a data Object.
			if (xmlHttpRequest.responseText) {
				// JSON response
				response = Ext.decode(xmlHttpRequest.responseText);
			} else {
				// XML response is not supported
				this.receiveFailure(xmlHttpRequest);
				return;
			}

			// Check for empty response, sometimes the PHP server doesn't bother with
			// responding with any data.
			if (Ext.isEmpty(response) || Ext.isEmpty(response.zarafa)) {
				this.receiveFailure(xmlHttpRequest);
				return;
			}

			responseRouter.receive(response);
		},

		/**
		 * Called when the {@link XMLHttpRequest} object indicates a problem
		 * in the returned data from the server. This will call
		 * {@link Zarafa.core.ResponseRouter#receiveFailure receiveFailure} on
		 * the {@link Zarafa.core.ResponseRouter ResponseRouter}.
		 * @param {XMLHttpRequest} xmlHttpRequest The xmlHttpRequest which contains the problem
		 * @private
		 */
		receiveFailure: function(xmlHttpRequest)
		{
			var responseRouter = container.getResponseRouter();
			var requestData = xmlHttpRequest.requestData;
			if (xmlHttpRequest.requestDataEncoded) {
				requestData = Ext.decode(requestData);
			}
			responseRouter.receiveFailure(requestData, xmlHttpRequest);
		},

		/**
		 * Resets the {@link Zarafa.core.Request Request} object and prepares it for
		 * accepting new calls to {@link #addRequest} or {@link #singleRequest}.
		 */
		reset: function()
		{
			queuedRequests = [];

			zarafaTag = {
				'zarafa': {}
			};
			hasJson = false;
			hasData = false;
		},

		/**
		 * Adds a single request to the Request object. This is a combination of a module name, id and action.
		 * The parameters objected will be encoded and added into the action tag.
		 * The callbacks are used when the responds for this specific request has returned.
		 * @param {String} moduleName name of the module to communicate with (i.e. 'addressbooklistmodule')
		 * @param {String} actionType action to perform (i.e. 'list' or 'globaladdressbook')
		 * @param {Object} actionData data that will included in the action tag (i.e. { restriction: { name: 'piet' } })
		 * @param {Zarafa.core.data.AbstractResponseHandler} responseHandler The response handler which must be
		 * used for handling the responds for this specific request.
		 * @return {String} The unique Request ID which was assigned to this request.
		 */
		addRequest: function(moduleName, actionType, actionData, responseHandler)
		{
			if (Ext.isEmpty(zarafaTag)) {
				throw 'Request object not initialised. Call reset() first';
			}
			if (hasData) {
				throw 'Request object initialized with RAW data';
			}

			var requestId = this.getRequestId(moduleName);
			this.queueRequest(requestId);

			if (Ext.isDefined(responseHandler)) {
				container.getResponseRouter().addRequestResponseHandler(requestId, responseHandler);
			}

			actionData = Ext.value(actionData, {});

			// create new module tag if not present
			if (!Ext.isDefined(zarafaTag.zarafa[moduleName])) {
				zarafaTag.zarafa[moduleName] = {};
			}

			// create new module id tag if not present
			if (!Ext.isDefined(zarafaTag.zarafa[moduleName][requestId])) {
				zarafaTag.zarafa[moduleName][requestId] = {};
			}

			// add action data
			zarafaTag.zarafa[moduleName][requestId][actionType] = actionData;

			// JSON data was added
			hasJson = true;

			return requestId;
		},

		/**
		 * Adds a single request to the Request object. Opposed to {@link #addRequest} this will be raw data.
		 * The paramenters object will be placed to the action tag.
		 * The callbacks are used when the responds for this specific request has returned.
		 * @param {String} moduleName name of the module to communicate with (i.e. 'addressbooklistmodule')
		 * @param {String} actionType action to perform (i.e. 'list' or 'globaladdressbook')
		 * @param {Object} actionData data that will included in the action tag
		 * @param {Zarafa.core.data.AbstractResponseHandler} responseHandler The response handler which must be
		 * used for handling the responds for this specific request.
		 * @return {String} The unique Request ID which was assigned to this request.
		 */
		addDataRequest: function(moduleName, actionType, actionData, responseHandler)
		{
			if (Ext.isEmpty(zarafaTag)) {
				throw 'Request object not initialised. Call reset() first';
			}
			if (hasJson) {
				throw 'Request object intitialized with JSON data';
			}
			if (hasData) {
				throw 'Request object already contains RAW data';
			}

			var requestId = this.getRequestId(moduleName);
			this.queueRequest(requestId);

			if (Ext.isDefined(responseHandler)) {
				container.getResponseRouter().addRequestResponseHandler(requestId, responseHandler);
			}

			// add action data
			zarafaTag = actionData;

			// Raw data was added
			hasData = true;

			return requestId;
		},

		/**
		 * Calls {@link #prepareHttpRequest} to actually create the request using passed data,
		 * and calls {@link #sendHttpRequest} to send request.
		 * @param {String} url (optional) url to post to. Defaults to {@link #defaultUrl}
		 * @param {Object} headers (optional) headers to apply to the request. Defaults to {@link #defaultHeaders}
		 */
		send: function(url, headers)
		{
			if (Ext.isEmpty(zarafaTag)) {
				throw 'Request object not initialised. Call reset() first';
			}

			if (Ext.isEmpty(queuedRequests)) {
				throw 'No requests have been added. Use addRequest()';
			}

			if (!this.isParalyzed()) {
				var xmlHttpRequest = this.prepareHttpRequest(hasJson ? Ext.encode(zarafaTag) : zarafaTag, hasJson, url, headers);
				if (this.isInterrupted() || this.hasQueuedHttpRequests()) {
					this.queueHttpRequest(xmlHttpRequest);
				} else {
					this.sendHttpRequest(xmlHttpRequest);
				}
			}

			// All data has been send, reset the zarafaTag to
			// prevent sending the same request twice.
			zarafaTag = undefined;
			hasJson = false;
			hasData = false;
		},

		/**
		 * Convenience method for performing a single JSON request to the server.
		 * It calls {@link #reset reset()}, {@link #addRequest addRequest()}, and {@link #send send()} in turn.
		 * @param {String} moduleName name of the module to communicate with (i.e. 'addressbooklistmodule')
		 * @param {String} actionType action to perform (i.e. 'list' or 'globaladdressbook')
		 * @param {Object} actionData data that will included in the action tag (i.e. { restriction: { name: 'piet' } })
		 * @param {Zarafa.core.data.AbstractResponseHandler} responseHandler The response handler which must be
		 * used for handling the responds for this specific request.
		 * @return {String} The unique request ID which was assigned to this transaction object.
		 */
		singleRequest: function(moduleName, actionType, actionData, responseHandler)
		{
			var requestId;

			this.reset();
			requestId = this.addRequest(moduleName, actionType, actionData, responseHandler);
			this.send();

			return requestId;
		},

		/**
		 * Method to {@link window.XMLHttpRequest#abort} given request discarding whatever the data
		 * added to response by server.
		 * @param {XMLHttpRequest} xhrObj Object of the request made previously.
		 */
		abortRequest: function(xhrObj)
		{
			xhrObj.preventRetry = true;
			xhrObj.abort();
		},

		/**
		 * Method gives active {@link XMLHttpRequest request} object based on given requestId which
		 * was used to send the request to server.
		 * @param {String} requestId Unique identifier of the request made previously.
		 */
		getActiveRequest: function(requestId)
		{
			return activeRequests[requestId];
		}
	};
})());
