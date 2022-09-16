import {
    v4 as uuidV4
} from 'uuid'
import {
    createRequire
} from "module";
import { GateWays, Domain, Utils, Types, objHasProp } from '@ikomida/shared-backend';
import { Channel, Message } from 'amqplib';
const require = createRequire(
    import.meta.url)
let {
    name
} = require("../package.json")
name = name
    .replace(/^(@\S+\/)?(svelte-)?(\S+)/, '$3')
    .replace(/^\w/, (m: string) => m.toUpperCase())
    .replace(/-\w/g, (m: string[]) => m[1].toUpperCase())

class SMSWorker {

    amqp?: Domain.RabbitMQ
    provider?: GateWays.OtimaTel
    logger: Utils.Logger

    constructor() {
        this.logger = Utils.Logger.getInstance(name)
    }

    async run() {
        try {
            this.provider = new GateWays.OtimaTel(this.logger)
            this.amqp = new Domain.RabbitMQ(this.logger)
            await this.amqp.listenToMessages(Domain.RabbitMQ.SMS_QUEUE, this.processMessages.bind(this))
        } catch (error: any) {
            this.logger.error(error)
        }
    }

    async processMessages(message: Message, channel: Channel) {
        try {
            this.logger.log(` [x] ${message.fields.routingKey}: message received: '${message.content.toString('utf8')}'`)
            const messageObject = JSON.parse(message.content.toString('utf8')) as Types.Interfaces.IAMQPPayload<Types.Interfaces.IAMQPPayloadObject>
            if (messageObject.method === 'send') {
                for (let i = 1; i < 4; i++) {
                    if (await this.sendSMS(messageObject?.object as Types.Interfaces.IAMQPPayloadObject)) {
                        break;
                    }
                    await Utils.System.sleep(i * 1000)
                }
            }
        } catch (error: any) {
            this.logger.error(error)
        } finally {
            channel.ack(message)
        }
    }

    async sendSMS(object: Types.Interfaces.IAMQPPayloadObject) {
        if (!this.validateObject(object)) {
            this.logger.error("object have not suficiente params")
            return false;
        }
        const id = uuidV4()
        this.logger.log(id, `+${object?.areaCode}${object.phone}, ${object.message?.message}`)
        const response = await this.provider?.send(Number(object.areaCode), Number(object.phone), object.message?.message, id)
        this.logger.log(response)
        return true;
    }

    validateObject(object: Types.Interfaces.IAMQPPayloadObject) {
        return objHasProp(["areaCode", "phone", "message"], object) && objHasProp(["message"], object?.message)
    }
}

await (new SMSWorker).run()