import { logger } from '../utils/logger.js';

export class AppError extends Error {
    constructor(message, statusCode = 500, details = null) {
        super(message);
        this.statusCode = statusCode;
        this.details = details;
        this.isOperational = true;

        Error.captureStackTrace(this, this.constructor);
    }
}

export const errorHandler = (err, req, res, next) => {
    let { statusCode = 500, message, details } = err;

    // Log error
    if (statusCode >= 500) {
        logger.error(`${message} - ${err.stack}`);
    } else {
        logger.warn(`${statusCode} - ${message}`);
    }

    // Don't leak error details in production
    if (process.env.NODE_ENV === 'production' && statusCode >= 500) {
        message = 'Internal server error';
        details = null;
    }

    res.status(statusCode).json({
        error: message,
        ...(details && { details }),
    });
};

export const notFound = (req, res) => {
    res.status(404).json({ error: 'Route not found' });
};
