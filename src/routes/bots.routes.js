import express from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authenticate } from '../middleware/auth.js';
import { validate, schemas } from '../utils/validation.js';
import { AppError } from '../middleware/errorHandler.js';

const router = express.Router();

/**
 * GET /api/bots
 * List bots for a workspace
 */
router.get('/', authenticate, async (req, res, next) => {
    try {
        const { workspace_id } = req.query;

        if (!workspace_id) {
            throw new AppError('workspace_id is required', 400);
        }

        const { data, error } = await supabaseAdmin
            .from('bots')
            .select('*')
            .eq('workspace_id', workspace_id)
            .order('created_at', { ascending: false });

        if (error) throw error;

        res.json({ bots: data });
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/bots
 * Create a new bot
 */
router.post('/', authenticate, validate(schemas.createBot), async (req, res, next) => {
    try {
        const { workspace_id, name, description } = req.body;

        const { data, error } = await supabaseAdmin
            .from('bots')
            .insert({
                workspace_id,
                name,
                description,
            })
            .select()
            .single();

        if (error) throw error;

        res.status(201).json({ bot: data });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/bots/:id
 * Get bot details
 */
router.get('/:id', authenticate, async (req, res, next) => {
    try {
        const { data, error } = await supabaseAdmin
            .from('bots')
            .select('*')
            .eq('id', req.params.id)
            .single();

        if (error) throw new AppError('Bot not found', 404);

        res.json({ bot: data });
    } catch (error) {
        next(error);
    }
});

/**
 * PUT /api/bots/:id
 * Update bot
 */
router.put('/:id', authenticate, validate(schemas.updateBot), async (req, res, next) => {
    try {
        const { name, description, status } = req.body;

        const { data, error } = await supabaseAdmin
            .from('bots')
            .update({ name, description, status })
            .eq('id', req.params.id)
            .select()
            .single();

        if (error) throw error;

        res.json({ bot: data });
    } catch (error) {
        next(error);
    }
});

/**
 * DELETE /api/bots/:id
 * Delete bot
 */
router.delete('/:id', authenticate, async (req, res, next) => {
    try {
        const { error } = await supabaseAdmin
            .from('bots')
            .delete()
            .eq('id', req.params.id);

        if (error) throw error;

        res.json({ message: 'Bot deleted successfully' });
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/bots/:id/activate
 * Activate bot
 */
router.post('/:id/activate', authenticate, async (req, res, next) => {
    try {
        const { data, error } = await supabaseAdmin
            .from('bots')
            .update({ status: 'active' })
            .eq('id', req.params.id)
            .select()
            .single();

        if (error) throw error;

        res.json({ bot: data });
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/bots/:id/deactivate
 * Deactivate bot
 */
router.post('/:id/deactivate', authenticate, async (req, res, next) => {
    try {
        const { data, error } = await supabaseAdmin
            .from('bots')
            .update({ status: 'inactive' })
            .eq('id', req.params.id)
            .select()
            .single();

        if (error) throw error;

        res.json({ bot: data });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/bots/:id/flow
 * Get bot flow
 */
router.get('/:id/flow', authenticate, async (req, res, next) => {
    try {
        const { data, error } = await supabaseAdmin
            .from('bots')
            .select('flow_json')
            .eq('id', req.params.id)
            .single();

        if (error) throw new AppError('Bot not found', 404);

        res.json({ flow: data.flow_json });
    } catch (error) {
        next(error);
    }
});

/**
 * PUT /api/bots/:id/flow
 * Update bot flow
 */
router.put('/:id/flow', authenticate, validate(schemas.updateFlow), async (req, res, next) => {
    try {
        const { flow_json } = req.body;

        // Save current version to history
        const { data: bot } = await supabaseAdmin
            .from('bots')
            .select('flow_json')
            .eq('id', req.params.id)
            .single();

        if (bot) {
            await supabaseAdmin.from('flow_versions').insert({
                bot_id: req.params.id,
                flow_json: bot.flow_json,
                created_by: req.user.id,
            });
        }

        // Update flow
        const { data, error } = await supabaseAdmin
            .from('bots')
            .update({ flow_json })
            .eq('id', req.params.id)
            .select()
            .single();

        if (error) throw error;

        res.json({ bot: data });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/bots/:id/flow/versions
 * Get flow version history
 */
router.get('/:id/flow/versions', authenticate, async (req, res, next) => {
    try {
        const { data, error } = await supabaseAdmin
            .from('flow_versions')
            .select('*')
            .eq('bot_id', req.params.id)
            .order('version', { ascending: false });

        if (error) throw error;

        res.json({ versions: data });
    } catch (error) {
        next(error);
    }
});

export default router;
