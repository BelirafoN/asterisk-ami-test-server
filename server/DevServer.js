/**
 * Developer: BelirafoN
 * Date: 13.04.2016
 * Time: 15:26
 */

"use strict";

const net = require('net');
const shortId = require('shortid');
const EventEmitter = require('events').EventEmitter;
const debugLog = require('debug')('TestServer');
const errorLog = require('debug')('TestServer:error');
const amiUtils = require('asterisk-ami-event-utils');
const amiDataStream = require('asterisk-ami-events-stream');

/**
 * TestServer
 */
class TestServer extends EventEmitter{

    /**
     *
     * @param options
     */
    constructor(options){
        super();

        Object.assign(this, {
            _options: options,
            _server: net.createServer(),
            _clients: {}
        });
    }

    /**
     *
     * @param data
     * @returns {TestServer}
     */
    broadcast(data){
        Object.keys(this._clients).forEach(key => this._clients[key].write(data));
        return this;
    }

    /**
     *
     * @param port
     * @returns {Promise}
     */
    listen(port){
        let self = this;
        return new Promise((resolve, reject) => {
            this.on('error', reject);
            this._server.listen(port, () => {
                debugLog(`Server listening on ${self._server.address().port} port`);
                self._server
                    .on('close', this.close.bind(this))
                    .on('connection', this._connectionHandler.bind(this))
                    .removeAllListeners('error')
                    .on('error', error => errorLog)
                    .on('listening', () => this.emit('listening'));
                resolve(self);
            });
        });
    }

    /**
     *
     * @returns {TestServer}
     */
    close(){
        Object.keys(this._clients).forEach(key => this._clients[key].end('bye!', 'utf-8'));
        this._clients = {};
        this._server && this._server.close();
        this.emit('close');
        this._server.removeAllListeners('close')
            .removeAllListeners('error')
            .removeAllListeners('connection')
            .removeAllListeners('listening');

        return this;
    }

    /**
     *
     * @returns {*}
     */
    getClients(){
        return Object.keys(this._clients).reduce((clients, key) => {
            clients.push(this._clients[key]);
            return clients;
        }, []);
    }

    /**
     *
     * @returns {*}
     */
    get clients(){
        return this.getClients();
    }

    /**
     *
     * @param login
     * @param password
     * @returns {boolean}
     * @private
     */
    _isAttempt(login, password){
        return !this._credentials || this._credentials.login === login && this._credentials.password === password;
    }

    _getClientsCount(){
        return Object.keys(this._clients).length;
    }

    _isAllowConnection(){
        return !(this._options.maxConnections === 0 || this._getClientsCount() >= this._options.maxConnections);
    }

    _connectionHandler(socket){
        if(!this._isAllowConnection()){
            debugLog(`Connection rejected. Clients count: ${this._getClientsCount()}, maxConnections: ${this._options.maxConnections}`);
            socket.end();
            return;
        }

        this._message && socket.write(this._message + '\r\n');

        socket._key = shortId.generate();
        socket._eventStream = new amiDataStream();
        socket._authTimer = setTimeout(key => {
            socket.unpipe(socket._eventStream);
            socket.end();
        }, this._options['authTimeout'] || 5000, socket);

        debugLog(`Connect key:${socket._key}.`);

        socket
            .on('close', () => {
                socket.unpipe(socket._eventStream);
                delete this._clients[socket._key];
                debugLog(`Disconnect key:${socket._key}.`);
            })
            .on('error', error => {
                socket.unpipe(socket._eventStream);
                delete this._clients[socket._key];
                debugLog(`Connection key:${socket._key} error: ${error.message}.`);
            })
            .pipe(socket._eventStream);


        socket._eventStream.on('event', authHandler.bind(this));

        function authHandler(data){
            var parsed = amiUtils.parse(data, true),
                action = null;

            if(parsed && parsed.action){
                action = parsed.action.toLowerCase();
            }

            if(!parsed || !action){
                socket.write([
                        'Response: Error',
                        'Message: Missing action in request'
                    ].join('\r\n') + '\r\n\r\n');

                socket._eventStream.once('event', authHandler.bind(this));
                return;
            }

            if(action !== 'ping' && action !== 'login' && action !== 'logoff'){
                socket.write([
                        'Response: Error',
                        'Message: Invalid/unknown command'
                    ].join('\r\n') + '\r\n\r\n');

                socket._eventStream.once('event', authHandler.bind(this));
                return;
            }

            if(parsed.action && action === 'ping'){
                socket.write([
                        'Response: Success',
                        'Ping: Pong',
                        'ActionID: ' + parsed.actionid,
                        'Timestamp: ' + Date.now() / 1000 + '000'
                    ].join('\r\n') + '\r\n\r\n');

                socket._eventStream.once('event', authHandler.bind(this));
                return;
            }

            if(parsed.action && action === 'logoff'){
                clearTimeout(socket._authTimer);
                socket.end([
                        'Response: Goodbye',
                        'Message: Thanks for all the fish.'
                    ].join('\r\n') + '\r\n\r\n');
                return;
            }

            if(action !== 'login' || !this._isAttempt(parsed.username, parsed.secret)){
                clearTimeout(socket._authTimer);
                socket.end('auth error');
                return;
            }

            clearTimeout(socket._authTimer);
            socket.write(amiUtils.stringify({
                Response: 'Success',
                Message: 'Authentication accepted'
            }));
            socket.write(amiUtils.stringify({
                Event: 'FullyBooted'
            }));

            debugLog(`Authorization success key:${socket._key}. Clients count: ${this._getClientsCount()}`);
            this._clients[socket._key] = socket;
            this._authorizedMessage && socket.write(this._authorizedMessage);
            this.emit('connection', this._getClientsCount());
        }
    }
}

module.exports = TestServer;