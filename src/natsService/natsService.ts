import { Injectable } from '@nestjs/common';
import { ClientNats } from '@nestjs/microservices';
import {
  AckPolicy,
  Consumer,
  ConsumerConfig,
  ConsumerInfo,
  JetStreamClient,
  JetStreamManager,
  JsMsg,
  Msg,
  NatsConnection,
  RetentionPolicy,
  StreamAPI,
  StreamConfig,
  StreamInfo,
  StringCodec,
  createInbox,
} from 'nats';
import Message from './message.interface';

@Injectable()
export default class NatsEventService {
  private natsClientConnect: Promise<any>;
  private streamName: string;
  private wildCard: boolean = false;
  private logger: boolean = false;
  private loggerStream: string = 'logger';
  constructor(
    public readonly natsClient: ClientNats,
    _streamName: string,
    _wildCard?: boolean,
  ) {
    this.streamName = _streamName;
    this.wildCard = _wildCard;
    this.setStream(); // Set the stream with Workqueue retention policy
  }
  /**
   * Retrieves and returns the connection to the NatsClient.
   *
   * @return {Promise<any>} The connection to the NatsClient.
   */
  private async getNatsClientConnect(): Promise<NatsConnection> {
    this.natsClientConnect = await this.natsClient.connect();
    return this.natsClientConnect;
  }
  /**
   * Retrieves the JetStreamManager asynchronously.
   *
   * @return {Promise<JetStreamManager>} A promise that resolves to the JetStreamManager.
   */
  private async getJetStreamManager(): Promise<JetStreamManager> {
    return (await this.getNatsClientConnect()).jetstreamManager();
  }
  /**
   * Retrieves the StreamAPI by asynchronously getting the JetStreamManager and accessing the streams property.
   *
   * @return {Promise<StreamAPI>} A promise that resolves to the StreamAPI.
   */
  private async getJetStreamClient(): Promise<JetStreamClient> {
    return (await this.getNatsClientConnect()).jetstream();
  }
  /**
   * Retrieves the StreamAPI by calling the getJetStreamManager method and accessing the streams property.
   *
   * @return {Promise<StreamAPI>} A Promise that resolves to the StreamAPI object.
   */
  private async getStreamApi(): Promise<StreamAPI> {
    return (await this.getJetStreamManager()).streams;
  }
  /**
   * Asynchronously adds a general stream.
   *
   * @param {StreamConfig} streamConfig - the configuration for the stream to be added
   * @return {Promise<StreamInfo>} a promise that resolves to the information of the added stream
   */
  private async addGeneralStream(
    streamConfig: StreamConfig,
  ): Promise<StreamInfo> {
    try {
      const getModel = await (await this.getStreamApi()).info(this.streamName);
      if (getModel.config.name) return getModel;
    } catch (error) {
      const addModel = await (
        await this.getStreamApi()
      ).add({
        ...streamConfig,
      } as Partial<StreamConfig>);
      if (addModel.config.name) return addModel;
    }
  }

  /**
   * Asynchronously sets the logger with the given stream configuration.
   *
   * @param {StreamConfig} streamConfig - optional stream configuration
   * @return {Promise<StreamInfo>} a promise that resolves to the stream information
   */
  async setLogger(streamConfig?: StreamConfig): Promise<StreamInfo> {
    try {
      this.logger = true;
      return await this.addGeneralStream({
        ...streamConfig,
        name: this.loggerStream,
        subjects: [`${this.loggerStream}.>`],
      });
    } catch (err) {
      return err;
    }
  }
  /**
   * Asynchronously logs a message to the specified subject.
   *
   * @param {string} subject - the subject of the log message
   * @param {Message} message - the message to be logged
   * @return {Promise<void>} a Promise that resolves when the message is logged
   */
  async fireLog(subject: string, log: object): Promise<void> {
    (await this.getNatsClientConnect()).publish(
      `${this.loggerStream}.${this.streamName}.${subject}`,
      new TextEncoder().encode(JSON.stringify(log)),
    );
  }

  /**
   * Sets the stream with the specified retention policy and stream configuration.
   *
   * @param {RetentionPolicy} retention - The retention policy for the stream.
   * @param {StreamConfig} streamConfig - The configuration for the stream.
   * @return {Promise<boolean>} A promise that resolves to true if the stream was set successfully, false otherwise.
   */

  async setStream(
    retention: RetentionPolicy = RetentionPolicy.Workqueue,
    streamConfig?: StreamConfig,
  ): Promise<StreamInfo> {
    return await this.addGeneralStream({
      ...streamConfig,
      retention,
      name: this.streamName,
      no_ack: true,
      subjects: [`${this.streamName}.>`],
    });
  }
  /**
   * Update the stream with the given stream configuration.
   *
   * @param {StreamConfig} streamConfig - the configuration for the stream update
   * @return {Promise<boolean>} a Promise that resolves to a boolean indicating the success of the stream update
   */
  async updateStream(streamConfig: StreamConfig): Promise<StreamInfo> {
    try {
      const getModel = await (await this.getStreamApi()).info(this.streamName);
      if (getModel.config.name) {
        const updateModel = await (
          await this.getStreamApi()
        ).update(this.streamName, {
          ...streamConfig,
          subjects: [`${this.streamName}.>`],
        } as Partial<StreamConfig>);
        if (updateModel.config.name) return updateModel;
      }
      return null;
    } catch (error) {
      return error;
    }
  }

  /**
   * Retrieves information about the stream.
   *
   * @return {Promise<StreamInfo>} the retrieved stream information
   */
  async streamInfo(): Promise<StreamInfo> {
    return await (await this.getStreamApi()).info(this.streamName);
  }

  /**
   * Delete the stream.
   *
   * @return {Promise<boolean>} true if the stream is successfully deleted, false otherwise
   */
  async deleteStream(): Promise<boolean> {
    return await (await this.getStreamApi()).delete(this.streamName);
  }
  /**
   * Publishes a message to the specified subject in the JetStream stream.
   *
   * @param {string} subject - The subject to which the message will be published.
   * @param {Message} message - The message to be published.
   * @return {Promise<void>} - A promise that resolves with the PubAck object.
   */
  async publish(subject: string, message: Message): Promise<void> {
    (await this.getNatsClientConnect()).publish(
      `${this.streamName}.${subject}`,
      new TextEncoder().encode(JSON.stringify(message)),
    );
  }

  /**
   * Asynchronously publishes a message to a subject using JetStream.
   *
   * @param {string} subject - the subject to publish the message to
   * @param {Message} message - the message to be published
   * @return {Promise<PubAck>} a promise that resolves with the acknowledgment from the JetStream server
   */
  private async replay(subject: string, message: Message): Promise<Msg> {
    return (await this.getNatsClientConnect()).request(
      subject,
      new TextEncoder().encode(JSON.stringify(message)),
      { reply: subject, noMux: true, timeout: 5000 },
    );
  }

  /**
   * An asynchronous function that sends a request with a given subject and message, and returns a promise that resolves to a Msg.
   *
   * @param {string} subject - the subject of the request
   * @param {Message} message - the message to be sent
   * @return {Promise<Msg>} a promise that resolves to a Msg
   */
  async request(subject: string, message: Message): Promise<Msg> {
    message.reply_inbox = createInbox();
    return (await this.getNatsClientConnect()).request(
      `${this.streamName}.${subject}`,
      Buffer.from(JSON.stringify(message)),
      { reply: message.reply_inbox, noMux: true, timeout: 5000 },
    );
  }
  /**
   * Set consumer with the given name and config for the stream then get it.
   *
   * @param {string} consumerName - the name of the consumer
   * @param {ConsumerConfig} [consumeConfig] - optional configuration for consuming
   * @return {Promise<ConsumerInfo>} a promise that resolves with the consumer
   */
  async setConsumer(
    consumerName: string,
    ack_policy: AckPolicy = AckPolicy.Explicit,
    consumeConfig?: ConsumerConfig,
  ): Promise<ConsumerInfo> {
    return await (
      await this.getJetStreamManager()
    ).consumers.add(this.streamName, {
      durable_name: consumerName,
      ack_policy,
      ...consumeConfig,
    } as Partial<ConsumerConfig>);
  }
  /**
   * Update the specified consumer with the given configuration then get it.
   *
   * @param {string} consumerName - the name of the consumer to update
   * @param {ConsumerConfig} consumeConfig - the configuration to update the consumer with
   * @return {Promise<ConsumerInfo>} the updated consumer
   */

  async updateConsumer(
    consumerName: string,
    consumeConfig: ConsumerConfig,
  ): Promise<ConsumerInfo> {
    return await (
      await this.getJetStreamManager()
    ).consumers.update(this.streamName, consumerName, {
      ...consumeConfig,
    } as Partial<ConsumerConfig>);
  }

  /**
   * Asynchronously consumes information for a specific consumer.
   *
   * @param {string} consumerName - the name of the consumer
   * @return {Promise<ConsumerInfo>} the consumer information
   */
  async consumerInfo(consumerName: string): Promise<ConsumerInfo> {
    return await (
      await this.getJetStreamManager()
    ).consumers.info(this.streamName, consumerName);
  }

  /**
   * Returns the Consumer configured for the specified stream having the specified name.
   *
   * @param {string} consumerName - the name of the consumer
   * @return {Promise<Consumer>} the consumer information
   */
  async getConsumer(consumerName: string): Promise<Consumer> {
    return await (
      await this.getJetStreamClient()
    ).consumers.get(this.streamName, consumerName);
  }

  /**
   * Delete a consumer with the given name.
   *
   * @param {string} consumerName - the name of the consumer to delete
   * @return {Promise<boolean>} a promise that resolves to a boolean indicating the success of the deletion
   */
  async deleteConsumer(consumerName: string): Promise<boolean> {
    return await (
      await this.getJetStreamManager()
    ).consumers.delete(this.streamName, consumerName);
  }
  /**
   * Returns a string representing a pattern based on the given JsMsg and wildCard flag.
   *
   * @param {JsMsg} msg - the JsMsg object
   * @return {string} the pattern string
   */
  private getPattern(msg: JsMsg): string {
    const pattern: Array<string> = msg.subject.split('.').slice(1);
    return this.wildCard ? pattern.join('.') : pattern.join('');
  }
  /**
   * Get the payload from the message data and parse it to json format
   *
   * @param {JsMsg} msg - the message data
   * @return {Message} the parsed payload message
   */
  private getMsgFromPayload(msg: JsMsg): Message {
    return JSON.parse(StringCodec().decode(msg.data)); // Get the payload from the message data and parse it to json format
  }
  /**
   * Send an event then Acknowledge the message has been processed successfully and reply if there is a reply
   * or Terminate the message with the error when subscribed.
   *
   * @param {JsMsg} msg - the event message to reply to
   * @return {void}
   */
  private sendEventWithConditionalReply(msg: JsMsg): void {
    const pattern: string = this.getPattern(msg);
    const { payload, reply, reply_inbox }: Message =
      this.getMsgFromPayload(msg);
    this.natsClient.send(pattern, payload).subscribe({
      // Subscribe to the pattern
      next: async (_payload: object) => {
        // Execute the callback function if there are no errors
        if (reply_inbox)
          // If there is a reply inbox
          await this.replay(reply_inbox, {
            payload: _payload,
          } as Message); // Send the message to the reply inbox
        msg.ack(); // Acknowledge the message has been processed successfully
        if (reply)
          // If there is a reply
          await this.publish(reply, {
            payload: _payload,
          } as Message); // Send the message to the reply
      },
      error: (e) => {
        // Handle the error if there is an error
        msg.term(e); //  Terminate the message with the error
      },
    });
  }
  /**
   * Subscribes to the consumer queue and executes a callback function when a message is received.
   *
   * @param {string} consumerName - the name of the consumer
   * @return {Promise<void>} This function returns a Promise that resolves to void.
   */
  async subscribe(consumerName: string): Promise<void> {
    (await this.getConsumer(consumerName)).consume({
      //  Consume the consumer queue
      /**
       * Executes a callback function.
       *
       * @param {JsMsg} msg - the message object
       * @return {void} This function does not return anything.
       */
      callback: (msg: JsMsg): void => {
        this.sendEventWithConditionalReply(msg); // Reply to the event
      },
    });
  }
}
