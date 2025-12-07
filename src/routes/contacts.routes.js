import express from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authenticate } from '../middleware/auth.js';
import { validate, schemas } from '../utils/validation.js';
import { AppError } from '../middleware/errorHandler.js';

const router = express.Router();

/**
 * GET /api/contacts
 * List contacts for a workspace
 */
router.get('/', authenticate, async (req, res, next) => {
    try {
        const { workspace_id, page = 1, limit = 50, search, tags, whatsapp_verified, opted_in } = req.query;

        if (!workspace_id) {
            throw new AppError('workspace_id is required', 400);
        }

        let query = supabaseAdmin
            .from('contacts')
            .select('*', { count: 'exact' })
            .eq('workspace_id', workspace_id);

        // Filters
        if (search) {
            query = query.or(`phone.ilike.%${search}%,name.ilike.%${search}%,email.ilike.%${search}%`);
        }

        if (tags) {
            const tagArray = Array.isArray(tags) ? tags : [tags];
            query = query.overlaps('tags', tagArray);
        }

        if (whatsapp_verified !== undefined) {
            query = query.eq('whatsapp_verified', whatsapp_verified === 'true');
        }

        if (opted_in !== undefined) {
            query = query.eq('opted_in', opted_in === 'true');
        }

        // Pagination
        const offset = (parseInt(page) - 1) * parseInt(limit);
        query = query.range(offset, offset + parseInt(limit) - 1);

        query = query.order('created_at', { ascending: false });

        const { data, error, count } = await query;

        if (error) throw error;

        res.json({
            contacts: data,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: count,
                pages: Math.ceil(count / parseInt(limit)),
            },
        });
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/contacts
 * Create a new contact
 */
router.post('/', authenticate, validate(schemas.createContact), async (req, res, next) => {
    try {
        const { workspace_id, phone, name, email, custom_fields, tags } = req.body;

        const { data, error } = await supabaseAdmin
            .from('contacts')
            .insert({
                workspace_id,
                phone,
                name,
                email,
                custom_fields,
                tags,
            })
            .select()
            .single();

        if (error) {
            if (error.code === '23505') {
                throw new AppError('Contact with this phone number already exists', 409);
            }
            throw error;
        }

        res.status(201).json({ contact: data });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/contacts/:id
 * Get contact details
 */
router.get('/:id', authenticate, async (req, res, next) => {
    try {
        const { data, error } = await supabaseAdmin
            .from('contacts')
            .select('*')
            .eq('id', req.params.id)
            .single();

        if (error) throw new AppError('Contact not found', 404);

        res.json({ contact: data });
    } catch (error) {
        next(error);
    }
});

/**
 * PUT /api/contacts/:id
 * Update contact
 */
router.put('/:id', authenticate, validate(schemas.updateContact), async (req, res, next) => {
    try {
        const { name, email, custom_fields, tags } = req.body;

        const { data, error } = await supabaseAdmin
            .from('contacts')
            .update({ name, email, custom_fields, tags })
            .eq('id', req.params.id)
            .select()
            .single();

        if (error) throw error;

        res.json({ contact: data });
    } catch (error) {
        next(error);
    }
});

/**
 * DELETE /api/contacts/:id
 * Delete contact
 */
router.delete('/:id', authenticate, async (req, res, next) => {
    try {
        const { error } = await supabaseAdmin
            .from('contacts')
            .delete()
            .eq('id', req.params.id);

        if (error) throw error;

        res.json({ message: 'Contact deleted successfully' });
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/contacts/:id/tags
 * Add or remove tags
 */
router.post('/:id/tags', authenticate, async (req, res, next) => {
    try {
        const { tags, action = 'add' } = req.body;

        // Get current contact
        const { data: contact } = await supabaseAdmin
            .from('contacts')
            .select('tags')
            .eq('id', req.params.id)
            .single();

        let newTags = contact.tags || [];

        if (action === 'add') {
            newTags = [...new Set([...newTags, ...tags])];
        } else if (action === 'remove') {
            newTags = newTags.filter(t => !tags.includes(t));
        }

        const { data, error } = await supabaseAdmin
            .from('contacts')
            .update({ tags: newTags })
            .eq('id', req.params.id)
            .select()
            .single();

        if (error) throw error;

        res.json({ contact: data });
    } catch (error) {
        next(error);
    }
});

/**
 * PUT /api/contacts/:id/custom-fields
 * Update custom fields
 */
router.put('/:id/custom-fields', authenticate, async (req, res, next) => {
    try {
        const { custom_fields } = req.body;

        const { data, error } = await supabaseAdmin
            .from('contacts')
            .update({ custom_fields })
            .eq('id', req.params.id)
            .select()
            .single();

        if (error) throw error;

        res.json({ contact: data });
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/contacts/import
 * Import contacts from CSV
 */
router.post('/import', authenticate, async (req, res, next) => {
    try {
        const { workspace_id, contacts } = req.body;

        if (!contacts || !Array.isArray(contacts)) {
            throw new AppError('contacts array is required', 400);
        }

        const contactsToInsert = contacts.map(c => ({
            workspace_id,
            phone: c.phone,
            name: c.name || null,
            email: c.email || null,
            custom_fields: c.custom_fields || {},
            tags: c.tags || [],
        }));

        const { data, error } = await supabaseAdmin
            .from('contacts')
            .upsert(contactsToInsert, {
                onConflict: 'workspace_id,phone',
                ignoreDuplicates: false,
            })
            .select();

        if (error) throw error;

        res.status(201).json({
            message: `Imported ${data.length} contacts`,
            contacts: data,
        });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/contacts/export
 * Export contacts to CSV
 */
router.get('/export', authenticate, async (req, res, next) => {
    try {
        const { workspace_id } = req.query;

        if (!workspace_id) {
            throw new AppError('workspace_id is required', 400);
        }

        const { data, error } = await supabaseAdmin
            .from('contacts')
            .select('*')
            .eq('workspace_id', workspace_id);

        if (error) throw error;

        // Convert to CSV format (simple implementation)
        const headers = ['phone', 'name', 'email', 'whatsapp_verified', 'opted_in', 'tags', 'created_at'];
        const csv = [
            headers.join(','),
            ...data.map(contact =>
                headers.map(h => {
                    const value = contact[h];
                    if (Array.isArray(value)) return `"${value.join(';')}"`;
                    if (typeof value === 'object') return `"${JSON.stringify(value)}"`;
                    return value || '';
                }).join(',')
            ),
        ].join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=contacts-${Date.now()}.csv`);
        res.send(csv);
    } catch (error) {
        next(error);
    }
});

export default router;
