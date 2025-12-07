import express from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authenticate } from '../middleware/auth.js';
import { validate, schemas } from '../utils/validation.js';
import { AppError } from '../middleware/errorHandler.js';
import { BroadcastService } from '../services/broadcast.service.js';
import { CSVUtil } from '../utils/csv.js';

const router = express.Router();

// ============================================
// TEMPLATES
// ============================================

/**
 * GET /api/broadcast-templates
 * List broadcast templates
 */
router.get('/templates', authenticate, async (req, res, next) => {
    try {
        const { workspace_id } = req.query;

        if (!workspace_id) {
            throw new AppError('workspace_id is required', 400);
        }

        const { data, error } = await supabaseAdmin
            .from('broadcast_templates')
            .select('*')
            .eq('workspace_id', workspace_id)
            .order('created_at', { ascending: false });

        if (error) throw error;

        res.json({ templates: data });
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/broadcast-templates
 * Create a broadcast template
 */
router.post('/templates', authenticate, validate(schemas.createBroadcastTemplate), async (req, res, next) => {
    try {
        const { workspace_id, name, content, variables, category, language, media_type, media_url, buttons } = req.body;

        const { data, error } = await supabaseAdmin
            .from('broadcast_templates')
            .insert({
                workspace_id,
                name,
                content,
                variables,
                category,
                language,
                media_type,
                media_url,
                buttons,
            })
            .select()
            .single();

        if (error) throw error;

        res.status(201).json({ template: data });
    } catch (error) {
        next(error);
    }
});

/**
 * PUT /api/broadcast-templates/:id
 * Update a template
 */
router.put('/templates/:id', authenticate, async (req, res, next) => {
    try {
        const { name, content, variables, media_type, media_url, buttons } = req.body;

        const { data, error } = await supabaseAdmin
            .from('broadcast_templates')
            .update({ name, content, variables, media_type, media_url, buttons })
            .eq('id', req.params.id)
            .select()
            .single();

        if (error) throw error;

        res.json({ template: data });
    } catch (error) {
        next(error);
    }
});

/**
 * DELETE /api/broadcast-templates/:id
 * Delete a template
 */
router.delete('/templates/:id', authenticate, async (req, res, next) => {
    try {
        const { error } = await supabaseAdmin
            .from('broadcast_templates')
            .delete()
            .eq('id', req.params.id);

        if (error) throw error;

        res.json({ message: 'Template deleted successfully' });
    } catch (error) {
        next(error);
    }
});

// ============================================
// CAMPAIGNS
// ============================================

/**
 * GET /api/broadcasts
 * List broadcast campaigns
 */
router.get('/', authenticate, async (req, res, next) => {
    try {
        const { workspace_id, page = 1, limit = 20 } = req.query;

        if (!workspace_id) {
            throw new AppError('workspace_id is required', 400);
        }

        let query = supabaseAdmin
            .from('broadcast_campaigns')
            .select('*', { count: 'exact' })
            .eq('workspace_id', workspace_id);

        const offset = (parseInt(page) - 1) * parseInt(limit);
        query = query
            .range(offset, offset + parseInt(limit) - 1)
            .order('created_at', { ascending: false });

        const { data, error, count } = await query;

        if (error) throw error;

        res.json({
            campaigns: data,
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
 * POST /api/broadcasts
 * Create a broadcast campaign
 */
router.post('/', authenticate, validate(schemas.createBroadcastCampaign), async (req, res, next) => {
    try {
        const {
            workspace_id,
            name,
            template_id,
            message_content,
            message_type,
            target_type,
            target_filters,
            scheduled_at,
            rate_limit,
        } = req.body;

        const { data, error } = await supabaseAdmin
            .from('broadcast_campaigns')
            .insert({
                workspace_id,
                name,
                template_id,
                message_content,
                message_type,
                target_type,
                target_filters,
                scheduled_at,
                rate_limit,
                status: scheduled_at ? 'scheduled' : 'draft',
            })
            .select()
            .single();

        if (error) throw error;

        // Start immediately if not scheduled
        if (!scheduled_at) {
            await BroadcastService.startCampaign(data.id);
        }

        res.status(201).json({ campaign: data });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/broadcasts/:id
 * Get campaign details with stats
 */
router.get('/:id', authenticate, async (req, res, next) => {
    try {
        const { data, error } = await supabaseAdmin
            .from('broadcast_campaigns')
            .select('*')
            .eq('id', req.params.id)
            .single();

        if (error) throw new AppError('Campaign not found', 404);

        res.json({ campaign: data });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/broadcasts/:id/messages
 * Get campaign messages
 */
router.get('/:id/messages', authenticate, async (req, res, next) => {
    try {
        const { page = 1, limit = 50, status } = req.query;

        let query = supabaseAdmin
            .from('broadcast_messages')
            .select('*', { count: 'exact' })
            .eq('campaign_id', req.params.id);

        if (status) {
            query = query.eq('status', status);
        }

        const offset = (parseInt(page) - 1) * parseInt(limit);
        query = query
            .range(offset, offset + parseInt(limit) - 1)
            .order('sent_at', { ascending: false });

        const { data, error, count } = await query;

        if (error) throw error;

        res.json({
            messages: data,
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
 * POST /api/broadcasts/:id/pause
 * Pause a campaign
 */
router.post('/:id/pause', authenticate, async (req, res, next) => {
    try {
        await BroadcastService.pauseCampaign(req.params.id);
        res.json({ message: 'Campaign paused' });
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/broadcasts/:id/resume
 * Resume a campaign
 */
router.post('/:id/resume', authenticate, async (req, res, next) => {
    try {
        await BroadcastService.resumeCampaign(req.params.id);
        res.json({ message: 'Campaign resumed' });
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/broadcasts/:id/cancel
 * Cancel a campaign
 */
router.post('/:id/cancel', authenticate, async (req, res, next) => {
    try {
        await BroadcastService.cancelCampaign(req.params.id);
        res.json({ message: 'Campaign cancelled' });
    } catch (error) {
        next(error);
    }
});

/**
 * DELETE /api/broadcasts/:id
 * Delete a campaign
 */
router.delete('/:id', authenticate, async (req, res, next) => {
    try {
        const { error } = await supabaseAdmin
            .from('broadcast_campaigns')
            .delete()
            .eq('id', req.params.id);

        if (error) throw error;

        res.json({ message: 'Campaign deleted successfully' });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/broadcasts/export
 * Export broadcast campaigns to CSV
 */
router.get('/export', authenticate, async (req, res, next) => {
    try {
        const { workspace_id } = req.query;

        if (!workspace_id) {
            throw new AppError('workspace_id is required', 400);
        }

        const { data, error } = await supabaseAdmin
            .from('broadcast_campaigns')
            .select('id, workspace_id, name, message_type, target_type, status, scheduled_at, total_recipients, sent_count, delivered_count, read_count, failed_count, created_at, started_at, completed_at')
            .eq('workspace_id', workspace_id)
            .order('created_at', { ascending: false });

        if (error) throw error;

        // Convert to CSV
        const flattened = CSVUtil.flattenArray(data);
        const csv = CSVUtil.toCSV(flattened);

        // Send CSV response
        CSVUtil.sendCSVResponse(res, csv, `broadcast-campaigns-${CSVUtil.getTimestamp()}.csv`);
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/broadcasts/:id/messages/export
 * Export broadcast campaign messages to CSV
 */
router.get('/:id/messages/export', authenticate, async (req, res, next) => {
    try {
        const { data, error } = await supabaseAdmin
            .from('broadcast_messages')
            .select('id, campaign_id, contact_id, contact_phone, status, sent_at, delivered_at, read_at, error_message')
            .eq('campaign_id', req.params.id)
            .order('sent_at', { ascending: false });

        if (error) throw error;

        // Convert to CSV
        const flattened = CSVUtil.flattenArray(data);
        const csv = CSVUtil.toCSV(flattened);

        // Send CSV response
        CSVUtil.sendCSVResponse(res, csv, `broadcast-${req.params.id}-messages-${CSVUtil.getTimestamp()}.csv`);
    } catch (error) {
        next(error);
    }
});

export default router;
