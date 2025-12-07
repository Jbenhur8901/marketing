import { phoneSchema, schemas, validate } from '../../utils/validation.js';
import { jest } from '@jest/globals';

describe('Validation Utils', () => {
    describe('phoneSchema', () => {
        test('should accept valid E.164 phone numbers', () => {
            const validPhones = [
                '+33612345678',
                '+14155552671',
                '+447700900123',
                '+861234567890'
            ];

            validPhones.forEach(phone => {
                const { error } = phoneSchema.validate(phone);
                expect(error).toBeUndefined();
            });
        });

        test('should reject invalid phone numbers', () => {
            const invalidPhones = [
                '0612345678',      // Missing +
                '+0612345678',     // Starts with 0
                '612345678',       // Missing +
                '+33-6-12-34-56-78', // Has dashes
                'invalid',         // Not a number
                ''                 // Empty
            ];

            invalidPhones.forEach(phone => {
                const { error } = phoneSchema.validate(phone);
                expect(error).toBeDefined();
            });
        });
    });

    describe('schemas.createWorkspace', () => {
        test('should accept valid workspace data', () => {
            const validData = { name: 'My Workspace' };
            const { error } = schemas.createWorkspace.validate(validData);
            expect(error).toBeUndefined();
        });

        test('should reject workspace name too short', () => {
            const invalidData = { name: 'AB' };
            const { error } = schemas.createWorkspace.validate(invalidData);
            expect(error).toBeDefined();
        });

        test('should reject missing name', () => {
            const invalidData = {};
            const { error } = schemas.createWorkspace.validate(invalidData);
            expect(error).toBeDefined();
        });
    });

    describe('schemas.createContact', () => {
        test('should accept valid contact data', () => {
            const validData = {
                workspace_id: '123e4567-e89b-12d3-a456-426614174000',
                phone: '+33612345678',
                name: 'John Doe',
                email: 'john@example.com'
            };
            const { error } = schemas.createContact.validate(validData);
            expect(error).toBeUndefined();
        });

        test('should accept contact without optional fields', () => {
            const validData = {
                workspace_id: '123e4567-e89b-12d3-a456-426614174000',
                phone: '+33612345678'
            };
            const { error } = schemas.createContact.validate(validData);
            expect(error).toBeUndefined();
        });

        test('should reject invalid email', () => {
            const invalidData = {
                workspace_id: '123e4567-e89b-12d3-a456-426614174000',
                phone: '+33612345678',
                email: 'invalid-email'
            };
            const { error } = schemas.createContact.validate(invalidData);
            expect(error).toBeDefined();
        });
    });

    describe('schemas.createBroadcastCampaign', () => {
        test('should accept valid campaign data', () => {
            const validData = {
                workspace_id: '123e4567-e89b-12d3-a456-426614174000',
                name: 'Summer Campaign',
                message_content: 'Hello!',
                rate_limit: 10
            };
            const { error } = schemas.createBroadcastCampaign.validate(validData);
            expect(error).toBeUndefined();
        });

        test('should reject rate_limit above max', () => {
            const invalidData = {
                workspace_id: '123e4567-e89b-12d3-a456-426614174000',
                name: 'Campaign',
                message_content: 'Hello!',
                rate_limit: 150
            };
            const { error } = schemas.createBroadcastCampaign.validate(invalidData);
            expect(error).toBeDefined();
        });

        test('should apply default values', () => {
            const data = {
                workspace_id: '123e4567-e89b-12d3-a456-426614174000',
                name: 'Campaign',
                message_content: 'Hello!'
            };
            const { value } = schemas.createBroadcastCampaign.validate(data);
            expect(value.rate_limit).toBe(10);
            expect(value.message_type).toBe('text');
            expect(value.target_type).toBe('all');
        });
    });

    describe('validate middleware', () => {
        test('should call next() for valid data', () => {
            const schema = schemas.createWorkspace;
            const middleware = validate(schema);

            const req = { body: { name: 'Test Workspace' } };
            const res = { status: jest.fn(), json: jest.fn() };
            const next = jest.fn();

            res.status.mockReturnValue(res);

            middleware(req, res, next);

            expect(next).toHaveBeenCalled();
            expect(res.status).not.toHaveBeenCalled();
        });

        test('should return 400 for invalid data', () => {
            const schema = schemas.createWorkspace;
            const middleware = validate(schema);

            const req = { body: { name: 'AB' } }; // Too short
            const res = {
                status: jest.fn().mockReturnThis(),
                json: jest.fn()
            };
            const next = jest.fn();

            middleware(req, res, next);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalled();
            expect(next).not.toHaveBeenCalled();
        });

        test('should return validation errors details', () => {
            const schema = schemas.createContact;
            const middleware = validate(schema);

            const req = { body: { phone: 'invalid' } }; // Missing required fields
            const res = {
                status: jest.fn().mockReturnThis(),
                json: jest.fn()
            };
            const next = jest.fn();

            middleware(req, res, next);

            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    error: 'Validation error',
                    details: expect.any(Array)
                })
            );
        });
    });
});
