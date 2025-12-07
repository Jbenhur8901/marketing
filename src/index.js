import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { config } from './config/config.js';
import { logger } from './utils/logger.js';
import { generalLimiter } from './middleware/rateLimiter.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { SchedulerService } from './services/scheduler.service.js';
import { MediaService } from './services/media.service.js';

// Import routes
// Note: Auth is handled via X-API-KEY header, no auth routes needed
import workspaceRoutes from './routes/workspaces.routes.js';
import botRoutes from './routes/bots.routes.js';
import contactRoutes from './routes/contacts.routes.js';
import conversationRoutes from './routes/conversations.routes.js';
import bulkVerificationRoutes from './routes/bulkVerification.routes.js';
import broadcastRoutes from './routes/broadcasts.routes.js';
import analyticsRoutes from './routes/analytics.routes.js';
import webhookRoutes from './routes/webhook.routes.js';
import mediaRoutes from './routes/media.routes.js';
import monitoringRoutes from './routes/monitoring.routes.js';
import apiKeysRoutes from './routes/apiKeys.routes.js';

const app = express();

// ============================================
// MIDDLEWARE
// ============================================

// Security
app.use(helmet());

// CORS
app.use(cors({
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
}));

// Body parsing - IMPORTANT: Raw body for webhook signature verification
app.use('/api/whatsapp/webhook', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve media files (if using local storage)
if (process.env.MEDIA_STORAGE === 'local') {
    app.use('/media', express.static(process.env.LOCAL_MEDIA_PATH || './media'));
}

// Rate limiting
app.use('/api/', generalLimiter);

// Logging
app.use((req, res, next) => {
    logger.http(`${req.method} ${req.path}`);
    next();
});

// ============================================
// ROUTES
// ============================================

// Health check
app.get('/', (req, res) => {
    res.json({
        name: 'WhatsApp Chatbot Platform API',
        version: '1.0.0',
        status: 'running',
    });
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Scheduler status endpoint
app.get('/scheduler/status', (req, res) => {
    const jobs = SchedulerService.getStatus();
    res.json({
        scheduler: 'active',
        jobs,
        timestamp: new Date().toISOString(),
    });
});

// API routes
// Auth is handled via X-API-KEY header in middleware
app.use('/api/workspaces', workspaceRoutes);
app.use('/api/bots', botRoutes);
app.use('/api/contacts', contactRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/bulk-verification', bulkVerificationRoutes);
app.use('/api/broadcasts', broadcastRoutes);
app.use('/api/broadcast-templates', broadcastRoutes); // Templates use same router
app.use('/api/analytics', analyticsRoutes);
app.use('/api/whatsapp', webhookRoutes);
app.use('/api/media', mediaRoutes);
app.use('/api/monitoring', monitoringRoutes);
app.use('/api/api-keys', apiKeysRoutes);

// ============================================
// ERROR HANDLING
// ============================================

// 404 handler
app.use(notFound);

// Global error handler
app.use(errorHandler);

// ============================================
// START SERVER
// ============================================

const PORT = config.port;

app.listen(PORT, async () => {
    logger.info(`🚀 Server running on port ${PORT} in ${config.nodeEnv} mode`);
    logger.info(`📝 API documentation available at http://localhost:${PORT}/`);

    // Initialize scheduler for automated tasks
    SchedulerService.init();

    // Initialize media storage
    await MediaService.init();
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
    logger.error(`Unhandled rejection: ${err.message}`);
    process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    logger.info('SIGTERM received, shutting down gracefully');
    SchedulerService.stop();
    process.exit(0);
});

export default app;
