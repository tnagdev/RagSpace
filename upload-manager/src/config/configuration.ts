export default () => ({
    port: parseInt(process.env.PORT as string, 10) || 3002,
    nodeEnv: process.env.NODE_ENV || 'development',

    database: {
        url: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/upload_manager',
    },
    aws: {
        region: process.env.AWS_REGION || 'ap-south-1',
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        s3: {
            bucket: process.env.AWS_S3_BUCKET,
            endpoint: process.env.AWS_S3_ENDPOINT,
        },
    },

    rabbitmq: {
        url: process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672',
        exchange: process.env.RABBITMQ_EXCHANGE || 'file.events',
        queue: process.env.RABBITMQ_QUEUE || 'file.upload.queue',
    },

    upload: {
        maxFileSize: parseInt(process.env.MAX_FILE_SIZE as string, 10) || 524288000, // 500MB
        allowedFileTypes: process.env.ALLOWED_FILE_TYPES?.split(',') || [
            'image/*',
            'video/*',
            'audio/*',
            'application/pdf',
        ],
    },
});
