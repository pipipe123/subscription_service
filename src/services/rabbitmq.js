const amqplib = require('amqplib');
const config = require('../config');

let channel = null;

const connect = async () => {
  try {
    const connection = await amqplib.connect(config.rabbitmqUrl);
    channel = await connection.createChannel();

    connection.on('error', (err) => {
      console.error('RabbitMQ connection error:', err.message);
      channel = null;
    });

    connection.on('close', () => {
      console.warn('RabbitMQ connection closed, will reconnect on next publish');
      channel = null;
    });

    console.log('Connected to RabbitMQ');
  } catch (err) {
    console.error('Failed to connect to RabbitMQ:', err.message);
    channel = null;
  }
};

const publishEvent = async (queue, payload) => {
  try {
    if (!channel) await connect();
    if (!channel) return;

    await channel.assertQueue(queue, { durable: true });
    channel.sendToQueue(queue, Buffer.from(JSON.stringify(payload)), {
      persistent: true,
    });
  } catch (err) {
    console.error(`Failed to publish to ${queue}:`, err.message);
  }
};

const consumeEvent = async (queue, handler) => {
  try {
    if (!channel) await connect();
    if (!channel) return;

    await channel.assertQueue(queue, { durable: true });
    channel.consume(queue, async (msg) => {
      if (msg) {
        try {
          const payload = JSON.parse(msg.content.toString());
          await handler(payload);
          channel.ack(msg);
        } catch (err) {
          console.error(`Error processing message from ${queue}:`, err.message);
          channel.nack(msg, false, false);
        }
      }
    });
    console.log(`Consuming events from queue: ${queue}`);
  } catch (err) {
    console.error(`Failed to consume from ${queue}:`, err.message);
  }
};

module.exports = { connect, publishEvent, consumeEvent };
