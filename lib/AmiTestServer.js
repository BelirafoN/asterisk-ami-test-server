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
                silent: false,
                maxConnections: 50,
                authTimeout: 30000,
                credentials: {}
            }, options || {}),
            _server: net.createServer(),
            _authClients: {},
            _unAuthClients: {}
        });
    }

    /**
     *
     * @param data
     * @returns {AmiTestServer}
     */
    broadcast(data){
        Object.keys(this._authClients).forEach(key => this._authClients[key].write(data));
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
                    if(!this._options.silent){
                        console.log(`Asterisk AMI Test Server listening on ${this._server.address().port} port`);
                    }

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
        this.getClients().forEach(client => {
            if(client instanceof net.Socket){
                client.end();
            }
        });
        this._authClients = {};
        this._unAuthClients = {};
        if(this._server){
            this._server.close();
            this._server.removeAllListeners();
        }
        this.emit('close');
        return this;
    }

    /**
     *
     * @returns {*}
     */
    getAuthClients(){
        return AmiTestServer.objectValues(this._authClients);
    }

    /**
     *
     * @returns {*}
     */
    getUnAuthClients(){
        return AmiTestServer.objectValues(this._unAuthClients);
    }

    /**
     *
     * @returns {Array.<T>}
     */
    getClients(){
        return [].concat(this.getAuthClients(), this.getUnAuthClients());
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
     * @returns {boolean}
     * @private
     */
    _isAllowConnection(){
        return !(this._options.maxConnections === 0 || this.getClients().length >= this._options.maxConnections);
    }

    /**
     *
     * @param clientSocket
     * @private
     */
    _connectionHandler(clientSocket){
        if(!this._isAllowConnection()){
            debugLog(`Connection rejected. Clients count: ${Object.keys(this._authClients).length}, maxConnections: ${this._options.maxConnections}`);
            clientSocket.end();
            return;
        }

        Object.assign(clientSocket, {
            _key: shortId.generate(),
            _eventStream: new amiDataStream(),
            _authTimer: null
        });

        this._unAuthClients[clientSocket._key] = clientSocket;

        clientSocket
            .on('close', () => {
                if(clientSocket._eventStream){
                    clientSocket.unpipe(clientSocket._eventStream);
                }
                delete this._authClients[clientSocket._key];
                delete this._unAuthClients[clientSocket._key];
                debugLog(`Client disconnected [key:${clientSocket._key}].`);
            })
            .on('error', error => {
                if(clientSocket._eventStream){
                    clientSocket.unpipe(clientSocket._eventStream);
                }
                delete this._authClients[clientSocket._key];
                debugLog(`Client connection error [key:${clientSocket._key}]: ${error.message}.`);
            })
            .pipe(clientSocket._eventStream);

        clientSocket._authTimer = setTimeout(clientSocket => {
            clientSocket.unpipe(clientSocket._eventStream);
            clientSocket.end();
            delete this._unAuthClients[clientSocket._key];
        }, this._options.authTimeout, clientSocket);


        clientSocket._eventStream.on('amiAction', action => this._amiActionHandler(action, clientSocket));
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

        if(actionName !== 'login' || !this._isAttempt(action.Username, action.Secret)){
            clearTimeout(clientSocket._authTimer);
            AmiTestServer.sendToClient(clientSocket, Object.assign({
                Response: 'Error',
                Message: 'Authentication failed'
            }, responseData));
            return;
        }

        clearTimeout(clientSocket._authTimer);

        AmiTestServer.sendToClient(clientSocket, Object.assign({
            Response: 'Success',
            Message: 'Authentication accepted'
        }, responseData));

        AmiTestServer.sendToClient(clientSocket, {
            Event: 'FullyBooted',
            Privilege: 'system,all',
            Status: 'Fully Booted'
        });

        this._authClients[clientSocket._key] = clientSocket;
        delete this._unAuthClients[clientSocket._key];
        if(this._helloMessage){
            clientSocket.write(this._helloMessage + CRLF);
        }

        let authClientsCount = Object.keys(this._authClients).length;
        this.emit('connection', authClientsCount);
        debugLog(`Client authorized [key:${clientSocket._key}]. Clients count: ${authClientsCount}`);
    }

    /**
     *
     * @param action
     * @param clientSocket
     * @private
     */
    _amiActionHandler(action, clientSocket){
        let actionName = null,
            responseData = action.ActionID ? {ActionID: action.ActionID} : {};

        if(action && action.Action){
            actionName = action.Action.toLowerCase();
        }

        if(!action || !actionName){
            AmiTestServer.sendToClient(clientSocket, Object.assign({
                Response: 'Error',
                Message: 'Missing action in request'
            }, responseData));
            return;
        }

        if(actionName === 'ping'){
            AmiTestServer.sendToClient(clientSocket, Object.assign({
                Response: 'Success',
                Ping: 'Pong',
                Timestamp: Date.now() / 1000 + '000'
            }, action.ActionID ? {ActionID: action.ActionID} : {}));
            return;
        }

        if(actionName !== 'login' && actionName !== 'logoff'){
            AmiTestServer.sendToClient(clientSocket, Object.assign({
                Response: 'Error',
                Message: 'Invalid/unknown command'
            }, responseData));
            return;
        }

        if(this._authClients[clientSocket._key]){

            if(actionName === 'logoff'){
                clearTimeout(clientSocket._authTimer);
                AmiTestServer.sendToClient(clientSocket, Object.assign({
                    Response: 'Goodbye',
                    Message: 'Thanks for all the fish.'
                }, action.ActionID ? {ActionID: action.ActionID} : {}));
            }

        }else{
            this._authHandler(action, clientSocket);
        }
    }

    /**
     *
     * @param clients
     * @returns {*}
     */
    static objectValues(clients){
        return Object.keys(clients).reduce((clientsArr, key) => {
            clientsArr.push(clients[key]);
            return clientsArr;
        }, []);
    }

    /**
     *
     * @param clientSocket
     * @param message
     */
    static sendToClient(clientSocket, message){
        clientSocket.write(amiUtils.fromObject(message));
    }

}

module.exports = AmiTestServer;