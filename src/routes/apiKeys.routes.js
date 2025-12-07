import express from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authenticate } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';
import { logger } from '../utils/logger.js';

const router = express.Router();

/**
 * POST /api/api-keys
 * Create a new API key for a workspace
 */
router.post('/', authenticate, async (req, res, next) => {
    try {
        const { workspace_id, name, scopes, rate_limit_per_minute, expires_at } = req.body;

        if (!workspace_id || !name) {
            throw new AppError('workspace_id and name are required', 400);
        }

        // Generate new API key
        const keyType = process.env.NODE_ENV === 'production' ? 'live' : 'test';
        const { data: plainKey } = await supabaseAdmin.rpc('generate_api_key', {
            key_type: keyType
        });

        // Hash the key
        const { data: keyHash } = await supabaseAdmin.rpc('hash_api_key', {
            plain_key: plainKey
        });

        // Get key prefix for display
        const { data: keyPrefix } = await supabaseAdmin.rpc('get_key_prefix', {
            plain_key: plainKey
        });

        // Insert into database
        const { data, error } = await supabaseAdmin
            .from('api_keys')
            .insert({
                workspace_id,
                name,
                key_hash: keyHash,
                key_prefix: keyPrefix,
                scopes: scopes || ['read', 'write'],
                rate_limit_per_minute: rate_limit_per_minute || 60,
                expires_at,
                created_by: req.user?.id,
            })
            .select()
            .single();

        if (error) throw error;

        logger.info(`API key created for workspace ${workspace_id}: ${name}`);

        // IMPORTANT: Return the plain key ONLY once
        res.status(201).json({
            message: 'API key created successfully. Save this key securely - it will not be shown again!',
            api_key: plainKey, // ⚠️ Shown ONLY once
            key_info: {
                id: data.id,
                name: data.name,
                key_prefix: data.key_prefix,
                scopes: data.scopes,
                rate_limit_per_minute: data.rate_limit_per_minute,
                created_at: data.created_at,
                expires_at: data.expires_at,
            }
        });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/api-keys
 * List all API keys for a workspace
 */
router.get('/', authenticate, async (req, res, next) => {
    try {
        const { workspace_id } = req.query;

        if (!workspace_id) {
            throw new AppError('workspace_id is required', 400);
        }

        const { data, error } = await supabaseAdmin
            .from('api_keys')
            .select('id, name, key_prefix, scopes, status, rate_limit_per_minute, last_used_at, usage_count, expires_at, created_at')
            .eq('workspace_id', workspace_id)
            .order('created_at', { ascending: false });

        if (error) throw error;

        res.json({
            api_keys: data,
            total: data.length
        });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/api-keys/:id
 * Get details of a specific API key
 */
router.get('/:id', authenticate, async (req, res, next) => {
    try {
        const { data, error } = await supabaseAdmin
            .from('api_keys')
            .select('*')
            .eq('id', req.params.id)
            .single();

        if (error || !data) {
            throw new AppError('API key not found', 404);
        }

        // Remove sensitive data
        delete data.key_hash;

        res.json({ api_key: data });
    } catch (error) {
        next(error);
    }
});

/**
 * PUT /api/api-keys/:id
 * Update API key (name, scopes, rate limit)
 */
router.put('/:id', authenticate, async (req, res, next) => {
    try {
        const { name, scopes, rate_limit_per_minute } = req.body;

        const updateData = {};
        if (name) updateData.name = name;
        if (scopes) updateData.scopes = scopes;
        if (rate_limit_per_minute) updateData.rate_limit_per_minute = rate_limit_per_minute;

        const { data, error } = await supabaseAdmin
            .from('api_keys')
            .update(updateData)
            .eq('id', req.params.id)
            .select()
            .single();

        if (error) throw error;

        logger.info(`API key updated: ${data.name} (${req.params.id})`);

        res.json({
            message: 'API key updated successfully',
            api_key: data
        });
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/api-keys/:id/revoke
 * Revoke an API key
 */
router.post('/:id/revoke', authenticate, async (req, res, next) => {
    try {
        const { reason } = req.body;

        const { error } = await supabaseAdmin.rpc('revoke_api_key', {
            key_id_param: req.params.id,
            revoked_by_param: req.user?.id,
            reason: reason || 'Revoked via API'
        });

        if (error) throw error;

        logger.info(`API key revoked: ${req.params.id}`);

        res.json({
            message: 'API key revoked successfully'
        });
    } catch (error) {
        next(error);
    }
});

/**
 * DELETE /api/api-keys/:id
 * Delete an API key permanently
 */
router.delete('/:id', authenticate, async (req, res, next) => {
    try {
        const { error } = await supabaseAdmin
            .from('api_keys')
            .delete()
            .eq('id', req.params.id);

        if (error) throw error;

        logger.info(`API key deleted: ${req.params.id}`);

        res.json({
            message: 'API key deleted successfully'
        });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/api-keys/:id/usage
 * Get usage statistics for an API key
 */
router.get('/:id/usage', authenticate, async (req, res, next) => {
    try {
        const { data, error } = await supabaseAdmin
            .from('api_keys')
            .select('usage_count, last_used_at, last_used_ip, created_at')
            .eq('id', req.params.id)
            .single();

        if (error || !data) {
            throw new AppError('API key not found', 404);
        }

        const daysSinceCreation = Math.floor(
            (new Date() - new Date(data.created_at)) / (1000 * 60 * 60 * 24)
        );

        res.json({
            usage: {
                total_requests: data.usage_count,
                last_used_at: data.last_used_at,
                last_used_ip: data.last_used_ip,
                days_active: daysSinceCreation,
                avg_requests_per_day: daysSinceCreation > 0
                    ? Math.round(data.usage_count / daysSinceCreation)
                    : data.usage_count
            }
        });
    } catch (error) {
        next(error);
    }
});

export default router;
