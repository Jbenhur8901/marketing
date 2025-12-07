import { supabaseAdmin } from '../config/supabase.js';
import { WhatsAppService } from './whatsapp.service.js';
import { logger } from '../utils/logger.js';
import { config } from '../config/config.js';

export class BulkVerificationService {
    /**
     * Start bulk verification job
     */
    static async startJob(workspaceId, phoneNumbers, autoAddToContacts, userId) {
        // Create job
        const { data: job, error: jobError } = await supabaseAdmin
            .from('bulk_verification_jobs')
            .insert({
                workspace_id: workspaceId,
                created_by: userId,
                total_numbers: phoneNumbers.length,
                auto_add_to_contacts: autoAddToContacts,
                status: 'pending',
            })
            .select()
            .single();

        if (jobError) {
            logger.error(`Supabase bulk_verification_jobs insert error: ${JSON.stringify(jobError)}`);
            throw new Error(`Failed to create verification job: ${jobError.message || jobError.code || JSON.stringify(jobError)}`);
        }

        // Start processing asynchronously
        this.processJob(job.id, workspaceId, phoneNumbers).catch(err => {
            logger.error(`Bulk verification job ${job.id} failed: ${err.message}`);
        });

        return job;
    }

    /**
     * Process verification job
     */
    static async processJob(jobId, workspaceId, phoneNumbers) {
        try {
            // Update status to processing
            await supabaseAdmin
                .from('bulk_verification_jobs')
                .update({ status: 'processing' })
                .eq('id', jobId);

            // Get workspace WhatsApp credentials
            const { data: workspace } = await supabaseAdmin
                .from('workspaces')
                .select('whatsapp_phone_number_id, whatsapp_access_token')
                .eq('id', workspaceId)
                .single();

            if (!workspace?.whatsapp_phone_number_id || !workspace?.whatsapp_access_token) {
                throw new Error('WhatsApp not configured for this workspace');
            }

            // Validate phone numbers and filter duplicates
            const validNumbers = [...new Set(phoneNumbers.filter(this.validateE164))];

            // Check cache first
            const cacheResults = await this.checkCache(workspaceId, validNumbers);
            const numbersToVerify = validNumbers.filter(
                num => !cacheResults.some(r => r.phone === num)
            );

            let verifiedCount = cacheResults.filter(r => r.whatsapp_exists).length;
            let failedCount = cacheResults.filter(r => !r.whatsapp_exists).length;

            // Insert cached results
            if (cacheResults.length > 0) {
                await supabaseAdmin.from('number_verification_results').insert(
                    cacheResults.map(r => ({
                        job_id: jobId,
                        workspace_id: workspaceId,
                        phone: r.phone,
                        format_valid: true,
                        whatsapp_exists: r.whatsapp_exists,
                        wa_id: r.wa_id,
                        status: r.whatsapp_exists ? 'verified' : 'failed',
                        verified_at: new Date().toISOString(),
                        cache_expires_at: new Date(Date.now() + config.cache.verificationCacheDays * 24 * 60 * 60 * 1000).toISOString(),
                    }))
                );
            }

            // Process remaining numbers in chunks
            const chunkSize = config.bulkVerification.chunkSize;
            const chunks = this.chunkArray(numbersToVerify, chunkSize);

            for (let i = 0; i < chunks.length; i++) {
                const chunk = chunks[i];

                try {
                    // Rate limiting - wait between requests
                    if (i > 0) {
                        await this.sleep(1000 / config.bulkVerification.rateLimit);
                    }

                    // Verify chunk
                    const results = await WhatsAppService.verifyNumbers(
                        workspace.whatsapp_phone_number_id,
                        workspace.whatsapp_access_token,
                        chunk
                    );

                    // Process results
                    for (const phone of chunk) {
                        const result = results.find(r => r.input === phone);
                        const exists = !!result?.wa_id;

                        if (exists) verifiedCount++;
                        else failedCount++;

                        // Insert result
                        await supabaseAdmin.from('number_verification_results').insert({
                            job_id: jobId,
                            workspace_id: workspaceId,
                            phone,
                            format_valid: true,
                            whatsapp_exists: exists,
                            wa_id: result?.wa_id || null,
                            status: exists ? 'verified' : 'failed',
                            verified_at: new Date().toISOString(),
                            cache_expires_at: new Date(Date.now() + config.cache.verificationCacheDays * 24 * 60 * 60 * 1000).toISOString(),
                        });

                        // Auto-add to contacts if enabled
                        if (autoAddToContacts && exists) {
                            await this.addToContacts(workspaceId, phone, result.wa_id);
                        }
                    }

                    // Update progress
                    await supabaseAdmin
                        .from('bulk_verification_jobs')
                        .update({
                            processed_count: (cacheResults.length + (i + 1) * chunk.length),
                            verified_count: verifiedCount,
                            failed_count: failedCount,
                        })
                        .eq('id', jobId);

                } catch (error) {
                    logger.error(`Chunk ${i} verification failed: ${error.message}`);

                    // Mark chunk as failed
                    for (const phone of chunk) {
                        await supabaseAdmin.from('number_verification_results').insert({
                            job_id: jobId,
                            workspace_id: workspaceId,
                            phone,
                            format_valid: true,
                            whatsapp_exists: false,
                            status: 'failed',
                            error_message: error.message,
                            verified_at: new Date().toISOString(),
                        });
                    }

                    failedCount += chunk.length;
                }
            }

            // Complete job
            await supabaseAdmin
                .from('bulk_verification_jobs')
                .update({
                    status: 'completed',
                    processed_count: validNumbers.length,
                    verified_count: verifiedCount,
                    failed_count: failedCount,
                    completed_at: new Date().toISOString(),
                    results_summary: {
                        total: validNumbers.length,
                        verified: verifiedCount,
                        failed: failedCount,
                        from_cache: cacheResults.length,
                    },
                })
                .eq('id', jobId);

            logger.info(`Bulk verification job ${jobId} completed`);

        } catch (error) {
            logger.error(`Bulk verification job ${jobId} error: ${error.message}`);

            await supabaseAdmin
                .from('bulk_verification_jobs')
                .update({
                    status: 'failed',
                    completed_at: new Date().toISOString(),
                    results_summary: { error: error.message },
                })
                .eq('id', jobId);
        }
    }

    /**
     * Check cache for previously verified numbers
     */
    static async checkCache(workspaceId, phoneNumbers) {
        const { data: cached } = await supabaseAdmin
            .from('number_verification_results')
            .select('phone, whatsapp_exists, wa_id')
            .eq('workspace_id', workspaceId)
            .in('phone', phoneNumbers)
            .gt('cache_expires_at', new Date().toISOString());

        return cached || [];
    }

    /**
     * Add verified number to contacts
     */
    static async addToContacts(workspaceId, phone, waId) {
        const { error } = await supabaseAdmin
            .from('contacts')
            .upsert({
                workspace_id: workspaceId,
                phone,
                wa_id: waId,
                whatsapp_verified: true,
                whatsapp_verified_at: new Date().toISOString(),
            }, {
                onConflict: 'workspace_id,phone',
                ignoreDuplicates: false,
            });

        if (error) {
            logger.error(`Failed to add contact ${phone}: ${error.message}`);
        }
    }

    /**
     * Validate E.164 format
     */
    static validateE164(phone) {
        return /^\+[1-9]\d{1,14}$/.test(phone);
    }

    /**
     * Chunk array
     */
    static chunkArray(array, size) {
        const chunks = [];
        for (let i = 0; i < array.length; i += size) {
            chunks.push(array.slice(i, i + size));
        }
        return chunks;
    }

    /**
     * Sleep utility
     */
    static sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
