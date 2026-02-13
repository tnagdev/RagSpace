import { PrismaClient, PlanType, PlanInterval, UsageMetricType } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('🌱 Seeding database...');

    // Create FREE plan
    const freePlan = await prisma.plan.upsert({
        where: { type: PlanType.FREE },
        update: {},
        create: {
            name: 'Free',
            description: 'Perfect for trying out RagSpace',
            type: PlanType.FREE,
            interval: PlanInterval.MONTHLY,
            price: 0,
            priceUnit: 'USD',
            isActive: true,
            limits: {
                [UsageMetricType.CONVERSATIONS]: 10,
                [UsageMetricType.STORAGE]: 1073741824, // 1GB in bytes
                [UsageMetricType.FILE_CONVERSATIONS]: 5,
                [UsageMetricType.YOUTUBE_VIDEOS]: 3,
                [UsageMetricType.MAX_VIDEO_LENGTH]: 600, // 10 minutes in seconds
            },
            features: [
                'Basic video processing',
                'Text search',
                'Limited storage',
                'Community support',
            ],
        },
    });

    // Create BASIC plan
    const basicPlan = await prisma.plan.upsert({
        where: { type: PlanType.BASIC },
        update: {},
        create: {
            name: 'Basic',
            description: 'For individuals and small teams',
            type: PlanType.BASIC,
            interval: PlanInterval.MONTHLY,
            price: 19,
            priceUnit: 'USD',
            isActive: true,
            limits: {
                [UsageMetricType.CONVERSATIONS]: 100,
                [UsageMetricType.STORAGE]: 10737418240, // 10GB
                [UsageMetricType.FILE_CONVERSATIONS]: 50,
                [UsageMetricType.YOUTUBE_VIDEOS]: 25,
                [UsageMetricType.MAX_VIDEO_LENGTH]: 3600, // 60 minutes in seconds
            },
            features: [
                'Advanced video processing',
                'Semantic search',
                'Priority support',
                'Custom embeddings',
            ],
        },
    });

    // Create PRO plan
    const proPlan = await prisma.plan.upsert({
        where: { type: PlanType.PRO },
        update: {},
        create: {
            name: 'Pro',
            description: 'For power users and growing teams',
            type: PlanType.PRO,
            interval: PlanInterval.MONTHLY,
            price: 49,
            priceUnit: 'USD',
            isActive: true,
            limits: {
                [UsageMetricType.CONVERSATIONS]: 0, // unlimited
                [UsageMetricType.STORAGE]: 107374182400, // 100GB
                [UsageMetricType.FILE_CONVERSATIONS]: 0,
                [UsageMetricType.YOUTUBE_VIDEOS]: 0,
                [UsageMetricType.MAX_VIDEO_LENGTH]: 0, // unlimited
            },
            features: [
                'Unlimited conversations',
                'Unlimited videos',
                'Advanced analytics',
                'Priority processing',
                'Dedicated support',
                'Custom integrations',
                'Team collaboration',
            ],
        },
    });

    console.log('✅ Seeded plans:', {
        free: freePlan.id,
        basic: basicPlan.id,
        pro: proPlan.id,
    });
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
