import { supabaseAdmin } from '../config/supabase.js';
import { WhatsAppService, interpolateVariables } from './whatsapp.service.js';
import { logger } from '../utils/logger.js';
import { config } from '../config/config.js';

export class BroadcastService {
    /**
     * Start broadcast campaign
     */
    static async startCampaign(campaignId) {
        try {
            // Get campaign details
            const { data: campaign, error: campaignError } = await supabaseAdmin
                .from('broadcast_campaigns')
                .select('*, workspace:workspaces(*)')
                .eq('id', campaignId)
                .single();

            if (campaignError || !campaign) {
                throw new Error('Campaign not found');
            }

            // Check if scheduled
            if (campaign.scheduled_at && new Date(campaign.scheduled_at) > new Date()) {
                logger.info(`Campaign ${campaignId} is scheduled for later`);
                return;
            }

            // Update status to processing
            await supabaseAdmin
                .from('broadcast_campaigns')
                .update({
                    status: 'processing',
                    started_at: new Date().toISOString(),
                })
                .eq('id', campaignId);

            // Get target contacts
            const contacts = await this.getTargetContacts(campaign);

            if (contacts.length === 0) {
                throw new Error('No contacts found for this campaign');
            }

            // Update total recipients
            await supabaseAdmin
                .from('broadcast_campaigns')
                .update({ total_recipients: contacts.length })
                .eq('id', campaignId);

            // Create broadcast messages
            const messages = contacts.map(contact => ({
                campaign_id: campaignId,
                contact_id: contact.id,
                contact_phone: contact.phone,
                message_content: this.interpolateContactVariables(
                    campaign.message_content,
                    contact
                ),
                status: 'pending',
            }));

            await supabaseAdmin.from('broadcast_messages').insert(messages);

            // Process messages asynchronously
            this.processCampaign(campaignId).catch(err => {
                logger.error(`Campaign ${campaignId} failed: ${err.message}`);
            });

        } catch (error) {
            logger.error(`Failed to start campaign ${campaignId}: ${error.message}`);

            await supabaseAdmin
                .from('broadcast_campaigns')
                .update({
                    status: 'failed',
                    completed_at: new Date().toISOString(),
                })
                .eq('id', campaignId);
        }
    }

    /**
     * Process campaign messages
     */
    static async processCampaign(campaignId) {
        try {
            // Get campaign
            const { data: campaign } = await supabaseAdmin
                .from('broadcast_campaigns')
                .select('*, workspace:workspaces(*)')
                .eq('id', campaignId)
                .single();

            if (!campaign.workspace.whatsapp_phone_number_id || !campaign.workspace.whatsapp_access_token) {
                throw new Error('WhatsApp not configured');
            }

            const whatsapp = new WhatsAppService(
                campaign.workspace.whatsapp_phone_number_id,
                campaign.workspace.whatsapp_access_token
            );

            const rateLimit = campaign.rate_limit || config.broadcast.defaultRateLimit;
            const delayMs = 1000 / rateLimit;

            let sentCount = 0;
            let deliveredCount = 0;
            let failedCount = 0;

            while (true) {
                // Check if paused or cancelled
                const { data: currentCampaign } = await supabaseAdmin
                    .from('broadcast_campaigns')
                    .select('status')
                    .eq('id', campaignId)
                    .single();

                if (currentCampaign.status === 'paused') {
                    logger.info(`Campaign ${campaignId} paused`);
                    return;
                }

                if (currentCampaign.status === 'cancelled') {
                    logger.info(`Campaign ${campaignId} cancelled`);
                    return;
                }

                // Get next batch of pending messages
                const { data: messages } = await supabaseAdmin
                    .from('broadcast_messages')
                    .select('*')
                    .eq('campaign_id', campaignId)
                    .eq('status', 'pending')
                    .limit(10);

                if (!messages || messages.length === 0) {
                    break; // All messages processed
                }

                // Process each message
                for (const message of messages) {
                    try {
                        // Send message with retry
                        const result = await WhatsAppService.withRetry(async () => {
                            return await whatsapp.sendText(message.contact_phone, message.message_content);
                        });

                        // Update message status
                        await supabaseAdmin
                            .from('broadcast_messages')
                            .update({
                                status: 'sent',
                                whatsapp_message_id: result.messages?.[0]?.id,
                                sent_at: new Date().toISOString(),
                            })
                            .eq('id', message.id);

                        sentCount++;

                        // Rate limiting
                        await this.sleep(delayMs);

                    } catch (error) {
                        logger.error(`Failed to send message to ${message.contact_phone}: ${error.message}`);

                        // Update message status
                        await supabaseAdmin
                            .from('broadcast_messages')
                            .update({
                                status: 'failed',
                                error_message: error.message,
                            })
                            .eq('id', message.id);

                        failedCount++;
                    }

                    // Update campaign stats
                    await supabaseAdmin
                        .from('broadcast_campaigns')
                        .update({
                            sent_count: sentCount,
                            failed_count: failedCount,
                        })
                        .eq('id', campaignId);

                    // Check failure threshold
                    const failureRate = (failedCount / (sentCount + failedCount)) * 100;
                    if (failureRate > config.broadcast.failureThreshold && (sentCount + failedCount) > 10) {
                        throw new Error(`Failure rate ${failureRate.toFixed(2)}% exceeded threshold`);
                    }
                }
            }

            // Complete campaign
            await supabaseAdmin
                .from('broadcast_campaigns')
                .update({
                    status: 'completed',
                    completed_at: new Date().toISOString(),
                })
                .eq('id', campaignId);

            logger.info(`Campaign ${campaignId} completed: ${sentCount} sent, ${failedCount} failed`);

        } catch (error) {
            logger.error(`Campaign ${campaignId} processing error: ${error.message}`);

            await supabaseAdmin
                .from('broadcast_campaigns')
                .update({
                    status: 'failed',
                    completed_at: new Date().toISOString(),
                })
                .eq('id', campaignId);
        }
    }

    /**
     * Get target contacts for campaign
     */
    static async getTargetContacts(campaign) {
        let query = supabaseAdmin
            .from('contacts')
            .select('*')
            .eq('workspace_id', campaign.workspace_id)
            .eq('opted_in', true)
            .eq('whatsapp_verified', true);

        if (campaign.target_type === 'specific' && campaign.target_filters?.contact_ids) {
            query = query.in('id', campaign.target_filters.contact_ids);
        }

        if (campaign.target_type === 'filtered') {
            const filters = campaign.target_filters || {};

            if (filters.tags && filters.tags.length > 0) {
                query = query.overlaps('tags', filters.tags);
            }

            if (filters.custom_fields) {
                for (const [key, value] of Object.entries(filters.custom_fields)) {
                    query = query.contains('custom_fields', { [key]: value });
                }
            }
        }

        const { data: contacts } = await query;
        return contacts || [];
    }

    /**
     * Interpolate contact variables in message
     */
    static interpolateContactVariables(template, contact) {
        const variables = {
            name: contact.name || '',
            phone: contact.phone || '',
            email: contact.email || '',
            ...contact.custom_fields,
        };

        return interpolateVariables(template, variables);
    }

    /**
     * Pause campaign
     */
    static async pauseCampaign(campaignId) {
        await supabaseAdmin
            .from('broadcast_campaigns')
            .update({ status: 'paused' })
            .eq('id', campaignId)
            .in('status', ['processing', 'scheduled']);
    }

    /**
     * Resume campaign
     */
    static async resumeCampaign(campaignId) {
        await supabaseAdmin
            .from('broadcast_campaigns')
            .update({ status: 'processing' })
            .eq('id', campaignId)
            .eq('status', 'paused');

        // Restart processing
        this.processCampaign(campaignId).catch(err => {
            logger.error(`Campaign ${campaignId} resume failed: ${err.message}`);
        });
    }

    /**
     * Cancel campaign
     */
    static async cancelCampaign(campaignId) {
        await supabaseAdmin
            .from('broadcast_campaigns')
            .update({
                status: 'cancelled',
                completed_at: new Date().toISOString(),
            })
            .eq('id', campaignId)
            .in('status', ['processing', 'scheduled', 'paused']);
    }

    /**
     * Sleep utility
     */
    static sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
