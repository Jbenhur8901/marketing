import rateLimit from 'express-rate-limit';
import { config } from '../config/config.js';

export const generalLimiter = rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.requests,
    message: 'Too many requests from this IP, please try again later',
    standardHeaders: true,
    legacyHeaders: false,
});

export const bulkVerificationLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: config.bulkVerification.maxJobsPerHour,
    message: 'Too many verification jobs created, please try again later',
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.api_key_id || req.workspace_id || req.ip,
});

export const webhookLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 1000, // WhatsApp can send many webhooks
    message: 'Too many webhook requests',
    standardHeaders: false,
    legacyHeaders: false,
});
