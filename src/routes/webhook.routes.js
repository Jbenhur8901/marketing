import express from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { WhatsAppService } from '../services/whatsapp.service.js';
import { FlowEngine } from '../services/flowEngine.service.js';
import { logger } from '../utils/logger.js';
import { config } from '../config/config.js';
import { webhookLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();

/**
 * GET /api/whatsapp/webhook
 * Verify webhook (Meta requirement)
 */
router.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === config.whatsapp.verifyToken) {
        logger.info('Webhook verified');
        res.status(200).send(challenge);
    } else {
        logger.warn('Webhook verification failed');
        res.status(403).send('Forbidden');
    }
});

/**
 * POST /api/whatsapp/webhook
 * Receive WhatsApp webhooks
 */
router.post('/webhook', webhookLimiter, async (req, res) => {
    try {
        const signature = req.headers['x-hub-signature-256'];

        // Get raw body for signature verification
        let payload;
        let body;

        if (Buffer.isBuffer(req.body)) {
            // If raw body middleware was applied
            payload = req.body.toString('utf8');
            body = JSON.parse(payload);
        } else {
            // If already parsed as JSON
            payload = JSON.stringify(req.body);
            body = req.body;
        }

        // Verify webhook signature (REQUIRED for security)
        if (!WhatsAppService.verifyWebhookSignature(payload, signature)) {
            logger.warn('Webhook signature verification failed');
            return res.status(403).json({ error: 'Invalid signature' });
        }

        logger.info('Webhook signature verified successfully');

        // Send 200 immediately to acknowledge receipt
        res.sendStatus(200);

        // Process webhook asynchronously
        processWebhook(body).catch(error => {
            logger.error(`Webhook processing error: ${error.message}`);
        });

    } catch (error) {
        logger.error(`Webhook error: ${error.message}`);
        res.sendStatus(200); // Still acknowledge to prevent retries
    }
});

/**
 * Process webhook data
 */
async function processWebhook(body) {
    try {
        // Extract entry data
        const entry = body.entry?.[0];
        const changes = entry?.changes?.[0];
        const value = changes?.value;

        if (!value) {
            logger.warn('No value in webhook');
            return;
        }

        // Get phone number ID to identify workspace
        const phoneNumberId = value.metadata?.phone_number_id;

        if (!phoneNumberId) {
            logger.warn('No phone number ID in webhook');
            return;
        }

        // Find workspace
        const { data: workspace } = await supabaseAdmin
            .from('workspaces')
            .select('*')
            .eq('whatsapp_phone_number_id', phoneNumberId)
            .single();

        if (!workspace) {
            logger.warn(`No workspace found for phone number ${phoneNumberId}`);
            return;
        }

        // Handle different webhook types
        if (value.messages) {
            await handleIncomingMessages(workspace, value.messages);
        }

        if (value.statuses) {
            await handleMessageStatuses(value.statuses);
        }

    } catch (error) {
        logger.error(`Process webhook error: ${error.message}`);
    }
}

/**
 * Handle incoming messages
 */
async function handleIncomingMessages(workspace, messages) {
    for (const message of messages) {
        try {
            const from = message.from; // Sender's phone number
            const messageType = message.type;
            let content = '';

            // Extract content based on type
            if (messageType === 'text') {
                content = message.text?.body;
            } else if (messageType === 'image') {
                content = message.image?.caption || '[Image]';
            } else if (messageType === 'video') {
                content = message.video?.caption || '[Video]';
            } else if (messageType === 'document') {
                content = message.document?.filename || '[Document]';
            } else if (messageType === 'audio') {
                content = '[Audio]';
            } else if (messageType === 'interactive') {
                content = message.interactive?.button_reply?.title || message.interactive?.list_reply?.title;
            }

            // Find or create contact
            let { data: contact } = await supabaseAdmin
                .from('contacts')
                .select('*')
                .eq('workspace_id', workspace.id)
                .eq('phone', from)
                .single();

            if (!contact) {
                const { data: newContact } = await supabaseAdmin
                    .from('contacts')
                    .insert({
                        workspace_id: workspace.id,
                        phone: from,
                        wa_id: message.from,
                        whatsapp_verified: true,
                        whatsapp_verified_at: new Date().toISOString(),
                    })
                    .select()
                    .single();

                contact = newContact;
            }

            // Update last_message_at
            await supabaseAdmin
                .from('contacts')
                .update({ last_message_at: new Date().toISOString() })
                .eq('id', contact.id);

            // Find or create conversation
            let { data: conversation } = await supabaseAdmin
                .from('conversations')
                .select('*')
                .eq('workspace_id', workspace.id)
                .eq('contact_id', contact.id)
                .neq('status', 'closed')
                .order('created_at', { ascending: false })
                .limit(1)
                .single();

            if (!conversation) {
                // Find active bot
                const { data: activeBot } = await supabaseAdmin
                    .from('bots')
                    .select('*')
                    .eq('workspace_id', workspace.id)
                    .eq('status', 'active')
                    .limit(1)
                    .single();

                const { data: newConversation } = await supabaseAdmin
                    .from('conversations')
                    .insert({
                        workspace_id: workspace.id,
                        contact_id: contact.id,
                        contact_phone: from,
                        bot_id: activeBot?.id || null,
                        status: activeBot ? 'bot' : 'human',
                    })
                    .select()
                    .single();

                conversation = newConversation;
            }

            // Update conversation last_message_at
            await supabaseAdmin
                .from('conversations')
                .update({ last_message_at: new Date().toISOString() })
                .eq('id', conversation.id);

            // Save message
            await supabaseAdmin.from('messages').insert({
                conversation_id: conversation.id,
                whatsapp_message_id: message.id,
                direction: 'incoming',
                content,
                type: messageType,
                status: 'received',
            });

            // If conversation is in bot mode, execute flow
            if (conversation.status === 'bot' && conversation.bot_id) {
                await executeBot(workspace, conversation, { text: content, type: messageType });
            }

        } catch (error) {
            logger.error(`Handle message error: ${error.message}`);
        }
    }
}

/**
 * Handle message status updates
 */
async function handleMessageStatuses(statuses) {
    for (const status of statuses) {
        try {
            const messageId = status.id;
            const statusValue = status.status; // sent, delivered, read, failed

            await supabaseAdmin
                .from('messages')
                .update({ status: statusValue })
                .eq('whatsapp_message_id', messageId);

            // Update broadcast message status if exists
            await supabaseAdmin
                .from('broadcast_messages')
                .update({
                    status: statusValue,
                    ...(statusValue === 'delivered' && { delivered_at: new Date().toISOString() }),
                    ...(statusValue === 'read' && { read_at: new Date().toISOString() }),
                })
                .eq('whatsapp_message_id', messageId);

            // Update broadcast campaign stats
            if (statusValue === 'delivered' || statusValue === 'read') {
                const { data: broadcastMessage } = await supabaseAdmin
                    .from('broadcast_messages')
                    .select('campaign_id')
                    .eq('whatsapp_message_id', messageId)
                    .single();

                if (broadcastMessage) {
                    const field = statusValue === 'delivered' ? 'delivered_count' : 'read_count';

                    await supabaseAdmin.rpc('increment_campaign_stat', {
                        campaign_id: broadcastMessage.campaign_id,
                        field,
                    });
                }
            }

        } catch (error) {
            logger.error(`Handle status error: ${error.message}`);
        }
    }
}

/**
 * Execute bot flow
 */
async function executeBot(workspace, conversation, message) {
    try {
        // Get bot
        const { data: bot } = await supabaseAdmin
            .from('bots')
            .select('*')
            .eq('id', conversation.bot_id)
            .single();

        if (!bot) {
            logger.warn(`Bot ${conversation.bot_id} not found`);
            return;
        }

        // Get or create context
        let { data: context } = await supabaseAdmin
            .from('conversation_contexts')
            .select('*')
            .eq('conversation_id', conversation.id)
            .single();

        if (!context) {
            const { data: newContext } = await supabaseAdmin
                .from('conversation_contexts')
                .insert({
                    conversation_id: conversation.id,
                    bot_id: bot.id,
                    variables: {},
                    flow_history: [],
                })
                .select()
                .single();

            context = newContext;
        }

        // Execute flow
        const engine = new FlowEngine(workspace, conversation, context);
        await engine.execute(bot, message);

    } catch (error) {
        logger.error(`Execute bot error: ${error.message}`);
    }
}

export default router;
