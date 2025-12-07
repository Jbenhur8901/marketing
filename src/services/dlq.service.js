import { supabaseAdmin } from '../config/supabase.js';
import { logger } from '../utils/logger.js';
import { WhatsAppService } from './whatsapp.service.js';
import { BroadcastService } from './broadcast.service.js';

/**
 * Dead Letter Queue Service
 * Handles failed messages and retry logic
 */
export class DLQService {
    /**
     * Add message to DLQ
     * @param {string} workspaceId - Workspace ID
     * @param {string} messageType - Type of message (broadcast, conversation, whatsapp_send)
     * @param {Object} payload - Original message payload
     * @param {Error} error - Error that occurred
     * @param {number} maxRetries - Maximum retry attempts (default 3)
     */
    static async addToDLQ(workspaceId, messageType, payload, error, maxRetries = 3) {
        try {
            // Extract error details
            const errorCode = error.response?.data?.error?.code || error.code || 'UNKNOWN';
            const errorMessage = error.response?.data?.error?.message || error.message || 'Unknown error';
            const errorDetails = {
                stack: error.stack,
                response: error.response?.data,
                status: error.response?.status,
            };

            // Calculate next retry time
            const { data: nextRetry } = await supabaseAdmin
                .rpc('calculate_next_retry', { retry_count: 0 });

            const { data, error: insertError } = await supabaseAdmin
                .from('dead_letter_queue')
                .insert({
                    workspace_id: workspaceId,
                    message_type: messageType,
                    original_payload: payload,
                    error_code: errorCode,
                    error_message: errorMessage,
                    error_details: errorDetails,
                    retry_count: 0,
                    max_retries: maxRetries,
                    next_retry_at: nextRetry,
                    status: 'retrying',
                })
                .select()
                .single();

            if (insertError) {
                logger.error(`Failed to add to DLQ: ${insertError.message}`);
                return null;
            }

            logger.info(`Added to DLQ: ${messageType} (ID: ${data.id})`);
            return data;
        } catch (err) {
            logger.error(`DLQ insertion error: ${err.message}`);
            return null;
        }
    }

    /**
     * Process DLQ retries
     * Called by scheduler to retry failed messages
     */
    static async processRetries() {
        try {
            const now = new Date().toISOString();

            // Get messages ready for retry
            const { data: entries, error } = await supabaseAdmin
                .from('dead_letter_queue')
                .select('*')
                .eq('status', 'retrying')
                .lte('next_retry_at', now)
                .lt('retry_count', supabaseAdmin.raw('max_retries'))
                .order('next_retry_at', { ascending: true })
                .limit(50);

            if (error) {
                logger.error(`Failed to fetch DLQ entries: ${error.message}`);
                return;
            }

            if (!entries || entries.length === 0) {
                return; // No entries to retry
            }

            logger.info(`📨 Processing ${entries.length} DLQ retries`);

            for (const entry of entries) {
                try {
                    // Attempt retry based on message type
                    let success = false;

                    switch (entry.message_type) {
                        case 'broadcast':
                            success = await this.retryBroadcast(entry);
                            break;
                        case 'whatsapp_send':
                            success = await this.retryWhatsAppMessage(entry);
                            break;
                        default:
                            logger.warn(`Unknown DLQ message type: ${entry.message_type}`);
                            continue;
                    }

                    if (success) {
                        // Mark as resolved
                        await supabaseAdmin
                            .from('dead_letter_queue')
                            .update({
                                status: 'resolved',
                                resolved_at: new Date().toISOString(),
                            })
                            .eq('id', entry.id);

                        logger.info(`✅ DLQ entry ${entry.id} resolved`);
                    } else {
                        // Increment retry count
                        const newRetryCount = entry.retry_count + 1;

                        if (newRetryCount >= entry.max_retries) {
                            // Max retries reached, mark as failed
                            await supabaseAdmin
                                .from('dead_letter_queue')
                                .update({
                                    status: 'failed',
                                    retry_count: newRetryCount,
                                })
                                .eq('id', entry.id);

                            logger.warn(`❌ DLQ entry ${entry.id} exhausted retries`);
                        } else {
                            // Schedule next retry
                            const { data: nextRetry } = await supabaseAdmin
                                .rpc('calculate_next_retry', { retry_count: newRetryCount });

                            await supabaseAdmin
                                .from('dead_letter_queue')
                                .update({
                                    retry_count: newRetryCount,
                                    last_retry_at: new Date().toISOString(),
                                    next_retry_at: nextRetry,
                                })
                                .eq('id', entry.id);

                            logger.info(`🔄 DLQ entry ${entry.id} retry scheduled (attempt ${newRetryCount}/${entry.max_retries})`);
                        }
                    }
                } catch (err) {
                    logger.error(`Failed to process DLQ entry ${entry.id}: ${err.message}`);
                }
            }
        } catch (error) {
            logger.error(`DLQ retry processing error: ${error.message}`);
        }
    }

    /**
     * Retry a failed broadcast message
     */
    static async retryBroadcast(entry) {
        try {
            const { workspace_id, phone_number, message } = entry.original_payload;

            // Get workspace details
            const { data: workspace } = await supabaseAdmin
                .from('workspaces')
                .select('*')
                .eq('id', workspace_id)
                .single();

            if (!workspace) {
                logger.error('Workspace not found for DLQ entry');
                return false;
            }

            const whatsapp = new WhatsAppService(
                workspace.whatsapp_phone_number_id,
                workspace.whatsapp_access_token
            );

            // Retry sending
            await whatsapp.sendText(phone_number, message);

            return true;
        } catch (error) {
            logger.error(`Broadcast retry failed: ${error.message}`);
            return false;
        }
    }

    /**
     * Retry a failed WhatsApp message
     */
    static async retryWhatsAppMessage(entry) {
        try {
            const { workspace_id, to, message, type = 'text', media_url } = entry.original_payload;

            // Get workspace details
            const { data: workspace } = await supabaseAdmin
                .from('workspaces')
                .select('*')
                .eq('id', workspace_id)
                .single();

            if (!workspace) {
                logger.error('Workspace not found for DLQ entry');
                return false;
            }

            const whatsapp = new WhatsAppService(
                workspace.whatsapp_phone_number_id,
                workspace.whatsapp_access_token
            );

            // Retry sending based on type
            if (type === 'text') {
                await whatsapp.sendText(to, message);
            } else {
                await whatsapp.sendMedia(to, type, media_url, message);
            }

            return true;
        } catch (error) {
            logger.error(`WhatsApp message retry failed: ${error.message}`);
            return false;
        }
    }

    /**
     * Manually retry a DLQ entry
     */
    static async manualRetry(dlqId) {
        try {
            const { data: entry, error } = await supabaseAdmin
                .from('dead_letter_queue')
                .select('*')
                .eq('id', dlqId)
                .single();

            if (error || !entry) {
                throw new Error('DLQ entry not found');
            }

            // Reset retry count and schedule immediate retry
            await supabaseAdmin
                .from('dead_letter_queue')
                .update({
                    status: 'retrying',
                    retry_count: 0,
                    next_retry_at: new Date().toISOString(),
                })
                .eq('id', dlqId);

            logger.info(`Manual retry scheduled for DLQ entry ${dlqId}`);

            // Trigger immediate processing
            await this.processRetries();

            return true;
        } catch (error) {
            logger.error(`Manual retry error: ${error.message}`);
            throw error;
        }
    }

    /**
     * Archive a DLQ entry (give up on retrying)
     */
    static async archiveEntry(dlqId) {
        await supabaseAdmin
            .from('dead_letter_queue')
            .update({ status: 'archived' })
            .eq('id', dlqId);

        logger.info(`DLQ entry ${dlqId} archived`);
    }

    /**
     * Get DLQ statistics
     */
    static async getStats(workspaceId) {
        const { data, error } = await supabaseAdmin
            .from('dead_letter_queue')
            .select('status')
            .eq('workspace_id', workspaceId);

        if (error) {
            throw new Error(error.message);
        }

        const stats = {
            total: data.length,
            failed: data.filter(e => e.status === 'failed').length,
            retrying: data.filter(e => e.status === 'retrying').length,
            resolved: data.filter(e => e.status === 'resolved').length,
            archived: data.filter(e => e.status === 'archived').length,
        };

        return stats;
    }
}
