import cron from 'node-cron';
import { supabaseAdmin } from '../config/supabase.js';
import { logger } from '../utils/logger.js';
import { BroadcastService } from './broadcast.service.js';
import { DLQService } from './dlq.service.js';

/**
 * Scheduler Service - Handles scheduled tasks
 * - Triggers scheduled broadcast campaigns
 * - Processes delayed flow engine nodes
 * - Cleans up expired data
 */
export class SchedulerService {
    static jobs = [];

    /**
     * Initialize all scheduled tasks
     */
    static init() {
        logger.info('🕐 Initializing Scheduler Service...');

        // Check for scheduled broadcasts every minute
        const broadcastJob = cron.schedule('* * * * *', async () => {
            await this.checkScheduledBroadcasts();
        });
        this.jobs.push({ name: 'scheduled-broadcasts', job: broadcastJob });

        // Check for delayed flow nodes every minute
        const flowDelayJob = cron.schedule('* * * * *', async () => {
            await this.processDelayedFlowNodes();
        });
        this.jobs.push({ name: 'delayed-flow-nodes', job: flowDelayJob });

        // Clean up expired verification cache daily at 2 AM
        const cleanupJob = cron.schedule('0 2 * * *', async () => {
            await this.cleanupExpiredCache();
        });
        this.jobs.push({ name: 'cache-cleanup', job: cleanupJob });

        // Process DLQ retries every 5 minutes
        const dlqJob = cron.schedule('*/5 * * * *', async () => {
            await DLQService.processRetries();
        });
        this.jobs.push({ name: 'dlq-retries', job: dlqJob });

        logger.info(`✅ Scheduler initialized with ${this.jobs.length} jobs`);
    }

    /**
     * Check and trigger scheduled broadcast campaigns
     */
    static async checkScheduledBroadcasts() {
        try {
            const now = new Date().toISOString();

            // Find campaigns that are scheduled and due to start
            const { data: campaigns, error } = await supabaseAdmin
                .from('broadcast_campaigns')
                .select('id, name, scheduled_at')
                .eq('status', 'scheduled')
                .lte('scheduled_at', now)
                .order('scheduled_at', { ascending: true });

            if (error) {
                logger.error(`Error fetching scheduled broadcasts: ${error.message}`);
                return;
            }

            if (!campaigns || campaigns.length === 0) {
                return; // No campaigns to trigger
            }

            logger.info(`📤 Found ${campaigns.length} scheduled broadcast(s) to trigger`);

            // Trigger each campaign
            for (const campaign of campaigns) {
                try {
                    logger.info(`Starting scheduled campaign: ${campaign.name} (ID: ${campaign.id})`);
                    await BroadcastService.startCampaign(campaign.id);
                } catch (err) {
                    logger.error(`Failed to start campaign ${campaign.id}: ${err.message}`);
                }
            }
        } catch (error) {
            logger.error(`Scheduled broadcasts check error: ${error.message}`);
        }
    }

    /**
     * Process delayed flow engine nodes
     * This handles long delays in bot flows (e.g., "wait 1 day")
     */
    static async processDelayedFlowNodes() {
        try {
            const now = new Date().toISOString();

            // Find conversation contexts with delayed nodes ready to resume
            const { data: contexts, error } = await supabaseAdmin
                .from('conversation_contexts')
                .select(`
                    id,
                    conversation_id,
                    bot_id,
                    current_node_id,
                    waiting_for,
                    variables,
                    flow_history,
                    conversations (
                        id,
                        workspace_id,
                        contact_id,
                        contact_phone
                    )
                `)
                .not('variables->>resume_at', 'is', null)
                .lte('variables->>resume_at', now)
                .limit(100);

            if (error) {
                logger.error(`Error fetching delayed flow nodes: ${error.message}`);
                return;
            }

            if (!contexts || contexts.length === 0) {
                return; // No delayed nodes to process
            }

            logger.info(`🤖 Found ${contexts.length} delayed flow node(s) to resume`);

            // Process each context
            for (const context of contexts) {
                try {
                    // Import FlowEngine dynamically to avoid circular dependency
                    const { FlowEngine } = await import('./flowEngine.service.js');

                    // Remove the resume_at flag
                    const updatedVariables = { ...context.variables };
                    delete updatedVariables.resume_at;

                    // Update context to remove resume_at
                    await supabaseAdmin
                        .from('conversation_contexts')
                        .update({ variables: updatedVariables })
                        .eq('id', context.id);

                    // Get bot and workspace details
                    const { data: bot } = await supabaseAdmin
                        .from('bots')
                        .select('*, workspace:workspaces(*)')
                        .eq('id', context.bot_id)
                        .single();

                    if (!bot || !bot.workspace) {
                        logger.error(`Bot or workspace not found for context ${context.id}`);
                        continue;
                    }

                    // Prepare context object
                    const flowContext = {
                        bot_id: context.bot_id,
                        current_node_id: context.current_node_id,
                        waiting_for: context.waiting_for,
                        variables: updatedVariables,
                        flow_history: context.flow_history || [],
                    };

                    // Resume flow execution from the current node
                    logger.info(`Resuming flow for conversation ${context.conversation_id}`);
                    const flowEngine = new FlowEngine(
                        bot.workspace,
                        context.conversations,
                        flowContext
                    );
                    await flowEngine.execute(bot, null);
                } catch (err) {
                    logger.error(`Failed to resume flow for context ${context.id}: ${err.message}`);
                }
            }
        } catch (error) {
            logger.error(`Delayed flow nodes processing error: ${error.message}`);
        }
    }

    /**
     * Clean up expired verification cache
     */
    static async cleanupExpiredCache() {
        try {
            logger.info('🧹 Running verification cache cleanup...');

            const { data, error } = await supabaseAdmin
                .from('number_verification_results')
                .delete()
                .lt('cache_expires_at', new Date().toISOString());

            if (error) {
                logger.error(`Cache cleanup error: ${error.message}`);
                return;
            }

            logger.info(`✅ Cache cleanup completed`);
        } catch (error) {
            logger.error(`Cache cleanup error: ${error.message}`);
        }
    }

    /**
     * Stop all scheduled jobs
     */
    static stop() {
        logger.info('⏹️ Stopping all scheduled jobs...');
        this.jobs.forEach(({ name, job }) => {
            job.stop();
            logger.info(`Stopped job: ${name}`);
        });
        this.jobs = [];
    }

    /**
     * Get status of all jobs
     */
    static getStatus() {
        return this.jobs.map(({ name, job }) => ({
            name,
            running: job.running || false,
        }));
    }
}
