import express from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authenticate } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';

const router = express.Router();

/**
 * GET /api/analytics/overview
 * Get analytics overview
 */
router.get('/overview', authenticate, async (req, res, next) => {
    try {
        const { workspace_id, from, to } = req.query;

        if (!workspace_id) {
            throw new AppError('workspace_id is required', 400);
        }

        // Total contacts
        const { count: totalContacts } = await supabaseAdmin
            .from('contacts')
            .select('*', { count: 'exact', head: true })
            .eq('workspace_id', workspace_id);

        // Active contacts (had messages in last 30 days)
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const { count: activeContacts } = await supabaseAdmin
            .from('contacts')
            .select('*', { count: 'exact', head: true })
            .eq('workspace_id', workspace_id)
            .gte('last_message_at', thirtyDaysAgo);

        // Total conversations
        const { count: totalConversations } = await supabaseAdmin
            .from('conversations')
            .select('*', { count: 'exact', head: true })
            .eq('workspace_id', workspace_id);

        // Messages sent/received
        const { count: messagesSent } = await supabaseAdmin
            .from('messages')
            .select('*, conversation:conversations!inner(workspace_id)', { count: 'exact', head: true })
            .eq('conversation.workspace_id', workspace_id)
            .eq('direction', 'outgoing');

        const { count: messagesReceived } = await supabaseAdmin
            .from('messages')
            .select('*, conversation:conversations!inner(workspace_id)', { count: 'exact', head: true })
            .eq('conversation.workspace_id', workspace_id)
            .eq('direction', 'incoming');

        // Active bots
        const { count: activeBots } = await supabaseAdmin
            .from('bots')
            .select('*', { count: 'exact', head: true })
            .eq('workspace_id', workspace_id)
            .eq('status', 'active');

        res.json({
            overview: {
                total_contacts: totalContacts,
                active_contacts: activeContacts,
                total_conversations: totalConversations,
                messages_sent: messagesSent,
                messages_received: messagesReceived,
                active_bots: activeBots,
            },
        });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/analytics/conversations
 * Get conversation analytics
 */
router.get('/conversations', authenticate, async (req, res, next) => {
    try {
        const { workspace_id, period = '7d' } = req.query;

        if (!workspace_id) {
            throw new AppError('workspace_id is required', 400);
        }

        // Calculate date range
        const days = parseInt(period.replace('d', ''));
        const fromDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

        // Conversations by status
        const { data: conversationsByStatus } = await supabaseAdmin
            .from('conversations')
            .select('status')
            .eq('workspace_id', workspace_id)
            .gte('created_at', fromDate);

        const statusCounts = conversationsByStatus.reduce((acc, conv) => {
            acc[conv.status] = (acc[conv.status] || 0) + 1;
            return acc;
        }, {});

        // Conversations over time (daily)
        const { data: conversationsOverTime } = await supabaseAdmin
            .from('conversations')
            .select('created_at')
            .eq('workspace_id', workspace_id)
            .gte('created_at', fromDate)
            .order('created_at', { ascending: true });

        const dailyCounts = {};
        conversationsOverTime.forEach(conv => {
            const date = conv.created_at.split('T')[0];
            dailyCounts[date] = (dailyCounts[date] || 0) + 1;
        });

        res.json({
            conversations: {
                by_status: statusCounts,
                over_time: dailyCounts,
                total: conversationsByStatus.length,
            },
        });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/analytics/messages
 * Get message analytics
 */
router.get('/messages', authenticate, async (req, res, next) => {
    try {
        const { workspace_id, period = '7d' } = req.query;

        if (!workspace_id) {
            throw new AppError('workspace_id is required', 400);
        }

        const days = parseInt(period.replace('d', ''));
        const fromDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

        // Messages by type
        const { data: messagesByType } = await supabaseAdmin
            .from('messages')
            .select('type, conversation:conversations!inner(workspace_id)')
            .eq('conversation.workspace_id', workspace_id)
            .gte('timestamp', fromDate);

        const typeCounts = messagesByType.reduce((acc, msg) => {
            acc[msg.type] = (acc[msg.type] || 0) + 1;
            return acc;
        }, {});

        // Messages by direction
        const { data: messagesByDirection } = await supabaseAdmin
            .from('messages')
            .select('direction, conversation:conversations!inner(workspace_id)')
            .eq('conversation.workspace_id', workspace_id)
            .gte('timestamp', fromDate);

        const directionCounts = messagesByDirection.reduce((acc, msg) => {
            acc[msg.direction] = (acc[msg.direction] || 0) + 1;
            return acc;
        }, {});

        // Message delivery rates
        const { data: deliveryStats } = await supabaseAdmin
            .from('messages')
            .select('status, conversation:conversations!inner(workspace_id)')
            .eq('conversation.workspace_id', workspace_id)
            .eq('direction', 'outgoing')
            .gte('timestamp', fromDate);

        const statusCounts = deliveryStats.reduce((acc, msg) => {
            acc[msg.status] = (acc[msg.status] || 0) + 1;
            return acc;
        }, {});

        const totalSent = deliveryStats.length;
        const deliveryRate = totalSent > 0
            ? ((statusCounts.delivered || 0) / totalSent * 100).toFixed(2)
            : 0;
        const readRate = totalSent > 0
            ? ((statusCounts.read || 0) / totalSent * 100).toFixed(2)
            : 0;

        res.json({
            messages: {
                by_type: typeCounts,
                by_direction: directionCounts,
                by_status: statusCounts,
                delivery_rate: parseFloat(deliveryRate),
                read_rate: parseFloat(readRate),
                total: messagesByType.length,
            },
        });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/analytics/broadcasts
 * Get broadcast analytics
 */
router.get('/broadcasts', authenticate, async (req, res, next) => {
    try {
        const { workspace_id, period = '30d' } = req.query;

        if (!workspace_id) {
            throw new AppError('workspace_id is required', 400);
        }

        const days = parseInt(period.replace('d', ''));
        const fromDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

        // Campaigns by status
        const { data: campaigns } = await supabaseAdmin
            .from('broadcast_campaigns')
            .select('*')
            .eq('workspace_id', workspace_id)
            .gte('created_at', fromDate);

        const statusCounts = campaigns.reduce((acc, campaign) => {
            acc[campaign.status] = (acc[campaign.status] || 0) + 1;
            return acc;
        }, {});

        // Aggregate stats
        const totalSent = campaigns.reduce((sum, c) => sum + (c.sent_count || 0), 0);
        const totalDelivered = campaigns.reduce((sum, c) => sum + (c.delivered_count || 0), 0);
        const totalRead = campaigns.reduce((sum, c) => sum + (c.read_count || 0), 0);
        const totalFailed = campaigns.reduce((sum, c) => sum + (c.failed_count || 0), 0);

        const deliveryRate = totalSent > 0 ? ((totalDelivered / totalSent) * 100).toFixed(2) : 0;
        const readRate = totalSent > 0 ? ((totalRead / totalSent) * 100).toFixed(2) : 0;
        const failureRate = totalSent > 0 ? ((totalFailed / totalSent) * 100).toFixed(2) : 0;

        res.json({
            broadcasts: {
                total_campaigns: campaigns.length,
                by_status: statusCounts,
                total_sent: totalSent,
                total_delivered: totalDelivered,
                total_read: totalRead,
                total_failed: totalFailed,
                delivery_rate: parseFloat(deliveryRate),
                read_rate: parseFloat(readRate),
                failure_rate: parseFloat(failureRate),
            },
        });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/analytics/bots/:id
 * Get bot-specific analytics
 */
router.get('/bots/:id', authenticate, async (req, res, next) => {
    try {
        const { period = '30d' } = req.query;

        const days = parseInt(period.replace('d', ''));
        const fromDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

        // Total conversations handled
        const { count: totalConversations } = await supabaseAdmin
            .from('conversations')
            .select('*', { count: 'exact', head: true })
            .eq('bot_id', req.params.id)
            .gte('created_at', fromDate);

        // Conversations by status
        const { data: conversationsByStatus } = await supabaseAdmin
            .from('conversations')
            .select('status')
            .eq('bot_id', req.params.id)
            .gte('created_at', fromDate);

        const statusCounts = conversationsByStatus.reduce((acc, conv) => {
            acc[conv.status] = (acc[conv.status] || 0) + 1;
            return acc;
        }, {});

        // Human takeover rate
        const humanTakeovers = statusCounts.human || 0;
        const takeoverRate = totalConversations > 0
            ? ((humanTakeovers / totalConversations) * 100).toFixed(2)
            : 0;

        res.json({
            bot_analytics: {
                total_conversations: totalConversations,
                by_status: statusCounts,
                human_takeover_rate: parseFloat(takeoverRate),
            },
        });
    } catch (error) {
        next(error);
    }
});

export default router;
