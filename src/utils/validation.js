import Joi from 'joi';

// E.164 phone number validation
export const phoneSchema = Joi.string()
    .pattern(/^\+[1-9]\d{1,14}$/)
    .required()
    .messages({
        'string.pattern.base': 'Phone number must be in E.164 format (e.g., +33612345678)',
    });

// Validation schemas
export const schemas = {
    // Auth
    register: Joi.object({
        email: Joi.string().email().required(),
        password: Joi.string().min(8).required(),
        name: Joi.string().required(),
    }),

    login: Joi.object({
        email: Joi.string().email().required(),
        password: Joi.string().required(),
    }),

    // Workspace
    createWorkspace: Joi.object({
        name: Joi.string().min(3).max(255).required(),
    }),

    connectWhatsApp: Joi.object({
        whatsapp_business_account_id: Joi.string().required(),
        whatsapp_phone_number_id: Joi.string().required(),
        whatsapp_access_token: Joi.string().required(),
    }),

    // Bot
    createBot: Joi.object({
        workspace_id: Joi.string().uuid().required(),
        name: Joi.string().min(3).max(255).required(),
        description: Joi.string().allow('', null),
    }),

    updateBot: Joi.object({
        name: Joi.string().min(3).max(255),
        description: Joi.string().allow('', null),
        status: Joi.string().valid('draft', 'active', 'inactive'),
    }),

    updateFlow: Joi.object({
        flow_json: Joi.object({
            nodes: Joi.array().required(),
            edges: Joi.array().required(),
        }).required(),
    }),

    // Contact
    createContact: Joi.object({
        workspace_id: Joi.string().uuid().required(),
        phone: phoneSchema,
        name: Joi.string().allow('', null),
        email: Joi.string().email().allow('', null),
        custom_fields: Joi.object(),
        tags: Joi.array().items(Joi.string()),
    }),

    updateContact: Joi.object({
        name: Joi.string().allow('', null),
        email: Joi.string().email().allow('', null),
        custom_fields: Joi.object(),
        tags: Joi.array().items(Joi.string()),
    }),

    // Bulk Verification
    startBulkVerification: Joi.object({
        workspace_id: Joi.string().uuid().required(),
        phone_numbers: Joi.array().items(phoneSchema).min(1).max(10000).required(),
        auto_add_to_contacts: Joi.boolean().default(false),
    }),

    // Broadcast
    createBroadcastTemplate: Joi.object({
        workspace_id: Joi.string().uuid().required(),
        name: Joi.string().min(3).max(255).required(),
        content: Joi.string().required(),
        variables: Joi.array().items(Joi.string()),
        category: Joi.string().valid('MARKETING', 'UTILITY', 'AUTHENTICATION').default('MARKETING'),
        language: Joi.string().default('en'),
        media_type: Joi.string().valid('text', 'image', 'video', 'document'),
        media_url: Joi.string().uri().allow('', null),
        buttons: Joi.array(),
    }),

    createBroadcastCampaign: Joi.object({
        workspace_id: Joi.string().uuid().required(),
        name: Joi.string().min(3).max(255).required(),
        template_id: Joi.string().uuid().allow(null),
        message_content: Joi.string().required(),
        message_type: Joi.string().valid('text', 'image', 'video', 'document').default('text'),
        target_type: Joi.string().valid('all', 'filtered', 'specific').default('all'),
        target_filters: Joi.object(),
        scheduled_at: Joi.date().iso().allow(null),
        rate_limit: Joi.number().min(1).max(100).default(10),
    }),

    // Conversation
    updateConversationStatus: Joi.object({
        status: Joi.string().valid('bot', 'human', 'closed').required(),
    }),

    assignConversation: Joi.object({
        assigned_to: Joi.string().uuid().required(),
    }),

    sendMessage: Joi.object({
        content: Joi.string().required(),
        type: Joi.string().valid('text', 'image', 'video', 'document', 'audio').default('text'),
        media_url: Joi.string().uri().allow('', null),
    }),
};

// Validation middleware
export const validate = (schema) => {
    return (req, res, next) => {
        const { error } = schema.validate(req.body, { abortEarly: false });

        if (error) {
            const errors = error.details.map(detail => ({
                field: detail.path.join('.'),
                message: detail.message,
            }));

            return res.status(400).json({
                error: 'Validation error',
                details: errors,
            });
        }

        next();
    };
};
