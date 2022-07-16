#!/usr/bin/env node

import {
    RabbitMQ,
    MariaDB,
    GoogleAdmin,
    objHasProp,
    GateWays,
    Logger
} from 'ikomida-shared';
import {
    v4 as uuidV4
} from 'uuid'
import {
    createRequire
} from "module";
const require = createRequire(
    import.meta.url);
let {
    name
} = require("../package.json");
name = name
    .replace(/^(@\S+\/)?(svelte-)?(\S+)/, '$3')
    .replace(/^\w/, m => m.toUpperCase())
    .replace(/-\w/g, m => m[1].toUpperCase());
const logger = Logger.getInstance(name, process.env?.ENV !== 'PROD');

class SMSWorker {

    amqp;
    provider;

    //TODO: -- report errors
    async run() {
        try {
            this.provider = new GateWays.OtimaTel(name);
            this.amqp = new RabbitMQ(logger);
            await this.amqp.listenToMessages(RabbitMQ.SMS_SEVERITY, this.processMessages.bind(this));
        } catch (error) {
            console.error(error);
        }
    }

    async processMessages(message, channel) {
        try {
            console.log(" [x] %s: message received: '%s'", message.fields.routingKey, message.content.toString('utf8'));
            const messageObject = JSON.parse(message.content.toString('utf8'));
            if (messageObject.method === 'send') {
                for (let i = 1; i < 4; i++) {
                    if (this.sendSMS(messageObject?.object)) {
                        break;
                    }
                    await this.sleep(i * 1000);
                }
            }
        } catch (error) {
            console.error(error);
        } finally {
            channel.ack(message);
        }
    }

    async sendSMS(object) {
        if (!this.validateObject(object)) {
            console.error("object have not suficiente params");
            return false;
        }
        const id = uuidV4();
        console.log(id, `+${object?.areaCode}${object?.phone}, ${object?.message?.message}`);
        const response = await this.provider.send(object?.areaCode, object?.phone, object?.message?.message, id);
        console.log(response)
        return true;
    }

    async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    validateObject(object) {
        return objHasProp(["areaCode", "phone", "message"], object) && objHasProp(["message"], object?.message);
    }
}

await (new SMSWorker).run();