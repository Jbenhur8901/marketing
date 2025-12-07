import { Parser } from 'json2csv';

/**
 * CSV Utility
 * Helper functions for CSV export
 */
export class CSVUtil {
    /**
     * Convert array of objects to CSV string
     * @param {Array} data - Data to convert
     * @param {Array} fields - Fields to include (optional)
     * @param {Object} opts - Additional options (optional)
     */
    static toCSV(data, fields = null, opts = {}) {
        try {
            const options = {
                fields: fields || (data.length > 0 ? Object.keys(data[0]) : []),
                ...opts,
            };

            const parser = new Parser(options);
            return parser.parse(data);
        } catch (error) {
            throw new Error(`CSV conversion error: ${error.message}`);
        }
    }

    /**
     * Flatten nested objects for CSV export
     * @param {Object} obj - Object to flatten
     * @param {string} prefix - Prefix for nested keys
     */
    static flattenObject(obj, prefix = '') {
        return Object.keys(obj).reduce((acc, key) => {
            const value = obj[key];
            const newKey = prefix ? `${prefix}.${key}` : key;

            if (value === null || value === undefined) {
                acc[newKey] = '';
            } else if (typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
                Object.assign(acc, this.flattenObject(value, newKey));
            } else if (Array.isArray(value)) {
                acc[newKey] = value.join('; ');
            } else {
                acc[newKey] = value;
            }

            return acc;
        }, {});
    }

    /**
     * Flatten array of objects
     */
    static flattenArray(data) {
        return data.map(item => this.flattenObject(item));
    }

    /**
     * Send CSV as download response
     * @param {Object} res - Express response object
     * @param {String} csv - CSV string
     * @param {String} filename - Download filename
     */
    static sendCSVResponse(res, csv, filename) {
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Length', Buffer.byteLength(csv));
        res.send(csv);
    }

    /**
     * Generate timestamp for filenames
     */
    static getTimestamp() {
        return new Date().toISOString().split('T')[0];
    }
}
