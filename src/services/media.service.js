import { supabaseAdmin } from '../config/supabase.js';
import { logger } from '../utils/logger.js';
import { config } from '../config/config.js';
import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

/**
 * Media Storage Service
 * Handles uploading, downloading, and managing media files
 * Supports: Supabase Storage, Local File System
 */
export class MediaService {
    static STORAGE_TYPE = process.env.MEDIA_STORAGE || 'supabase'; // 'supabase' or 'local'
    static LOCAL_MEDIA_PATH = process.env.LOCAL_MEDIA_PATH || './media';
    static SUPABASE_BUCKET = process.env.SUPABASE_MEDIA_BUCKET || 'whatsapp-media';

    /**
     * Initialize media storage
     */
    static async init() {
        logger.info(`🗂️ Initializing media storage: ${this.STORAGE_TYPE}`);

        if (this.STORAGE_TYPE === 'local') {
            // Create media directories
            await this.ensureLocalDirectories();
        } else if (this.STORAGE_TYPE === 'supabase') {
            // Verify Supabase bucket exists
            await this.ensureSupabaseBucket();
        }

        logger.info('✅ Media storage initialized');
    }

    /**
     * Ensure local media directories exist
     */
    static async ensureLocalDirectories() {
        const dirs = [
            this.LOCAL_MEDIA_PATH,
            path.join(this.LOCAL_MEDIA_PATH, 'images'),
            path.join(this.LOCAL_MEDIA_PATH, 'videos'),
            path.join(this.LOCAL_MEDIA_PATH, 'documents'),
            path.join(this.LOCAL_MEDIA_PATH, 'audio'),
        ];

        for (const dir of dirs) {
            try {
                await fs.mkdir(dir, { recursive: true });
                logger.info(`Created directory: ${dir}`);
            } catch (error) {
                if (error.code !== 'EEXIST') {
                    logger.error(`Failed to create directory ${dir}: ${error.message}`);
                }
            }
        }
    }

    /**
     * Ensure Supabase bucket exists
     */
    static async ensureSupabaseBucket() {
        try {
            // Check if bucket exists
            const { data: buckets } = await supabaseAdmin.storage.listBuckets();
            const bucketExists = buckets?.some(b => b.name === this.SUPABASE_BUCKET);

            if (!bucketExists) {
                // Create bucket
                const { error } = await supabaseAdmin.storage.createBucket(this.SUPABASE_BUCKET, {
                    public: false,
                    fileSizeLimit: 104857600, // 100MB
                });

                if (error) {
                    logger.error(`Failed to create Supabase bucket: ${error.message}`);
                } else {
                    logger.info(`Created Supabase bucket: ${this.SUPABASE_BUCKET}`);
                }
            } else {
                logger.info(`Supabase bucket exists: ${this.SUPABASE_BUCKET}`);
            }
        } catch (error) {
            logger.error(`Supabase bucket check error: ${error.message}`);
        }
    }

    /**
     * Download media from WhatsApp and store it
     * @param {string} mediaId - WhatsApp media ID
     * @param {string} accessToken - WhatsApp access token
     * @param {string} mimeType - Media MIME type
     * @param {string} workspaceId - Workspace ID
     * @returns {Promise<{url: string, path: string}>}
     */
    static async downloadAndStoreWhatsAppMedia(mediaId, accessToken, mimeType, workspaceId) {
        try {
            // Step 1: Get media URL from WhatsApp
            const mediaUrlResponse = await axios.get(
                `${config.whatsapp.apiUrl}/${mediaId}`,
                {
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                    },
                }
            );

            const mediaUrl = mediaUrlResponse.data.url;

            if (!mediaUrl) {
                throw new Error('No media URL returned from WhatsApp');
            }

            // Step 2: Download media file
            const mediaBuffer = await axios.get(mediaUrl, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                },
                responseType: 'arraybuffer',
            });

            // Step 3: Generate filename
            const extension = this.getExtensionFromMimeType(mimeType);
            const filename = `${workspaceId}/${Date.now()}-${crypto.randomBytes(8).toString('hex')}.${extension}`;

            // Step 4: Store media
            if (this.STORAGE_TYPE === 'supabase') {
                return await this.uploadToSupabase(filename, Buffer.from(mediaBuffer.data), mimeType);
            } else {
                return await this.uploadToLocal(filename, Buffer.from(mediaBuffer.data));
            }

        } catch (error) {
            logger.error(`Failed to download WhatsApp media: ${error.message}`);
            throw new Error('Failed to download and store media');
        }
    }

    /**
     * Upload file to Supabase Storage
     */
    static async uploadToSupabase(filename, buffer, mimeType) {
        try {
            const { data, error } = await supabaseAdmin.storage
                .from(this.SUPABASE_BUCKET)
                .upload(filename, buffer, {
                    contentType: mimeType,
                    upsert: false,
                });

            if (error) {
                throw new Error(error.message);
            }

            // Get public URL
            const { data: urlData } = supabaseAdmin.storage
                .from(this.SUPABASE_BUCKET)
                .getPublicUrl(filename);

            logger.info(`Media uploaded to Supabase: ${filename}`);

            return {
                url: urlData.publicUrl,
                path: filename,
                storage: 'supabase',
            };
        } catch (error) {
            logger.error(`Supabase upload error: ${error.message}`);
            throw error;
        }
    }

    /**
     * Upload file to local file system
     */
    static async uploadToLocal(filename, buffer) {
        try {
            const filePath = path.join(this.LOCAL_MEDIA_PATH, filename);

            // Ensure directory exists
            await fs.mkdir(path.dirname(filePath), { recursive: true });

            // Write file
            await fs.writeFile(filePath, buffer);

            logger.info(`Media uploaded locally: ${filename}`);

            // Return relative URL (assuming server serves /media as static)
            return {
                url: `/media/${filename}`,
                path: filePath,
                storage: 'local',
            };
        } catch (error) {
            logger.error(`Local upload error: ${error.message}`);
            throw error;
        }
    }

    /**
     * Upload file from buffer (generic)
     * @param {Buffer} buffer - File buffer
     * @param {string} filename - Original filename
     * @param {string} mimeType - MIME type
     * @param {string} workspaceId - Workspace ID
     */
    static async uploadFromBuffer(buffer, filename, mimeType, workspaceId) {
        const extension = path.extname(filename) || this.getExtensionFromMimeType(mimeType);
        const sanitizedFilename = `${workspaceId}/${Date.now()}-${crypto.randomBytes(8).toString('hex')}${extension}`;

        if (this.STORAGE_TYPE === 'supabase') {
            return await this.uploadToSupabase(sanitizedFilename, buffer, mimeType);
        } else {
            return await this.uploadToLocal(sanitizedFilename, buffer);
        }
    }

    /**
     * Upload file from URL
     * @param {string} url - Source URL
     * @param {string} workspaceId - Workspace ID
     */
    static async uploadFromUrl(url, workspaceId) {
        try {
            // Download file
            const response = await axios.get(url, {
                responseType: 'arraybuffer',
                timeout: 30000,
            });

            const buffer = Buffer.from(response.data);
            const mimeType = response.headers['content-type'] || 'application/octet-stream';
            const extension = this.getExtensionFromMimeType(mimeType);
            const filename = `${workspaceId}/${Date.now()}-${crypto.randomBytes(8).toString('hex')}.${extension}`;

            if (this.STORAGE_TYPE === 'supabase') {
                return await this.uploadToSupabase(filename, buffer, mimeType);
            } else {
                return await this.uploadToLocal(filename, buffer);
            }
        } catch (error) {
            logger.error(`Upload from URL error: ${error.message}`);
            throw new Error('Failed to upload from URL');
        }
    }

    /**
     * Delete media file
     * @param {string} path - File path or filename
     */
    static async deleteMedia(filePath) {
        try {
            if (this.STORAGE_TYPE === 'supabase') {
                const { error } = await supabaseAdmin.storage
                    .from(this.SUPABASE_BUCKET)
                    .remove([filePath]);

                if (error) {
                    throw new Error(error.message);
                }

                logger.info(`Deleted media from Supabase: ${filePath}`);
            } else {
                await fs.unlink(filePath);
                logger.info(`Deleted media from local: ${filePath}`);
            }
        } catch (error) {
            logger.error(`Delete media error: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get signed URL for private media
     * @param {string} path - File path
     * @param {number} expiresIn - Expiration in seconds (default 1 hour)
     */
    static async getSignedUrl(filePath, expiresIn = 3600) {
        if (this.STORAGE_TYPE === 'supabase') {
            const { data, error } = await supabaseAdmin.storage
                .from(this.SUPABASE_BUCKET)
                .createSignedUrl(filePath, expiresIn);

            if (error) {
                throw new Error(error.message);
            }

            return data.signedUrl;
        } else {
            // For local storage, return the direct path
            return `/media/${filePath}`;
        }
    }

    /**
     * Get file extension from MIME type
     */
    static getExtensionFromMimeType(mimeType) {
        const mimeMap = {
            'image/jpeg': 'jpg',
            'image/jpg': 'jpg',
            'image/png': 'png',
            'image/gif': 'gif',
            'image/webp': 'webp',
            'video/mp4': 'mp4',
            'video/mpeg': 'mpeg',
            'video/3gpp': '3gp',
            'audio/mpeg': 'mp3',
            'audio/ogg': 'ogg',
            'audio/opus': 'opus',
            'audio/aac': 'aac',
            'application/pdf': 'pdf',
            'application/msword': 'doc',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
            'application/vnd.ms-excel': 'xls',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
            'text/plain': 'txt',
        };

        return mimeMap[mimeType] || 'bin';
    }

    /**
     * Get media category from MIME type
     */
    static getCategoryFromMimeType(mimeType) {
        if (mimeType.startsWith('image/')) return 'images';
        if (mimeType.startsWith('video/')) return 'videos';
        if (mimeType.startsWith('audio/')) return 'audio';
        return 'documents';
    }

    /**
     * Validate file size
     */
    static validateFileSize(buffer, maxSize = 104857600) {
        if (buffer.length > maxSize) {
            throw new Error(`File size exceeds maximum (${maxSize} bytes)`);
        }
    }

    /**
     * Validate MIME type
     */
    static validateMimeType(mimeType, allowedTypes = []) {
        if (allowedTypes.length > 0 && !allowedTypes.includes(mimeType)) {
            throw new Error(`MIME type ${mimeType} not allowed`);
        }
    }
}
