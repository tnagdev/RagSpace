import { PrismaClient, PlanType, PlanInterval, UsageMetricType } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import {
    lemonSqueezySetup,
    listProducts,
    listVariants,
} from '@lemonsqueezy/lemonsqueezy.js';

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// Initialize LemonSqueezy
const LEMON_SQUEEZY_API_KEY = process.env.LEMON_SQUEEZY_API_KEY;
const LEMON_SQUEEZY_STORE_ID = process.env.LEMON_SQUEEZY_STORE_ID;

if (LEMON_SQUEEZY_API_KEY) {
    lemonSqueezySetup({ apiKey: LEMON_SQUEEZY_API_KEY });
}

interface PlanDefinition {
    name: string;
    description: string;
    type: PlanType;
    interval: PlanInterval;
    price: number;
    limits: Record<string, number>;
    features: string[];
    syncWithLemonSqueezy: boolean; // Whether to link with LemonSqueezy
}

const planDefinitions: PlanDefinition[] = [
    {
        name: 'Free',
        description: 'Perfect for trying out RagSpace',
        type: PlanType.FREE,
        interval: PlanInterval.MONTHLY,
        price: 0,
        limits: {
            [UsageMetricType.CONVERSATIONS]: 10,
            [UsageMetricType.STORAGE]: 1073741824, // 1GB in bytes
            [UsageMetricType.FILE_CONVERSATIONS]: 5,
            [UsageMetricType.YOUTUBE_VIDEOS]: 3,
            [UsageMetricType.MAX_VIDEO_LENGTH]: 600, // 10 minutes in seconds
            [UsageMetricType.MAX_AUDIO_DURATION]: 3600, // 60 minutes in seconds
        },
        features: [
            '10 AI conversations per month',
            '1 GB cloud storage',
            '5 file chats per month',
            '3 YouTube videos per month',
            'Videos up to 10 minutes',
            'Scene detection & search',
        ],
        syncWithLemonSqueezy: true, // FREE plan stays local only
    },
    {
        name: 'Basic',
        description: 'For individuals and small teams',
        type: PlanType.BASIC,
        interval: PlanInterval.MONTHLY,
        price: 19,
        limits: {
            [UsageMetricType.CONVERSATIONS]: 100,
            [UsageMetricType.STORAGE]: 10737418240, // 10GB
            [UsageMetricType.FILE_CONVERSATIONS]: 50,
            [UsageMetricType.YOUTUBE_VIDEOS]: 25,
            [UsageMetricType.MAX_VIDEO_LENGTH]: 3600, // 60 minutes
            [UsageMetricType.MAX_AUDIO_DURATION]: 7200, // 120 minutes
        },
        features: [
            '100 AI conversations per month',
            '10 GB cloud storage',
            '50 file chats per month',
            '25 YouTube videos per month',
            'Videos up to 60 minutes',
            'Advanced semantic search',
            'Priority processing',
        ],
        syncWithLemonSqueezy: true,
    },
    {
        name: 'Pro',
        description: 'For power users and growing teams',
        type: PlanType.PRO,
        interval: PlanInterval.MONTHLY,
        price: 49,
        limits: {
            [UsageMetricType.CONVERSATIONS]: 0, // unlimited
            [UsageMetricType.STORAGE]: 107374182400, // 100GB
            [UsageMetricType.FILE_CONVERSATIONS]: 0,
            [UsageMetricType.YOUTUBE_VIDEOS]: 0,
            [UsageMetricType.MAX_VIDEO_LENGTH]: 0, // unlimited
            [UsageMetricType.MAX_AUDIO_DURATION]: 0, // unlimited
        },
        features: [
            'Unlimited AI conversations',
            '100 GB cloud storage',
            'Unlimited file chats',
            'Unlimited YouTube videos',
            'No video length limits'
        ],
        syncWithLemonSqueezy: true,
    },
];

async function findLemonSqueezyProduct(planName: string) {
    if (!LEMON_SQUEEZY_API_KEY || !LEMON_SQUEEZY_STORE_ID) {
        return null;
    }

    try {
        const products = await listProducts({
            filter: { storeId: LEMON_SQUEEZY_STORE_ID },
        });

        // Find product by name (case-insensitive)
        const product = products.data?.data?.find(
            (p) => p.attributes.name.toLowerCase() === planName.toLowerCase()
        );

        if (!product) {
            return null;
        }

        // Get variants for this product
        const variants = await listVariants({
            filter: { productId: product.id },
        });

        // Find monthly variant (or first available)
        const variant = variants.data?.data?.find(
            (v) => v.attributes.interval === 'month'
        ) || variants.data?.data?.[0];

        return {
            productId: product.id,
            variantId: variant?.id,
            price: variant ? variant.attributes.price / 100 : null,
        };
    } catch (error) {
        console.error(`Error finding LemonSqueezy product for ${planName}:`, error.message);
        return null;
    }
}

async function main() {
    console.log('🌱 Seeding database...');
    console.log('');

    const createdPlans = [];

    for (const planDef of planDefinitions) {
        console.log(`📋 Processing ${planDef.name} plan...`);

        // Step 1: Find or sync with LemonSqueezy
        let lemonSqueezyData = null;
        if (planDef.syncWithLemonSqueezy) {
            console.log(`  ├─ Checking LemonSqueezy for "${planDef.name}"...`);
            lemonSqueezyData = await findLemonSqueezyProduct(planDef.name);

            if (lemonSqueezyData?.variantId) {
                console.log(`  ├─ ✅ Found in LemonSqueezy (Variant ID: ${lemonSqueezyData.variantId})`);
                if (lemonSqueezyData.price !== null && lemonSqueezyData.price !== planDef.price) {
                    console.log(`  ├─ ⚠️  Price mismatch: DB=$${planDef.price}, LemonSqueezy=$${lemonSqueezyData.price}`);
                    console.log(`  ├─    Using LemonSqueezy price: $${lemonSqueezyData.price}`);
                }
            } else {
                console.log(`  ├─ ⚠️  Not found in LemonSqueezy`);
                console.log(`  ├─    Create product named "${planDef.name}" in LemonSqueezy dashboard`);
                console.log(`  ├─    Then run: npm run prisma:seed`);
            }
        } else {
            console.log(`  ├─ Local plan (not synced with LemonSqueezy)`);
        }

        // Step 2: Create or update plan in database
        const plan = await prisma.plan.upsert({
            where: { type: planDef.type },
            update: {
                name: planDef.name,
                description: planDef.description,
                interval: planDef.interval,
                price: lemonSqueezyData?.price ?? planDef.price,
                priceUnit: 'INR',
                isActive: true,
                limits: planDef.limits,
                features: planDef.features,
                lemonSqueezyVariantId: lemonSqueezyData?.variantId || undefined,
                lemonSqueezyProductId: lemonSqueezyData?.productId || undefined,
            },
            create: {
                name: planDef.name,
                description: planDef.description,
                type: planDef.type,
                interval: planDef.interval,
                price: lemonSqueezyData?.price ?? planDef.price,
                priceUnit: 'INR',
                isActive: true,
                limits: planDef.limits,
                features: planDef.features,
                lemonSqueezyVariantId: lemonSqueezyData?.variantId,
                lemonSqueezyProductId: lemonSqueezyData?.productId,
            },
        });

        console.log(`  └─ ✅ Saved to database (ID: ${plan.id})`);
        console.log('');

        createdPlans.push({
            type: planDef.type,
            id: plan.id,
            synced: !!lemonSqueezyData?.variantId,
        });
    }

    console.log('');
    console.log('✅ Seeded plans:');
    createdPlans.forEach((p) => {
        const status = p.synced ? '🔗 Synced with LemonSqueezy' : '📍 Local only';
        console.log(`   ${p.type}: ${p.id} ${status}`);
    });
    console.log('');

    if (!LEMON_SQUEEZY_API_KEY) {
        console.log('⚠️  LEMON_SQUEEZY_API_KEY not set - skipped LemonSqueezy sync');
        console.log('   Set in .env.development to enable sync');
    }
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
        await pool.end();
    });
