#!/usr/bin/env node

import {
    RabbitMQ,
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
    import.meta.url)
let {
    name
} = require("../package.json")
name = name
    .replace(/^(@\S+\/)?(svelte-)?(\S+)/, '$3')
    .replace(/^\w/, m => m.toUpperCase())
    .replace(/-\w/g, m => m[1].toUpperCase())

class SMSWorker {

    amqp
    provider
    logger

    constructor(){
        this.logger = Logger.getInstance(name, process.env?.ENV !== 'PROD')
    }

    async run() {
        try {
            this.provider = new GateWays.OtimaTel(this.logger)
            this.amqp = new RabbitMQ(this.logger)
            await this.amqp.listenToMessages(RabbitMQ.SMS_SEVERITY, this.processMessages.bind(this))
        } catch (error) {
            this.logger.error(error)
        }
    }

    async processMessages(message, channel) {
        try {
            this.logger.log(` [x] ${message.fields.routingKey}: message received: '${message.content.toString('utf8')}'`)
            const messageObject = JSON.parse(message.content.toString('utf8'))
            if (messageObject.method === 'send') {
                for (let i = 1; i < 4; i++) {
                    if (await this.sendSMS(messageObject?.object)) {
                        break;
                    }
                    await this.sleep(i * 1000)
                }
            }
        } catch (error) {
            this.logger.error(error)
        } finally {
            channel.ack(message)
        }
    }

    async sendSMS(object) {
        if (!this.validateObject(object)) {
            this.logger.error("object have not suficiente params")
            return false;
        }
        const id = uuidV4()
        this.logger.log(id, `+${object?.areaCode}${object?.phone}, ${object?.message?.message}`)
        const response = await this.provider.send(object?.areaCode, object?.phone, object?.message?.message, id)
        this.logger.log(response)
        return true;
    }

    async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms))
    }

    validateObject(object) {
        return objHasProp(["areaCode", "phone", "message"], object) && objHasProp(["message"], object?.message)
    }
}

await (new SMSWorker).run()