export default () => ({
    port: parseInt(process.env.PORT as string, 10) || 3002,
    nodeEnv: process.env.NODE_ENV,
    database: {
        url: process.env.DATABASE_URL,
    },
    aws: {
        region: process.env.AWS_REGION,
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        s3: {
            bucket: process.env.AWS_S3_BUCKET,
            endpoint: process.env.AWS_S3_ENDPOINT,
        },
    },
    rabbitmq: {
        url: process.env.RABBITMQ_URL,
        exchange: process.env.RABBITMQ_EXCHANGE,
        queue: process.env.RABBITMQ_QUEUE,
    },
    upload: {
        maxFileSize: parseInt(process.env.MAX_FILE_SIZE as string, 10),
        allowedFileTypes: process.env.ALLOWED_FILE_TYPES?.split(',')
    },
});
