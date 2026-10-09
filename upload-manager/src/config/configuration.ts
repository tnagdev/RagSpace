export default () => ({
    aws: {
        region: process.env.AWS_REGION,
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        s3: {
            bucket: process.env.AWS_S3_BUCKET,
            endpoint: process.env.AWS_S3_ENDPOINT,
            publicEndpoint: process.env.AWS_S3_PUBLIC_ENDPOINT,
        },
    },
    upload: {
        maxFileSize: Number(process.env.MAX_FILE_SIZE) || 1024 * 1024 * 1024,
    },
});
