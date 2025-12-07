import express from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { SchedulerService } from '../services/scheduler.service.js';
import { DLQService } from '../services/dlq.service.js';
import { logger } from '../utils/logger.js';
import os from 'os';

const router = express.Router();

/**
 * GET /api/monitoring/health
 * Comprehensive health check
 */
router.get('/health', async (req, res) => {
    try {
        const health = {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            environment: process.env.NODE_ENV,
            version: '1.0.0',
            checks: {},
        };

        // Database check
        try {
            const { data, error } = await supabaseAdmin
                .from('workspaces')
                .select('id')
                .limit(1);

            health.checks.database = {
                status: error ? 'unhealthy' : 'healthy',
                message: error ? error.message : 'Connected',
            };
        } catch (err) {
            health.checks.database = {
                status: 'unhealthy',
                message: err.message,
            };
            health.status = 'degraded';
        }

        // Scheduler check
        try {
            const schedulerStatus = SchedulerService.getStatus();
            const allRunning = schedulerStatus.every(j => j.running);

            health.checks.scheduler = {
                status: allRunning ? 'healthy' : 'degraded',
                jobs: schedulerStatus,
            };

            if (!allRunning) {
                health.status = 'degraded';
            }
        } catch (err) {
            health.checks.scheduler = {
                status: 'unhealthy',
                message: err.message,
            };
            health.status = 'degraded';
        }

        // Memory check
        const memUsage = process.memoryUsage();
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const memUsagePercent = ((totalMem - freeMem) / totalMem) * 100;

        health.checks.memory = {
            status: memUsagePercent > 90 ? 'unhealthy' : 'healthy',
            used: `${Math.round(memUsagePercent)}%`,
            details: {
                rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`,
                heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
                heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
            },
        };

        res.json(health);
    } catch (error) {
        logger.error(`Health check error: ${error.message}`);
        res.status(503).json({
            status: 'unhealthy',
            timestamp: new Date().toISOString(),
            error: error.message,
        });
    }
});

/**
 * GET /api/monitoring/metrics
 * System metrics
 */
router.get('/metrics', async (req, res) => {
    try {
        const metrics = {
            timestamp: new Date().toISOString(),
            system: {
                platform: os.platform(),
                arch: os.arch(),
                cpus: os.cpus().length,
                uptime: os.uptime(),
                loadAverage: os.loadavg(),
                totalMemory: `${Math.round(os.totalmem() / 1024 / 1024 / 1024)}GB`,
                freeMemory: `${Math.round(os.freemem() / 1024 / 1024 / 1024)}GB`,
            },
            process: {
                pid: process.pid,
                uptime: process.uptime(),
                memoryUsage: {
                    rss: `${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB`,
                    heapUsed: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
                    heapTotal: `${Math.round(process.memoryUsage().heapTotal / 1024 / 1024)}MB`,
                },
                cpuUsage: process.cpuUsage(),
            },
        };

        // Get database stats
        try {
            const tables = ['workspaces', 'contacts', 'conversations', 'messages', 'bots', 'broadcast_campaigns'];
            metrics.database = {};

            for (const table of tables) {
                const { count, error } = await supabaseAdmin
                    .from(table)
                    .select('*', { count: 'exact', head: true });

                if (!error) {
                    metrics.database[table] = count;
                }
            }
        } catch (err) {
            logger.error(`Database metrics error: ${err.message}`);
        }

        res.json(metrics);
    } catch (error) {
        logger.error(`Metrics error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/monitoring/scheduler
 * Scheduler status and jobs
 */
router.get('/scheduler', (req, res) => {
    try {
        const status = SchedulerService.getStatus();

        res.json({
            status: 'active',
            jobCount: status.length,
            jobs: status,
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        logger.error(`Scheduler status error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/monitoring/dlq/stats
 * Dead Letter Queue statistics
 */
router.get('/dlq/stats', async (req, res) => {
    try {
        const { workspace_id } = req.query;

        if (!workspace_id) {
            return res.status(400).json({ error: 'workspace_id is required' });
        }

        const stats = await DLQService.getStats(workspace_id);

        res.json({
            workspace_id,
            stats,
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        logger.error(`DLQ stats error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/monitoring/logs
 * Recent error logs (last 100)
 */
router.get('/logs', async (req, res) => {
    try {
        // This is a simple example - in production, use a proper logging service
        res.json({
            message: 'Logs endpoint - integrate with your logging service (e.g., Winston, Logtail, Sentry)',
            recommendation: 'Use external logging service for production',
        });
    } catch (error) {
        logger.error(`Logs error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/monitoring/ready
 * Kubernetes-style readiness probe
 */
router.get('/ready', async (req, res) => {
    try {
        // Check critical services
        const { data, error } = await supabaseAdmin
            .from('workspaces')
            .select('id')
            .limit(1);

        if (error) {
            return res.status(503).send('Not Ready');
        }

        res.status(200).send('Ready');
    } catch (error) {
        res.status(503).send('Not Ready');
    }
});

/**
 * GET /api/monitoring/live
 * Kubernetes-style liveness probe
 */
router.get('/live', (req, res) => {
    res.status(200).send('Live');
});

export default router;
