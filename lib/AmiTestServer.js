/**
 * Developer: BelirafoN
 * Date: 13.04.2016
 * Time: 15:26
 */

"use strict";

const CRLF = '\r\n';
const net = require('net');
const shortId = require('shortid');
const EventEmitter = require('events').EventEmitter;
const debugLog = require('debug')('AmiTestServer');
const errorLog = require('debug')('AmiTestServer:error');
const amiUtils = require('asterisk-ami-event-utils');
const amiDataStream = require('asterisk-ami-events-stream');
const meta = require('../package.json');

/**
 * AmiTestServer
 */
class AmiTestServer extends EventEmitter{

    /**
     *
     * @param options
     */
    constructor(options){
        super();

        Object.assign(this, {
            _helloMessage: `Asterisk AMI Test Server ${meta.version}`,
            _options: Object.assign({
                maxConnections: 50,
                authTimeout: 30000,
                credentials: {}
            }, options || {}),
            _server: net.createServer(),
            _clients: {}
        });
    }

    /**
     *
     * @param data
     * @returns {AmiTestServer}
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
        return new Promise((resolve, reject) => {
            this._server
                .on('error', reject)
                .listen(port, () => {
                    console.log(`Asterisk AMI Test Server listening on ${this._server.address().port} port`);

                    this._server
                        .on('close', this.close.bind(this))
                        .on('connection', this._connectionHandler.bind(this))
                        .on('error', error => this.emit(error))
                        .on('listening', () => this.emit('listening'));

                    resolve(this);
                });
        })
            .catch(error => error)
            .then(value => {
                this._server.removeAllListeners('error');
                if(value instanceof Error){ throw value; }
            });
    }

    /**
     *
     * @returns {AmiTestServer}
     */
    close(){
        Object.keys(this._clients)
            .forEach(key => this._clients[key].end());

        this._clients = {};
        this._server && this._server.close();
        this._server.removeAllListeners();
        this.emit('close');

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
        let credentials = this._options.credentials;
        return !credentials ||
            !credentials.username ||
                credentials.username.toString().length &&
                credentials.username === login &&
                credentials.secret.toString().length &&
                credentials.secret === password;
    }

    /**
     *
     * @returns {Number}
     * @private
     */
    _getClientsCount(){
        return Object.keys(this._clients).length;
    }

    /**
     *
     * @returns {boolean}
     * @private
     */
    _isAllowConnection(){
        return !(this._options.maxConnections === 0 || this._getClientsCount() >= this._options.maxConnections);
    }

    /**
     *
     * @param clientSocket
     * @private
     */
    _connectionHandler(clientSocket){
        if(!this._isAllowConnection()){
            debugLog(`Connection rejected. Clients count: ${this._getClientsCount()}, maxConnections: ${this._options.maxConnections}`);
            clientSocket.end();
            return;
        }

        Object.assign(clientSocket, {
            _key: shortId.generate(),
            _eventStream: new amiDataStream(),
            _authTimer: null
        });

        clientSocket
            .on('close', () => {
                clientSocket._eventStream && clientSocket.unpipe(clientSocket._eventStream);
                delete this._clients[clientSocket._key];
                debugLog(`Client disconnected [key:${clientSocket._key}].`);
            })
            .on('error', error => {
                clientSocket._eventStream && clientSocket.unpipe(clientSocket._eventStream);
                delete this._clients[clientSocket._key];
                debugLog(`Client connection error [key:${clientSocket._key}]: ${error.message}.`);
            })
            .pipe(clientSocket._eventStream);

        clientSocket._authTimer = setTimeout(clientSocket => {
            clientSocket.unpipe(clientSocket._eventStream);
            clientSocket.end();
        }, this._options.authTimeout, clientSocket);


        clientSocket._eventStream.on('amiAction', action => {
            if(this._clients[clientSocket._key]){
                AmiTestServer._actionHandler(action, clientSocket);

            }else{
                this._authHandler(action, clientSocket);
            }
        });
        debugLog(`Client's connect established [key:${clientSocket._key}].`);
    }

    /**
     *
     * @param action
     * @param clientSocket
     * @private
     */
    _authHandler(action, clientSocket){
        let actionName = null,
            responseData = action.ActionID ? {ActionID: action.ActionID} : {};

        if(action && action.Action){
            actionName = action.Action.toLowerCase();
        }

        if(!action || !actionName){
            clientSocket.write(amiUtils.fromObject({
                Response: 'Error',
                Message: 'Missing action in request'
            }));
            return;
        }

        if(actionName !== 'ping' && actionName !== 'login'){
            clientSocket.write(amiUtils.fromObject(Object.assign({
                Response: 'Error',
                Message: 'Invalid/unknown command'
            }, responseData)));
            return;
        }

        if(actionName === 'ping'){
            AmiTestServer._pingHandler(action, clientSocket);
            return;
        }

        if(actionName !== 'login' || !this._isAttempt(action.Username, action.Secret)){
            clearTimeout(clientSocket._authTimer);
            clientSocket.end(amiUtils.fromObject(Object.assign({
                Response: 'Error',
                Message: 'Authentication failed'
            }, responseData)));
            return;
        }

        clearTimeout(clientSocket._authTimer);

        clientSocket.write(amiUtils.fromObject(Object.assign({
            Response: 'Success',
            Message: 'Authentication accepted'
        }, responseData)));

        clientSocket.write(amiUtils.fromObject({
            Event: 'FullyBooted',
            Privilege: 'system,all',
            Status: 'Fully Booted'
        }));

        this._clients[clientSocket._key] = clientSocket;
        this._helloMessage && clientSocket.write(this._helloMessage + CRLF);
        this.emit('connection', this._getClientsCount());
        debugLog(`Client authorized [key:${clientSocket._key}]. Clients count: ${this._getClientsCount()}`);
    }

    /**
     *
     * @param action
     * @param clientSocket
     * @private
     */
    static _actionHandler(action, clientSocket){
        let actionName = null,
            responseData = action.ActionID ? {ActionID: action.ActionID} : {};

        if(action && action.Action){
            actionName = action.Action.toLowerCase();
        }

        if(!action || !actionName){
            clientSocket.write(amiUtils.fromObject({
                Response: 'Error',
                Message: 'Missing action in request'
            }));
            return;
        }

        if(actionName !== 'ping' && actionName !== 'logoff'){
            clientSocket.write(amiUtils.fromObject(Object.assign({
                Response: 'Error',
                Message: 'Invalid/unknown command'
            }, responseData)));
            return;
        }
        
        if(actionName === 'ping'){
            AmiTestServer._pingHandler(action, clientSocket);
            return;
        }

        if(actionName === 'logoff'){
            AmiTestServer._logoffHandler(action, clientSocket);
        }
    }

    /**
     *
     * @param action
     * @param clientSocket
     * @private
     */
    static _pingHandler(action, clientSocket){
        let responseData = action.ActionID ? {ActionID: action.ActionID} : {};

        clientSocket.write(amiUtils.fromObject(Object.assign({
            Response: 'Success',
            Ping: 'Pong',
            Timestamp: Date.now() / 1000 + '000'
        }, responseData)));
    }

    /**
     *
     * @param action
     * @param clientSocket
     * @private
     */
    static _logoffHandler(action, clientSocket){
        clearTimeout(clientSocket._authTimer);
        let responseData = action.ActionID ? {ActionID: action.ActionID} : {};

        clientSocket.end(amiUtils.fromObject(Object.assign({
            Response: 'Goodbye',
            Message: 'Thanks for all the fish.'
        }, responseData)));
    }
}

module.exports = AmiTestServer;