# Asterisk AMI Test Server

[![Build Status](https://travis-ci.org/BelirafoN/asterisk-ami-test-server.svg?branch=master)](https://travis-ci.org/BelirafoN/asterisk-ami-test-server)
[![Coverage Status](https://coveralls.io/repos/BelirafoN/asterisk-ami-test-server/badge.svg)](https://coveralls.io/r/BelirafoN/asterisk-ami-test-server)
[![Code Climate](https://codeclimate.com/github/BelirafoN/asterisk-ami-test-server/badges/gpa.svg)](https://codeclimate.com/github/BelirafoN/asterisk-ami-test-server)
[![npm version](https://badge.fury.io/js/asterisk-ami-test-server.svg)](https://badge.fury.io/js/asterisk-ami-test-server)

## Install 

```bash
$ npm i asterisk-ami-test-server
```

## NodeJS versions 

support `>=4.0.0`

## Usage 

Server

```javascript
const AmiSurrogateServer = require('asterisk-ami-test-server');
const server = new AmiSurrogateServer({
    maxConnections: 50,
    authTimeout: 30000,
    credentials: {
        username: 'test',
        secret: 'test'
    }
});

server
    .on('listening', () => console.log('listening'))
    .on('connection', authClientsCount => console.log(`authClientsCount: ${authClientsCount}`))
    .on('error', error => console.log(error))
    .on('close', () => console.log('close'))
    .listen(5038);
    
// Asterisk AMI Test Server listening on 5038 port
```

Client 

```javascript
const CRLF = '\r\n';
const net = required('net');
const client = net.connect({port: 5038}, () => {
    client
        .once('data', chunk => {
            console.log(chunk.toString());
            client.destroy();
        })
        .write([
            'Action: Login',
            'Username: test',
            'Secret: test'
        ].join(CRLF) + CRLF.repeat(2));
});
```

### Methods 

* `.broadcast(data)` - sends `data` package to all authontificated clients;
* `.listen(port)` - start listening on `port`;
* `.close()` - close all client's connections;
* `.getAuthClients()` - get array of all authontificated clients;
* `.getUnAuthClients()` - get array of all unauthontificated clients;
* `.getClients()` - get array of all clients;

## Tests 

Tests require [Mocha](https://mochajs.org/). 

```bash 
mocha ./tests
``` 

or with `npm` 

```bash
npm test 
```

Test coverage with [Istanbul](https://gotwarlost.github.io/istanbul/) 

```bash
npm run coverage
```

## License 

Licensed under the MIT License