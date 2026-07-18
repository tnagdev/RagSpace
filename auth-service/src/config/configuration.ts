export default () => ({
    rabbitmq: {
        url: process.env.RABBITMQ_URL,
        exchange: process.env.RABBITMQ_EXCHANGE,
        queue: process.env.RABBITMQ_QUEUE,
    },
    PAYMENT_SERVICE_URL: process.env.PAYMENT_SERVICE_URL
});
