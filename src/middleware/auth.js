import { supabaseAdmin } from '../config/supabase.js';
import { logger } from '../utils/logger.js';

/**
 * Authentication middleware using API Key from database
 * Verifies X-API-KEY header against api_keys table
 */
export const authenticate = async (req, res, next) => {
    try {
        // Récupérer la clé API du header X-API-KEY
        const apiKey = req.headers['x-api-key'];

        // Vérifier que la clé est présente
        if (!apiKey) {
            logger.warn('API request without X-API-KEY header');
            return res.status(401).json({
                error: 'API Key required',
                message: 'Please provide X-API-KEY header'
            });
        }

        // Valider la clé via la fonction database
        const { data, error } = await supabaseAdmin.rpc('validate_api_key', {
            plain_key: apiKey
        });

        if (error) {
            logger.error(`API key validation error: ${error.message}`);
            return res.status(500).json({
                error: 'Internal server error',
                message: 'Failed to validate API key'
            });
        }

        // Vérifier si la clé existe et est valide
        if (!data || data.length === 0 || !data[0].is_valid) {
            logger.warn(`Invalid or expired API key attempt: ${apiKey.substring(0, 15)}...`);
            return res.status(403).json({
                error: 'Invalid API Key',
                message: 'The provided API key is not valid, expired, or has been revoked'
            });
        }

        const keyData = data[0];

        // Enregistrer l'utilisation de la clé
        const clientIp = req.ip || req.connection.remoteAddress;
        const { error: usageError } = await supabaseAdmin.rpc('record_api_key_usage', {
            plain_key: apiKey,
            client_ip: clientIp
        });

        if (usageError) {
            // Non-blocking error
            logger.error(`Failed to record API key usage: ${usageError.message}`);
        }

        // Attacher les informations au request
        req.workspace_id = keyData.workspace_id;
        req.api_key_id = keyData.key_id;
        req.api_scopes = keyData.scopes;
        req.authenticated = true;

        // For backward compatibility with code expecting req.user
        // Note: In X-API-KEY auth, there's no individual user - only workspace context
        req.user = {
            id: keyData.workspace_id, // Use workspace_id as user context
            workspace_id: keyData.workspace_id,
            api_key_id: keyData.key_id,
        };

        logger.debug(`API key validated for workspace: ${keyData.workspace_id}`);
        next();
    } catch (error) {
        logger.error(`Authentication error: ${error.message}`);
        res.status(401).json({
            error: 'Authentication failed',
            message: error.message
        });
    }
};

/**
 * Optional authentication middleware
 * Allows requests with or without API key
 */
export const optionalAuth = async (req, res, next) => {
    try {
        const apiKey = req.headers['x-api-key'];

        if (!apiKey) {
            req.authenticated = false;
            return next();
        }

        // Try to validate the key
        const { data } = await supabaseAdmin.rpc('validate_api_key', {
            plain_key: apiKey
        });

        if (data && data.length > 0 && data[0].is_valid) {
            req.workspace_id = data[0].workspace_id;
            req.api_key_id = data[0].key_id;
            req.api_scopes = data[0].scopes;
            req.authenticated = true;
        } else {
            req.authenticated = false;
        }

        next();
    } catch (error) {
        logger.error(`Optional auth error: ${error.message}`);
        req.authenticated = false;
        next();
    }
};

/**
 * Check if API key has specific scope
 */
export const requireScope = (requiredScope) => {
    return (req, res, next) => {
        if (!req.api_scopes) {
            return res.status(403).json({
                error: 'Forbidden',
                message: 'No scopes found for this API key'
            });
        }

        const scopes = Array.isArray(req.api_scopes) ? req.api_scopes : [];

        if (!scopes.includes(requiredScope) && !scopes.includes('admin')) {
            return res.status(403).json({
                error: 'Forbidden',
                message: `This operation requires '${requiredScope}' scope`
            });
        }

        next();
    };
};
