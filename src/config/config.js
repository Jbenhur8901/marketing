import dotenv from 'dotenv';

dotenv.config();

export const config = {
    // Server
    port: process.env.PORT || 3000,
    nodeEnv: process.env.NODE_ENV || 'development',

    // Supabase
    supabase: {
        url: process.env.SUPABASE_URL,
        anonKey: process.env.SUPABASE_ANON_KEY,
        serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    },

    // WhatsApp
    whatsapp: {
        apiUrl: process.env.WHATSAPP_API_URL || 'https://graph.facebook.com/v18.0',
        verifyToken: process.env.WHATSAPP_VERIFY_TOKEN,
    },

    // Rate Limiting
    rateLimit: {
        requests: parseInt(process.env.API_RATE_LIMIT_REQUESTS) || 100,
        windowMs: parseInt(process.env.API_RATE_LIMIT_WINDOW_MS) || 60000,
    },

    // Bulk Verification
    bulkVerification: {
        maxJobsPerHour: parseInt(process.env.BULK_VERIFICATION_MAX_JOBS_PER_HOUR) || 10,
        chunkSize: parseInt(process.env.BULK_VERIFICATION_CHUNK_SIZE) || 50,
        rateLimit: parseInt(process.env.BULK_VERIFICATION_RATE_LIMIT) || 20,
    },

    // Broadcasting
    broadcast: {
        defaultRateLimit: parseInt(process.env.BROADCAST_DEFAULT_RATE_LIMIT) || 10,
        maxRateLimit: parseInt(process.env.BROADCAST_MAX_RATE_LIMIT) || 100,
        failureThreshold: parseInt(process.env.BROADCAST_FAILURE_THRESHOLD) || 30,
    },

    // Cache
    cache: {
        verificationCacheDays: parseInt(process.env.VERIFICATION_CACHE_DAYS) || 30,
    },
};

// Validate required environment variables
const required = [
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'WHATSAPP_VERIFY_TOKEN',
    // Note: API keys are now managed in database (api_keys table)
];

for (const key of required) {
    if (!process.env[key]) {
        throw new Error(`Missing required environment variable: ${key}`);
    }
}
