import express from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authenticate } from '../middleware/auth.js';
import { validate, schemas } from '../utils/validation.js';
import { AppError } from '../middleware/errorHandler.js';

const router = express.Router();

/**
 * GET /api/workspaces
 * List user's workspaces
 */
router.get('/', authenticate, async (req, res, next) => {
    try {
        const { data, error } = await supabaseAdmin
            .from('workspace_members')
            .select('*, workspace:workspaces(*)')
            .eq('user_id', req.user.id);

        if (error) throw error;

        res.json({
            workspaces: data.map(m => ({
                ...m.workspace,
                role: m.role,
            })),
        });
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/workspaces
 * Create a new workspace
 */
router.post('/', authenticate, validate(schemas.createWorkspace), async (req, res, next) => {
    try {
        const { name } = req.body;

        // Create workspace
        const { data: workspace, error: workspaceError } = await supabaseAdmin
            .from('workspaces')
            .insert({
                name,
                owner_id: req.user.id,
            })
            .select()
            .single();

        if (workspaceError) throw workspaceError;

        // Add owner as admin member
        const { error: memberError } = await supabaseAdmin
            .from('workspace_members')
            .insert({
                workspace_id: workspace.id,
                user_id: req.user.id,
                role: 'admin',
                joined_at: new Date().toISOString(),
            });

        if (memberError) throw memberError;

        res.status(201).json({ workspace });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/workspaces/:id
 * Get workspace details
 */
router.get('/:id', authenticate, async (req, res, next) => {
    try {
        const { data, error } = await supabaseAdmin
            .from('workspaces')
            .select('*')
            .eq('id', req.params.id)
            .single();

        if (error) throw new AppError('Workspace not found', 404);

        res.json({ workspace: data });
    } catch (error) {
        next(error);
    }
});

/**
 * PUT /api/workspaces/:id
 * Update workspace
 */
router.put('/:id', authenticate, async (req, res, next) => {
    try {
        const { name, settings } = req.body;

        const { data, error } = await supabaseAdmin
            .from('workspaces')
            .update({ name, settings })
            .eq('id', req.params.id)
            .select()
            .single();

        if (error) throw error;

        res.json({ workspace: data });
    } catch (error) {
        next(error);
    }
});

/**
 * DELETE /api/workspaces/:id
 * Delete workspace
 */
router.delete('/:id', authenticate, async (req, res, next) => {
    try {
        const { error } = await supabaseAdmin
            .from('workspaces')
            .delete()
            .eq('id', req.params.id)
            .eq('owner_id', req.user.id);

        if (error) throw error;

        res.json({ message: 'Workspace deleted successfully' });
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/workspaces/:id/connect-whatsapp
 * Connect WhatsApp to workspace
 */
router.post('/:id/connect-whatsapp', authenticate, validate(schemas.connectWhatsApp), async (req, res, next) => {
    try {
        const { whatsapp_business_account_id, whatsapp_phone_number_id, whatsapp_access_token } = req.body;

        const { data, error } = await supabaseAdmin
            .from('workspaces')
            .update({
                whatsapp_business_account_id,
                whatsapp_phone_number_id,
                whatsapp_access_token,
                webhook_verify_token: crypto.randomUUID(),
            })
            .eq('id', req.params.id)
            .select()
            .single();

        if (error) throw error;

        res.json({
            workspace: data,
            webhook_url: `${process.env.API_URL || 'http://localhost:3000'}/api/whatsapp/webhook`,
        });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/workspaces/:id/members
 * Get workspace members
 */
router.get('/:id/members', authenticate, async (req, res, next) => {
    try {
        const { data, error } = await supabaseAdmin
            .from('workspace_members')
            .select('*')
            .eq('workspace_id', req.params.id);

        if (error) throw error;

        res.json({ members: data });
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/workspaces/:id/members
 * Add workspace member
 */
router.post('/:id/members', authenticate, async (req, res, next) => {
    try {
        const { user_id, role } = req.body;

        const { data, error } = await supabaseAdmin
            .from('workspace_members')
            .insert({
                workspace_id: req.params.id,
                user_id,
                role,
            })
            .select()
            .single();

        if (error) throw error;

        res.status(201).json({ member: data });
    } catch (error) {
        next(error);
    }
});

/**
 * DELETE /api/workspaces/:workspaceId/members/:memberId
 * Remove workspace member
 */
router.delete('/:workspaceId/members/:memberId', authenticate, async (req, res, next) => {
    try {
        const { error } = await supabaseAdmin
            .from('workspace_members')
            .delete()
            .eq('id', req.params.memberId)
            .eq('workspace_id', req.params.workspaceId);

        if (error) throw error;

        res.json({ message: 'Member removed successfully' });
    } catch (error) {
        next(error);
    }
});

export default router;
