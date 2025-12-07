import express from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authenticate } from '../middleware/auth.js';
import { validate, schemas } from '../utils/validation.js';
import { AppError } from '../middleware/errorHandler.js';
import { WhatsAppService } from '../services/whatsapp.service.js';
import { CSVUtil } from '../utils/csv.js';

const router = express.Router();

/**
 * GET /api/conversations
 * List conversations for a workspace
 */
router.get('/', authenticate, async (req, res, next) => {
    try {
        const { workspace_id, status, assigned_to, page = 1, limit = 50 } = req.query;

        if (!workspace_id) {
            throw new AppError('workspace_id is required', 400);
        }

        let query = supabaseAdmin
            .from('conversations')
            .select('*, contact:contacts(*)', { count: 'exact' })
            .eq('workspace_id', workspace_id);

        if (status) {
            query = query.eq('status', status);
        }

        if (assigned_to) {
            query = query.eq('assigned_to', assigned_to);
        }

        const offset = (parseInt(page) - 1) * parseInt(limit);
        query = query
            .range(offset, offset + parseInt(limit) - 1)
            .order('last_message_at', { ascending: false });

        const { data, error, count } = await query;

        if (error) throw error;

        res.json({
            conversations: data,
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
 * GET /api/conversations/:id
 * Get conversation details with messages
 */
router.get('/:id', authenticate, async (req, res, next) => {
    try {
        const { data: conversation, error: convError } = await supabaseAdmin
            .from('conversations')
            .select('*, contact:contacts(*)')
            .eq('id', req.params.id)
            .single();

        if (convError) throw new AppError('Conversation not found', 404);

        const { data: messages, error: msgError } = await supabaseAdmin
            .from('messages')
            .select('*')
            .eq('conversation_id', req.params.id)
            .order('timestamp', { ascending: true });

        if (msgError) throw msgError;

        res.json({
            conversation,
            messages,
        });
    } catch (error) {
        next(error);
    }
});

/**
 * PUT /api/conversations/:id/status
 * Update conversation status
 */
router.put('/:id/status', authenticate, validate(schemas.updateConversationStatus), async (req, res, next) => {
    try {
        const { status } = req.body;

        const { data, error } = await supabaseAdmin
            .from('conversations')
            .update({ status })
            .eq('id', req.params.id)
            .select()
            .single();

        if (error) throw error;

        res.json({ conversation: data });
    } catch (error) {
        next(error);
    }
});

/**
 * PUT /api/conversations/:id/assign
 * Assign conversation to an agent
 */
router.put('/:id/assign', authenticate, validate(schemas.assignConversation), async (req, res, next) => {
    try {
        const { assigned_to } = req.body;

        const { data, error } = await supabaseAdmin
            .from('conversations')
            .update({ assigned_to, status: 'human' })
            .eq('id', req.params.id)
            .select()
            .single();

        if (error) throw error;

        res.json({ conversation: data });
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/conversations/:id/messages
 * Send a manual message
 */
router.post('/:id/messages', authenticate, validate(schemas.sendMessage), async (req, res, next) => {
    try {
        const { content, type = 'text', media_url } = req.body;

        // Get conversation and workspace
        const { data: conversation } = await supabaseAdmin
            .from('conversations')
            .select('*, workspace:workspaces(*)')
            .eq('id', req.params.id)
            .single();

        if (!conversation) {
            throw new AppError('Conversation not found', 404);
        }

        // Initialize WhatsApp service
        const whatsapp = new WhatsAppService(
            conversation.workspace.whatsapp_phone_number_id,
            conversation.workspace.whatsapp_access_token
        );

        // Send message
        let result;
        if (type === 'text') {
            result = await whatsapp.sendText(conversation.contact_phone, content);
        } else {
            result = await whatsapp.sendMedia(conversation.contact_phone, type, media_url, content);
        }

        // Log message
        const { data: message, error } = await supabaseAdmin
            .from('messages')
            .insert({
                conversation_id: req.params.id,
                whatsapp_message_id: result.messages?.[0]?.id,
                direction: 'outgoing',
                content,
                type,
                media_url,
                status: 'sent',
            })
            .select()
            .single();

        if (error) throw error;

        // Update conversation last_message_at
        await supabaseAdmin
            .from('conversations')
            .update({ last_message_at: new Date().toISOString() })
            .eq('id', req.params.id);

        res.status(201).json({ message });
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/conversations/:id/takeover
 * Take over conversation (switch to human mode)
 */
router.post('/:id/takeover', authenticate, async (req, res, next) => {
    try {
        const { data, error } = await supabaseAdmin
            .from('conversations')
            .update({
                status: 'human',
                assigned_to: req.user.id,
            })
            .eq('id', req.params.id)
            .select()
            .single();

        if (error) throw error;

        res.json({ conversation: data });
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/conversations/:id/release
 * Release conversation back to bot
 */
router.post('/:id/release', authenticate, async (req, res, next) => {
    try {
        const { data, error } = await supabaseAdmin
            .from('conversations')
            .update({
                status: 'bot',
                assigned_to: null,
            })
            .eq('id', req.params.id)
            .select()
            .single();

        if (error) throw error;

        res.json({ conversation: data });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/conversations/export
 * Export conversations to CSV
 */
router.get('/export', authenticate, async (req, res, next) => {
    try {
        const { workspace_id, status } = req.query;

        if (!workspace_id) {
            throw new AppError('workspace_id is required', 400);
        }

        let query = supabaseAdmin
            .from('conversations')
            .select('id, workspace_id, bot_id, contact_id, contact_phone, status, assigned_to, last_message_at, created_at, updated_at')
            .eq('workspace_id', workspace_id);

        if (status) {
            query = query.eq('status', status);
        }

        const { data, error } = await query.order('created_at', { ascending: false });

        if (error) throw error;

        // Convert to CSV
        const flattened = CSVUtil.flattenArray(data);
        const csv = CSVUtil.toCSV(flattened);

        // Send CSV response
        CSVUtil.sendCSVResponse(res, csv, `conversations-${CSVUtil.getTimestamp()}.csv`);
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/conversations/:id/messages/export
 * Export conversation messages to CSV
 */
router.get('/:id/messages/export', authenticate, async (req, res, next) => {
    try {
        const { data, error } = await supabaseAdmin
            .from('messages')
            .select('id, conversation_id, whatsapp_message_id, direction, content, type, media_url, status, error_message, timestamp')
            .eq('conversation_id', req.params.id)
            .order('timestamp', { ascending: true });

        if (error) throw error;

        // Convert to CSV
        const flattened = CSVUtil.flattenArray(data);
        const csv = CSVUtil.toCSV(flattened);

        // Send CSV response
        CSVUtil.sendCSVResponse(res, csv, `conversation-${req.params.id}-messages-${CSVUtil.getTimestamp()}.csv`);
    } catch (error) {
        next(error);
    }
});

export default router;
