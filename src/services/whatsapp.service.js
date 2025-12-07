import axios from 'axios';
import crypto from 'crypto';
import { config } from '../config/config.js';
import { logger } from '../utils/logger.js';

export class WhatsAppService {
    constructor(phoneNumberId, accessToken) {
        this.phoneNumberId = phoneNumberId;
        this.accessToken = accessToken;
        this.baseUrl = `${config.whatsapp.apiUrl}/${phoneNumberId}`;
    }

    /**
     * Send a text message
     */
    async sendText(to, text) {
        try {
            const response = await axios.post(
                `${this.baseUrl}/messages`,
                {
                    messaging_product: 'whatsapp',
                    recipient_type: 'individual',
                    to,
                    type: 'text',
                    text: { body: text },
                },
                {
                    headers: {
                        'Authorization': `Bearer ${this.accessToken}`,
                        'Content-Type': 'application/json',
                    },
                }
            );

            return response.data;
        } catch (error) {
            logger.error(`WhatsApp send text error: ${error.response?.data?.error?.message || error.message}`);
            throw new Error(error.response?.data?.error?.message || 'Failed to send message');
        }
    }

    /**
     * Send a media message (image, video, document, audio)
     */
    async sendMedia(to, type, mediaUrl, caption = null) {
        try {
            const payload = {
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to,
                type,
                [type]: {
                    link: mediaUrl,
                    ...(caption && type === 'image' && { caption }),
                },
            };

            const response = await axios.post(
                `${this.baseUrl}/messages`,
                payload,
                {
                    headers: {
                        'Authorization': `Bearer ${this.accessToken}`,
                        'Content-Type': 'application/json',
                    },
                }
            );

            return response.data;
        } catch (error) {
            logger.error(`WhatsApp send media error: ${error.response?.data?.error?.message || error.message}`);
            throw new Error(error.response?.data?.error?.message || 'Failed to send media');
        }
    }

    /**
     * Send an interactive message with buttons
     */
    async sendButtons(to, text, buttons) {
        try {
            const response = await axios.post(
                `${this.baseUrl}/messages`,
                {
                    messaging_product: 'whatsapp',
                    recipient_type: 'individual',
                    to,
                    type: 'interactive',
                    interactive: {
                        type: 'button',
                        body: { text },
                        action: {
                            buttons: buttons.map((btn, idx) => ({
                                type: 'reply',
                                reply: {
                                    id: btn.id || `btn_${idx}`,
                                    title: btn.title.substring(0, 20),
                                },
                            })),
                        },
                    },
                },
                {
                    headers: {
                        'Authorization': `Bearer ${this.accessToken}`,
                        'Content-Type': 'application/json',
                    },
                }
            );

            return response.data;
        } catch (error) {
            logger.error(`WhatsApp send buttons error: ${error.response?.data?.error?.message || error.message}`);
            throw new Error(error.response?.data?.error?.message || 'Failed to send buttons');
        }
    }

    /**
     * Send a template message
     */
    async sendTemplate(to, templateName, language, components = []) {
        try {
            const response = await axios.post(
                `${this.baseUrl}/messages`,
                {
                    messaging_product: 'whatsapp',
                    to,
                    type: 'template',
                    template: {
                        name: templateName,
                        language: { code: language },
                        components,
                    },
                },
                {
                    headers: {
                        'Authorization': `Bearer ${this.accessToken}`,
                        'Content-Type': 'application/json',
                    },
                }
            );

            return response.data;
        } catch (error) {
            logger.error(`WhatsApp send template error: ${error.response?.data?.error?.message || error.message}`);
            throw new Error(error.response?.data?.error?.message || 'Failed to send template');
        }
    }

    /**
     * Verify numbers using unofficial WhatsApp endpoint
     */
    static async verifyNumbers(phoneNumberId, accessToken, phoneNumbers) {
        try {
            const response = await axios.post(
                `${config.whatsapp.apiUrl}/${phoneNumberId}/contacts`,
                {
                    blocking: 'wait',
                    contacts: phoneNumbers,
                    force_check: true,
                },
                {
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json',
                    },
                }
            );

            return response.data.contacts || [];
        } catch (error) {
            logger.error(`WhatsApp verify numbers error: ${error.response?.data?.error?.message || error.message}`);
            throw new Error(error.response?.data?.error?.message || 'Failed to verify numbers');
        }
    }

    /**
     * Verify webhook signature from Meta
     */
    static verifyWebhookSignature(payload, signature) {
        if (!signature) {
            return false;
        }

        const expectedSignature = crypto
            .createHmac('sha256', config.whatsapp.verifyToken)
            .update(payload)
            .digest('hex');

        return `sha256=${expectedSignature}` === signature;
    }

    /**
     * Retry logic with exponential backoff
     */
    static async withRetry(fn, maxRetries = 3) {
        let lastError;

        for (let i = 0; i < maxRetries; i++) {
            try {
                return await fn();
            } catch (error) {
                lastError = error;
                const delay = Math.pow(2, i) * 1000; // 1s, 2s, 4s
                logger.warn(`Retry attempt ${i + 1}/${maxRetries} after ${delay}ms`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }

        throw lastError;
    }
}

/**
 * Interpolate variables in message content
 */
export const interpolateVariables = (template, variables) => {
    let result = template;

    for (const [key, value] of Object.entries(variables)) {
        const regex = new RegExp(`{{${key}}}`, 'g');
        result = result.replace(regex, value || '');
    }

    return result;
};
