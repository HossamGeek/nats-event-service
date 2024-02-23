## Description

- The **NatsService** is a comprehensive service layer designed to facilitate interaction with the NATS messaging system, offering a robust set of functionalities tailored for efficient and flexible message handling across distributed systems. This service abstracts the complexities of direct NATS client interactions, providing a simplified and intuitive interface for various messaging patterns. Key features include:

    - setStream: plays a pivotal role in stream management, enabling the initialization or reconfiguration of a NATS JetStream to match precise operational requirements. This method is invoked automatically upon the creation of a NatsService instance, setting up the stream with a specified retention policy and customizable stream configurations.

    - **__updateStream__**: Updates the stream configuration for the specified stream.

    - **__streamInfo__**: Retrieves information about the stream.

    - **__deleteStream__**: delete the stream.

    - **__setConsumer__**: Sets up a subscription to consume messages from a specific subject, processing each message according to user-defined logic, suitable for event-driven architectures and continuous message processing tasks.

    - **__updateConsumer__**: Updates the consumer configuration for the specified consumer.

    - **__consumerInfo__**: Retrieves consumer information for a specific consumer.

    - **__getConsumer__**: Returns the Consumer configured for the specified stream having the specified name to able to consume messages.

    - **__deleteConsumer__**: delete a specific consumer.

    - **__publish__**: Allows for publishing messages to specified subjects within the NATS system, enabling one-to-many message dissemination for informing subscribers about specific events or states.

    - **__request__**: Initiates a request to a given subject and waits for a single response, embodying the request-reply mechanism ideal for direct communication and command execution scenarios.

    - **__subscribe__**: Establishes a subscription to listen for messages on a given subject, offering the flexibility to react to events and messages broadcasted through the NATS system.

- Designed for scalability and ease of use, NatsService encapsulates the essential operations needed for effective messaging in microservices architectures and distributed systems. Whether it's broadcasting notifications, executing commands through request-reply, or setting up complex conditional workflows, this service provides the necessary tools to build a reactive and resilient system with NATS as the messaging backbone.


## Installation

```bash
$ npm install  https://github.com/WILMA-Health/messaging-queue#main
```


## utils

- Create a new [utils] folder in ./src Server-App then create a new file named `nats.clientoptions.ts` and add the following code :

```bash
import { ClientOptions ,Transport} from '@nestjs/microservices';

export const NatsClientOptions: ClientOptions = {
    transport: Transport.NATS,
    options: {
         servers: "nats://ip:port", // Provide your NATS server URL
         queue: '$QueueName', 
    },
};
```
## REWRITE main.ts
- In Server-App :

``` bash
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { MicroserviceOptions } from '@nestjs/microservices';
import { NatsClientOptions } from './nats.clientoptions';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.connectMicroservice<MicroserviceOptions>(NatsClientOptions);
  await app.startAllMicroservices();
  await app.listen(process.pid, () => {
    //Creating ports by process id and listening on it and make this way in cluster ways
    console.log('listening on ' + process.pid);
  });
}
bootstrap();
```

- In Client-App :

``` bash
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(port);
}
bootstrap();
```

# EventApp

- Create a new file in Server-App named `app.event.ts` and add the following code :

``` bash 
import { Injectable, Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';

@Injectable()
@Controller('$generalName')
export class AppEvent {
  constructor() {}

  @MessagePattern("CREATEUSER")
  async onCreatingUser(@Payload() payload: any): Promise<any> {
    // business logic
    return { };
  }
}

```


# ServiceApp

- Create a new file in Client-App named `app.service.ts` and add the following code :


``` bash
import { Injectable } from '@nestjs/common';
import { NatsService } from 'nats-event-service';

@Injectable()
export class AppService {
  constructor(private readonly natsService: NatsService) {}
  async sendRequest(): Promise<any> {
    try {
      // For using request-reply
      const response = await this.natsService.request("CREATEUSER", {
        payload: {
          id: '1',
          name: 'test',
        },
      });

      // For using publish a message 
      this.natsService.publish("CREATEUSER", {
        payload: {
          id: '2',
          name: 'test',
        },
      });

      // For using publish-reply
      // Publish a message, after execute and acknowledge the message has been processed successfully will reply to another service.
      this.natsService.publish("CREATEUSER", {
        payload: {
          id: '3',
          name: 'test',
        },
        reply:"$ServiceName"
      });

      return JSON.parse(response.data.toString());
    } catch (error) {
      console.log('error: ', error);
    }
  }
}

```
# REWRITE app.module.ts

- General :

``` bash
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ClientNats, ClientsModule, Transport } from '@nestjs/microservices';
import { NatsService } from 'nats-event-service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ClientsModule.register([
      {
        name: "$ClientName",
        transport: Transport.NATS,
        options: {
          servers: ["nats://ip:port"], // Provide your NATS server URL
          debug: false,
        },
      },
    ]),
  ],
  controllers: [
      AppController
      AppEvent // if Server-App
  ],
  providers: [
    AppService,
    ClientNats,
    {
      provide: NatsService,
      useFactory: (eventEmitter: ClientNats) => {
        return new NatsService(eventEmitter, "$ServiceName");
      },
      inject: ["$ClientName"],
    },
  ],
})

export class AppModule {}
```

- In Server-App :

``` bash

export class AppModule implements OnModuleInit {
  constructor(private readonly natsService: NatsService) {}
  public async onModuleInit(): Promise<void> {
    try {
      await this.natsService.setStream();
      await this.natsService.setConsumer("$UniqueConsumer")
      await this.natsService.subscribe("$UniqueConsumer");
    } catch (error) {
      // Catch any errors that may occur during initialization
      console.log('Error initializing module', error);
    }
  }
}

```


## Running the app

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```


## License

NatsService is [MIT licensed](LICENSE).
