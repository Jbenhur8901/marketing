import { CSVUtil } from '../../utils/csv.js';
import { jest } from '@jest/globals';

describe('CSVUtil', () => {
    describe('toCSV', () => {
        test('should convert array of objects to CSV', () => {
            const data = [
                { name: 'John', age: 30 },
                { name: 'Jane', age: 25 }
            ];

            const csv = CSVUtil.toCSV(data);

            expect(csv).toContain('name');
            expect(csv).toContain('age');
            expect(csv).toContain('John');
            expect(csv).toContain('Jane');
        });

        test('should handle empty array', () => {
            const data = [];
            const csv = CSVUtil.toCSV(data, ['name', 'age']);

            expect(csv).toBeTruthy();
        });

        test('should use custom fields', () => {
            const data = [
                { name: 'John', age: 30, city: 'Paris' },
                { name: 'Jane', age: 25, city: 'London' }
            ];

            const csv = CSVUtil.toCSV(data, ['name', 'city']);

            expect(csv).toContain('name');
            expect(csv).toContain('city');
            expect(csv).not.toContain('age');
        });

        test('should throw error on invalid data', () => {
            expect(() => {
                CSVUtil.toCSV(null);
            }).toThrow();
        });
    });

    describe('flattenObject', () => {
        test('should flatten nested object', () => {
            const obj = {
                name: 'John',
                address: {
                    city: 'Paris',
                    country: 'France'
                }
            };

            const flattened = CSVUtil.flattenObject(obj);

            expect(flattened).toEqual({
                name: 'John',
                'address.city': 'Paris',
                'address.country': 'France'
            });
        });

        test('should handle null and undefined values', () => {
            const obj = {
                name: 'John',
                age: null,
                email: undefined
            };

            const flattened = CSVUtil.flattenObject(obj);

            expect(flattened.name).toBe('John');
            expect(flattened.age).toBe('');
            expect(flattened.email).toBe('');
        });

        test('should join arrays with semicolon', () => {
            const obj = {
                name: 'John',
                tags: ['vip', 'premium', 'active']
            };

            const flattened = CSVUtil.flattenObject(obj);

            expect(flattened.tags).toBe('vip; premium; active');
        });

        test('should handle deeply nested objects', () => {
            const obj = {
                user: {
                    profile: {
                        name: 'John',
                        details: {
                            age: 30
                        }
                    }
                }
            };

            const flattened = CSVUtil.flattenObject(obj);

            expect(flattened['user.profile.name']).toBe('John');
            expect(flattened['user.profile.details.age']).toBe(30);
        });

        test('should handle Date objects', () => {
            const date = new Date('2024-01-01');
            const obj = {
                name: 'John',
                created_at: date
            };

            const flattened = CSVUtil.flattenObject(obj);

            expect(flattened.created_at).toBe(date);
        });
    });

    describe('flattenArray', () => {
        test('should flatten array of nested objects', () => {
            const data = [
                {
                    name: 'John',
                    address: { city: 'Paris' }
                },
                {
                    name: 'Jane',
                    address: { city: 'London' }
                }
            ];

            const flattened = CSVUtil.flattenArray(data);

            expect(flattened).toHaveLength(2);
            expect(flattened[0]).toEqual({
                name: 'John',
                'address.city': 'Paris'
            });
            expect(flattened[1]).toEqual({
                name: 'Jane',
                'address.city': 'London'
            });
        });

        test('should handle empty array', () => {
            const flattened = CSVUtil.flattenArray([]);
            expect(flattened).toEqual([]);
        });
    });

    describe('sendCSVResponse', () => {
        test('should set correct headers and send CSV', () => {
            const res = {
                setHeader: jest.fn(),
                send: jest.fn()
            };

            const csv = 'name,age\nJohn,30\nJane,25';
            const filename = 'test.csv';

            CSVUtil.sendCSVResponse(res, csv, filename);

            expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv; charset=utf-8');
            expect(res.setHeader).toHaveBeenCalledWith('Content-Disposition', 'attachment; filename="test.csv"');
            expect(res.setHeader).toHaveBeenCalledWith('Content-Length', expect.any(Number));
            expect(res.send).toHaveBeenCalledWith(csv);
        });
    });

    describe('getTimestamp', () => {
        test('should return current date in ISO format', () => {
            const timestamp = CSVUtil.getTimestamp();

            // Should be in format YYYY-MM-DD
            expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        });

        test('should return today\'s date', () => {
            const timestamp = CSVUtil.getTimestamp();
            const today = new Date().toISOString().split('T')[0];

            expect(timestamp).toBe(today);
        });
    });
});
