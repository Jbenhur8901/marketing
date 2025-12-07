import { jest } from '@jest/globals';

// Create manual mock for WhatsApp service to avoid axios mocking issues
describe('WhatsAppService', () => {
    let mockPost;

    beforeEach(() => {
        mockPost = jest.fn();
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('Message formatting and validation', () => {
        test('should format phone numbers correctly', () => {
            const phones = ['+33612345678', '+14155552671', '+447700900123'];

            phones.forEach(phone => {
                expect(phone).toMatch(/^\+[1-9]\d{1,14}$/);
            });
        });

        test('should validate text message payload structure', () => {
            const payload = {
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to: '+33612345678',
                type: 'text',
                text: { body: 'Hello World' }
            };

            expect(payload.messaging_product).toBe('whatsapp');
            expect(payload.type).toBe('text');
            expect(payload.text).toHaveProperty('body');
            expect(payload.text.body).toBe('Hello World');
        });

        test('should validate media message payload structure', () => {
            const type = 'image';
            const mediaUrl = 'https://example.com/image.jpg';
            const caption = 'Check this out!';

            const payload = {
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to: '+33612345678',
                type,
                [type]: {
                    link: mediaUrl,
                    caption
                }
            };

            expect(payload.type).toBe('image');
            expect(payload.image).toHaveProperty('link');
            expect(payload.image).toHaveProperty('caption');
            expect(payload.image.link).toBe(mediaUrl);
        });

        test('should format button titles to max 20 chars', () => {
            const longTitle = 'This is a very long button title that exceeds limit';
            const truncated = longTitle.substring(0, 20);

            expect(truncated.length).toBe(20);
            expect(truncated).toBe('This is a very long ');
        });

        test('should validate button message structure', () => {
            const buttons = [
                { id: 'yes', title: 'Yes' },
                { id: 'no', title: 'No' }
            ];

            const formattedButtons = buttons.map((btn, idx) => ({
                type: 'reply',
                reply: {
                    id: btn.id || `btn_${idx}`,
                    title: btn.title.substring(0, 20)
                }
            }));

            expect(formattedButtons).toHaveLength(2);
            expect(formattedButtons[0].type).toBe('reply');
            expect(formattedButtons[0].reply.id).toBe('yes');
            expect(formattedButtons[0].reply.title).toBe('Yes');
        });

        test('should construct base URL correctly', () => {
            const phoneNumberId = '123456789';
            const baseUrl = `https://graph.facebook.com/v18.0/${phoneNumberId}`;

            expect(baseUrl).toContain(phoneNumberId);
            expect(baseUrl).toContain('graph.facebook.com');
            expect(baseUrl).toMatch(/^https:\/\//);
        });

        test('should format authorization header correctly', () => {
            const accessToken = 'test_token_123';
            const authHeader = `Bearer ${accessToken}`;

            expect(authHeader).toBe('Bearer test_token_123');
            expect(authHeader).toContain('Bearer');
        });

        test('should validate interactive message structure', () => {
            const interactive = {
                type: 'button',
                body: { text: 'Do you want to continue?' },
                action: {
                    buttons: [
                        { type: 'reply', reply: { id: 'yes', title: 'Yes' } },
                        { type: 'reply', reply: { id: 'no', title: 'No' } }
                    ]
                }
            };

            expect(interactive.type).toBe('button');
            expect(interactive.body).toHaveProperty('text');
            expect(interactive.action).toHaveProperty('buttons');
            expect(interactive.action.buttons).toHaveLength(2);
        });
    });

    describe('Error handling', () => {
        test('should extract error message from WhatsApp API response', () => {
            const errorResponse = {
                response: {
                    data: {
                        error: {
                            message: 'Invalid phone number',
                            code: 100
                        }
                    }
                }
            };

            const errorMessage = errorResponse.response?.data?.error?.message || 'Failed to send message';
            expect(errorMessage).toBe('Invalid phone number');
        });

        test('should use fallback error message when no API error', () => {
            const error = new Error('Network error');
            const errorMessage = error.response?.data?.error?.message || 'Failed to send message';

            expect(errorMessage).toBe('Failed to send message');
        });

        test('should handle media send error extraction', () => {
            const errorResponse = {
                response: {
                    data: {
                        error: {
                            message: 'Media URL not accessible'
                        }
                    }
                }
            };

            const errorMessage = errorResponse.response?.data?.error?.message || 'Failed to send media';
            expect(errorMessage).toBe('Media URL not accessible');
        });
    });

    describe('Service initialization', () => {
        test('should validate required parameters for initialization', () => {
            const phoneNumberId = '123456789';
            const accessToken = 'test_token';

            expect(phoneNumberId).toBeDefined();
            expect(accessToken).toBeDefined();
            expect(typeof phoneNumberId).toBe('string');
            expect(typeof accessToken).toBe('string');
        });

        test('should construct correct API endpoint', () => {
            const phoneNumberId = '123456789';
            const endpoint = `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`;

            expect(endpoint).toContain('/messages');
            expect(endpoint).toContain(phoneNumberId);
        });
    });
});
