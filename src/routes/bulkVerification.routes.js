import express from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authenticate } from '../middleware/auth.js';
import { validate, schemas } from '../utils/validation.js';
import { bulkVerificationLimiter } from '../middleware/rateLimiter.js';
import { BulkVerificationService } from '../services/bulkVerification.service.js';
import { AppError } from '../middleware/errorHandler.js';

const router = express.Router();

/**
 * POST /api/bulk-verification/start
 * Start a bulk verification job
 */
router.post(
    '/start',
    authenticate,
    bulkVerificationLimiter,
    validate(schemas.startBulkVerification),
    async (req, res, next) => {
        try {
            const { workspace_id, phone_numbers, auto_add_to_contacts } = req.body;

            // For API key auth, there's no individual user - pass null for created_by
            // req.user.id is actually workspace_id in API key auth context
            const userId = req.authenticated && req.user?.id !== req.workspace_id ? req.user.id : null;

            const job = await BulkVerificationService.startJob(
                workspace_id,
                phone_numbers,
                auto_add_to_contacts,
                userId
            );

            res.status(201).json({ job });
        } catch (error) {
            next(error);
        }
    }
);

/**
 * GET /api/bulk-verification/:jobId
 * Get verification job status
 */
router.get('/:jobId', authenticate, async (req, res, next) => {
    try {
        const { data, error } = await supabaseAdmin
            .from('bulk_verification_jobs')
            .select('*')
            .eq('id', req.params.jobId)
            .single();

        if (error) throw new AppError('Job not found', 404);

        // Calculate percentage
        const percentage = data.total_numbers > 0
            ? Math.round((data.processed_count / data.total_numbers) * 100)
            : 0;

        res.json({
            job: {
                ...data,
                percentage,
            },
        });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/bulk-verification/:jobId/results
 * Get verification results
 */
router.get('/:jobId/results', authenticate, async (req, res, next) => {
    try {
        const { page = 1, limit = 50, status, whatsapp_exists } = req.query;

        let query = supabaseAdmin
            .from('number_verification_results')
            .select('*', { count: 'exact' })
            .eq('job_id', req.params.jobId);

        if (status) {
            query = query.eq('status', status);
        }

        if (whatsapp_exists !== undefined) {
            query = query.eq('whatsapp_exists', whatsapp_exists === 'true');
        }

        const offset = (parseInt(page) - 1) * parseInt(limit);
        query = query
            .range(offset, offset + parseInt(limit) - 1)
            .order('verified_at', { ascending: false });

        const { data, error, count } = await query;

        if (error) throw error;

        res.json({
            results: data,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: count,
                pages: Math.ceil(count / parseInt(limit)),
            },
        });
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/bulk-verification/:jobId/export
 * Export verification results to CSV
 */
router.post('/:jobId/export', authenticate, async (req, res, next) => {
    try {
        const { data, error } = await supabaseAdmin
            .from('number_verification_results')
            .select('*')
            .eq('job_id', req.params.jobId);

        if (error) throw error;

        // Convert to CSV
        const headers = ['phone', 'format_valid', 'whatsapp_exists', 'wa_id', 'status', 'error_message', 'verified_at'];
        const csv = [
            headers.join(','),
            ...data.map(result =>
                headers.map(h => result[h] || '').join(',')
            ),
        ].join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=verification-results-${req.params.jobId}.csv`);
        res.send(csv);
    } catch (error) {
        next(error);
    }
});

/**
 * DELETE /api/bulk-verification/:jobId
 * Cancel or delete a verification job
 */
router.delete('/:jobId', authenticate, async (req, res, next) => {
    try {
        // Update to cancelled if still processing
        await supabaseAdmin
            .from('bulk_verification_jobs')
            .update({ status: 'cancelled' })
            .eq('id', req.params.jobId)
            .in('status', ['pending', 'processing']);

        // Delete the job
        const { error } = await supabaseAdmin
            .from('bulk_verification_jobs')
            .delete()
            .eq('id', req.params.jobId);

        if (error) throw error;

        res.json({ message: 'Job deleted successfully' });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/bulk-verification
 * List all verification jobs for workspace
 */
router.get('/', authenticate, async (req, res, next) => {
    try {
        const { workspace_id, page = 1, limit = 20 } = req.query;

        if (!workspace_id) {
            throw new AppError('workspace_id is required', 400);
        }

        let query = supabaseAdmin
            .from('bulk_verification_jobs')
            .select('*', { count: 'exact' })
            .eq('workspace_id', workspace_id);

        const offset = (parseInt(page) - 1) * parseInt(limit);
        query = query
            .range(offset, offset + parseInt(limit) - 1)
            .order('created_at', { ascending: false });

        const { data, error, count } = await query;

        if (error) throw error;

        res.json({
            jobs: data,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: count,
                pages: Math.ceil(count / parseInt(limit)),
            },
        });
    } catch (error) {
        next(error);
    }
});

export default router;
