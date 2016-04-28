/**
 * Developer: BelirafoN
 * Date: 13.04.2016
 * Time: 15:51
 */

"use strict";

const TestServer = require('./DevServer');

module.exports = {
    TestServer,
    createServer(message, credentials, options){
        return new TestServer(...arguments);
    }
};