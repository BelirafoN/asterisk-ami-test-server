/**
 * Developer: BelirafoN
 * Date: 04.05.2016
 * Time: 12:45
 */

"use strict";

const AmiTestServer = require('../lib/AmiTestServer');
const net = require('net');
const CRLF = '\r\n';

describe('AmiTestServer internal functionality', function() {
    this.timeout(5000);

    let server = null,
        client = null,
        optionsDefault = null,
        defaultPort = 5038;

    beforeEach(() => {
        optionsDefault = {
            maxConnections: 50,
            authTimeout: 30000,
            credentials: {
                username: 'test',
                secret: 'test'
            }
        };
        server = new AmiTestServer(optionsDefault);
    });

    afterEach(() => {
        if(server instanceof AmiTestServer){
            server && server.close();
        }
        if(client && client instanceof net.Socket){
            client.destroy();
            client.removeAllListeners();
        }
        server = null;
        client = null;
    });

    it(`Listening on port ${defaultPort}`, done => {
        server.listen({port: defaultPort}).then(() => {
            client = net.connect(defaultPort, done);
        });
    });
    
    it('Auth disconnect by timeout', done => {
        optionsDefault.authTimeout = 1000;
        server = new AmiTestServer(optionsDefault);
        server.listen(defaultPort).then(() => {
            let isConnected = false;
            client = net.connect({port: defaultPort}, () => {
                isConnected = true;
            });
            client.on('close', () => {
                isConnected && done();
            });
        });
    });

    it('Auth with correct credentials', done => {
        server.listen(defaultPort).then(() => {
            client = net.connect({port: defaultPort}, () => {
                client
                    .on('data', chunk => {
                        if(/Response: Success/.test(chunk.toString())){
                            done();
                        }
                    })
                    .write([
                        'Action: Login',
                        `Username: ${optionsDefault.credentials.username}`,
                        `Secret: ${optionsDefault.credentials.secret}`
                    ].join(CRLF) + CRLF.repeat(2));
            });
        });
    });

    it('Auth with incorrect credentials', done => {
        server.listen(defaultPort).then(() => {
            client = net.connect({port: defaultPort}, () => {
                client
                    .on('data', chunk => {
                        if(/Response: Error/.test(chunk.toString())){
                            done();
                        }
                    })
                    .write([
                        'Action: Login',
                        `Username: username`,
                        `Secret: secret`
                    ].join(CRLF) + CRLF.repeat(2));
            });
        });
    })
    
});