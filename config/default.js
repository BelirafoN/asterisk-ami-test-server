
"use strict";

let options = {

    events: {
        /*provider: require('asterisk-ami-event-provider'),
         options: {
             login: "tarifer",
             password: "tarifer",
             host: "192.168.0.253",
             port: 5038,
             events: true
         }*/

        provider: require('mongodb-event-provider'),
        options: {
            connection: 'mongodb://localhost:27017/ami',
            collection: 'events_09042016'
        }
    },

    server: {
        message: null,
        port: 3007,
        credentials: {
            login: 'tarifer',
            password: 'tarifer'
        },
        options: {
            authTimeout: 60 * 1000,
            maxConnections: 50
        }
    },

    system: {
        controlConnectionsCount: 1,
        acceptEvents: {
            /*AgentCalled: 1,
            AgentComplete: 1*/
        }
    }
};

if(options.system.acceptEvents !== null){
    options.system.acceptEvents = Object.keys(options.system.acceptEvents).reduce((result, curr) => {
        result[curr.toString().toLowerCase().trim()] = options.system.acceptEvents[curr];
        return result;
    }, {});
}

module.exports = options;