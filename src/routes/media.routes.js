import express from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/auth.js';
import { MediaService } from '../services/media.service.js';
import { AppError } from '../middleware/errorHandler.js';
import { logger } from '../utils/logger.js';

const router = express.Router();

// Configure multer for file uploads (memory storage)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 100 * 1024 * 1024, // 100MB
    },
    fileFilter: (req, file, cb) => {
        // Allow common media types
        const allowedMimeTypes = [
            'image/jpeg',
            'image/png',
            'image/gif',
            'image/webp',
            'video/mp4',
            'video/mpeg',
            'video/3gpp',
            'audio/mpeg',
            'audio/ogg',
            'audio/aac',
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ];

        if (allowedMimeTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new AppError(`File type ${file.mimetype} not allowed`, 400));
        }
    },
});

/**
 * POST /api/media/upload
 * Upload a media file
 */
router.post('/upload', authenticate, upload.single('file'), async (req, res, next) => {
    try {
        const { workspace_id } = req.body;

        if (!workspace_id) {
            throw new AppError('workspace_id is required', 400);
        }

        if (!req.file) {
            throw new AppError('No file uploaded', 400);
        }

        // Upload file
        const result = await MediaService.uploadFromBuffer(
            req.file.buffer,
            req.file.originalname,
            req.file.mimetype,
            workspace_id
        );

        logger.info(`Media uploaded: ${result.path}`);

        res.status(201).json({
            message: 'File uploaded successfully',
            media: result,
        });
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/media/upload-from-url
 * Upload a media file from URL
 */
router.post('/upload-from-url', authenticate, async (req, res, next) => {
    try {
        const { url, workspace_id } = req.body;

        if (!url || !workspace_id) {
            throw new AppError('url and workspace_id are required', 400);
        }

        // Validate URL
        try {
            new URL(url);
        } catch {
            throw new AppError('Invalid URL', 400);
        }

        // Upload from URL
        const result = await MediaService.uploadFromUrl(url, workspace_id);

        logger.info(`Media uploaded from URL: ${result.path}`);

        res.status(201).json({
            message: 'File uploaded successfully',
            media: result,
        });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/media/:path
 * Get signed URL for media
 */
router.get('/:workspaceId/:filename', authenticate, async (req, res, next) => {
    try {
        const { workspaceId, filename } = req.params;
        const filePath = `${workspaceId}/${filename}`;

        // Get signed URL
        const signedUrl = await MediaService.getSignedUrl(filePath, 3600);

        res.json({
            url: signedUrl,
            expiresIn: 3600,
        });
    } catch (error) {
        next(error);
    }
});

/**
 * DELETE /api/media/:workspaceId/:filename
 * Delete a media file
 */
router.delete('/:workspaceId/:filename', authenticate, async (req, res, next) => {
    try {
        const { workspaceId, filename } = req.params;
        const filePath = `${workspaceId}/${filename}`;

        await MediaService.deleteMedia(filePath);

        logger.info(`Media deleted: ${filePath}`);

        res.json({
            message: 'File deleted successfully',
        });
    } catch (error) {
        next(error);
    }
});

export default router;
