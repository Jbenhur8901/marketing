import { supabaseAdmin } from '../config/supabase.js';
import { WhatsAppService, interpolateVariables } from './whatsapp.service.js';
import { logger } from '../utils/logger.js';
import axios from 'axios';

export class FlowEngine {
    constructor(workspace, conversation, context) {
        this.workspace = workspace;
        this.conversation = conversation;
        this.context = context;
        this.whatsapp = new WhatsAppService(
            workspace.whatsapp_phone_number_id,
            workspace.whatsapp_access_token
        );
    }

    /**
     * Execute the flow from the current node
     */
    async execute(bot, incomingMessage = null) {
        try {
            // If new conversation, find trigger
            if (!this.context.current_node_id) {
                const triggerNode = await this.findTrigger(bot, incomingMessage);

                if (!triggerNode) {
                    logger.warn(`No trigger found for message in conversation ${this.conversation.id}`);
                    return;
                }

                this.context.current_node_id = triggerNode.id;
                this.context.flow_history = [triggerNode.id];
            }

            // If waiting for response, handle it
            if (this.context.waiting_for && incomingMessage) {
                await this.handleUserResponse(bot, incomingMessage);
            }

            // Execute nodes until we need to wait or end
            await this.executeNodes(bot);

        } catch (error) {
            logger.error(`Flow execution error: ${error.message}`);
            await this.handleError(error);
        }
    }

    /**
     * Find matching trigger node
     */
    async findTrigger(bot, message) {
        const nodes = bot.flow_json.nodes || [];
        const triggers = nodes.filter(node => node.type === 'trigger');

        for (const trigger of triggers) {
            const { trigger_type, keywords } = trigger.data;

            if (trigger_type === 'any_message') {
                return trigger;
            }

            if (trigger_type === 'keyword' && keywords) {
                const messageText = message?.text?.toLowerCase() || '';
                const hasKeyword = keywords.some(kw =>
                    messageText.includes(kw.toLowerCase())
                );

                if (hasKeyword) {
                    return trigger;
                }
            }

            if (trigger_type === 'new_conversation' && !this.context.flow_history.length) {
                return trigger;
            }
        }

        return null;
    }

    /**
     * Handle user response to a question
     */
    async handleUserResponse(bot, message) {
        const waitingNode = this.findNodeById(bot, this.context.waiting_for);

        if (waitingNode && waitingNode.type === 'ask_question') {
            const { variable_name, validation } = waitingNode.data;

            // Validate response
            const isValid = this.validateResponse(message.text, validation);

            if (!isValid) {
                // Re-send the question
                await this.whatsapp.sendText(
                    this.conversation.contact_phone,
                    'Invalid response. ' + waitingNode.data.question
                );
                return;
            }

            // Store the response in variables
            this.context.variables[variable_name] = message.text;
            this.context.waiting_for = null;
        }
    }

    /**
     * Execute nodes sequentially
     */
    async executeNodes(bot) {
        let currentNode = this.findNodeById(bot, this.context.current_node_id);
        let maxIterations = 100; // Prevent infinite loops
        let iterations = 0;

        while (currentNode && iterations < maxIterations) {
            iterations++;

            // Execute current node
            const shouldContinue = await this.executeNode(bot, currentNode);

            if (!shouldContinue) {
                break; // Stop execution (waiting for response or ended)
            }

            // Find next node
            const nextNode = this.findNextNode(bot, currentNode);

            if (!nextNode) {
                break; // No more nodes
            }

            currentNode = nextNode;
            this.context.current_node_id = currentNode.id;
            this.context.flow_history.push(currentNode.id);
        }

        // Save context
        await this.saveContext();
    }

    /**
     * Execute a single node
     */
    async executeNode(bot, node) {
        logger.info(`Executing node: ${node.id} (${node.type})`);

        switch (node.type) {
            case 'send_message':
                return await this.executeSendMessage(node);

            case 'ask_question':
                return await this.executeAskQuestion(node);

            case 'condition':
                return await this.executeCondition(node);

            case 'delay':
                return await this.executeDelay(node);

            case 'set_variable':
                return await this.executeSetVariable(node);

            case 'http_request':
                return await this.executeHttpRequest(node);

            case 'assign_to_human':
                return await this.executeAssignToHuman(node);

            case 'end':
                return false; // Stop execution

            default:
                logger.warn(`Unknown node type: ${node.type}`);
                return true;
        }
    }

    /**
     * Execute send_message node
     */
    async executeSendMessage(node) {
        const { message, type = 'text', media_url, buttons } = node.data;
        const interpolatedMessage = interpolateVariables(message, this.context.variables);

        if (type === 'text' && !buttons) {
            await this.whatsapp.sendText(this.conversation.contact_phone, interpolatedMessage);
        } else if (buttons) {
            await this.whatsapp.sendButtons(this.conversation.contact_phone, interpolatedMessage, buttons);
        } else {
            await this.whatsapp.sendMedia(this.conversation.contact_phone, type, media_url, interpolatedMessage);
        }

        // Log message
        await this.logMessage('outgoing', interpolatedMessage, type);

        return true; // Continue
    }

    /**
     * Execute ask_question node
     */
    async executeAskQuestion(node) {
        const { question } = node.data;
        const interpolatedQuestion = interpolateVariables(question, this.context.variables);

        await this.whatsapp.sendText(this.conversation.contact_phone, interpolatedQuestion);

        // Log message
        await this.logMessage('outgoing', interpolatedQuestion, 'text');

        // Mark as waiting for response
        this.context.waiting_for = node.id;
        await this.saveContext();

        return false; // Stop execution, wait for response
    }

    /**
     * Execute condition node
     */
    async executeCondition(node) {
        const { variable, operator, value, branches } = node.data;
        const variableValue = this.context.variables[variable];

        let condition = false;

        switch (operator) {
            case 'equals':
                condition = variableValue == value;
                break;
            case 'contains':
                condition = String(variableValue || '').includes(value);
                break;
            case 'greater_than':
                condition = Number(variableValue) > Number(value);
                break;
            case 'less_than':
                condition = Number(variableValue) < Number(value);
                break;
            case 'is_empty':
                condition = !variableValue;
                break;
            default:
                condition = false;
        }

        // Set next node based on condition
        const nextNodeId = condition ? branches.true : branches.false;
        this.context.current_node_id = nextNodeId;

        return true; // Continue with the new node
    }

    /**
     * Execute delay node
     */
    async executeDelay(node) {
        const { duration } = node.data; // in milliseconds

        if (duration <= 30000) {
            // Short delays (≤30 seconds) can be handled with setTimeout
            await new Promise(resolve => setTimeout(resolve, duration));
            return true;
        } else {
            // Long delays (>30 seconds) are scheduled for later execution
            const resumeAt = new Date(Date.now() + duration).toISOString();

            logger.info(`Scheduling long delay: resuming at ${resumeAt}`);

            // Store resume time in context
            this.context.variables.resume_at = resumeAt;
            await this.saveContext();

            // Stop execution - will be resumed by SchedulerService
            return false;
        }
    }

    /**
     * Execute set_variable node
     */
    async executeSetVariable(node) {
        const { variable_name, value } = node.data;
        this.context.variables[variable_name] = interpolateVariables(value, this.context.variables);
        return true;
    }

    /**
     * Execute http_request node
     */
    async executeHttpRequest(node) {
        const { method, url, body, save_response_to } = node.data;

        try {
            const response = await axios({
                method,
                url,
                data: body,
                headers: { 'Content-Type': 'application/json' },
            });

            if (save_response_to) {
                this.context.variables[save_response_to] = response.data;
            }
        } catch (error) {
            logger.error(`HTTP request failed: ${error.message}`);
            this.context.variables[save_response_to] = { error: error.message };
        }

        return true;
    }

    /**
     * Execute assign_to_human node
     */
    async executeAssignToHuman(node) {
        const { message } = node.data;

        if (message) {
            await this.whatsapp.sendText(this.conversation.contact_phone, message);
            await this.logMessage('outgoing', message, 'text');
        }

        // Update conversation status
        await supabaseAdmin
            .from('conversations')
            .update({ status: 'human' })
            .eq('id', this.conversation.id);

        return false; // Stop bot execution
    }

    /**
     * Find node by ID
     */
    findNodeById(bot, nodeId) {
        return bot.flow_json.nodes.find(n => n.id === nodeId);
    }

    /**
     * Find next node
     */
    findNextNode(bot, currentNode) {
        const edge = bot.flow_json.edges.find(e => e.source === currentNode.id);
        return edge ? this.findNodeById(bot, edge.target) : null;
    }

    /**
     * Validate user response
     */
    validateResponse(response, validation) {
        if (!validation) return true;

        switch (validation.type) {
            case 'text':
                return typeof response === 'string' && response.length > 0;
            case 'number':
                return !isNaN(Number(response));
            case 'email':
                return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(response);
            case 'phone':
                return /^\+[1-9]\d{1,14}$/.test(response);
            default:
                return true;
        }
    }

    /**
     * Log message to database
     */
    async logMessage(direction, content, type) {
        await supabaseAdmin.from('messages').insert({
            conversation_id: this.conversation.id,
            direction,
            content,
            type,
            status: direction === 'outgoing' ? 'sent' : 'received',
        });
    }

    /**
     * Save context to database
     */
    async saveContext() {
        await supabaseAdmin
            .from('conversation_contexts')
            .upsert({
                conversation_id: this.conversation.id,
                bot_id: this.context.bot_id,
                current_node_id: this.context.current_node_id,
                waiting_for: this.context.waiting_for,
                variables: this.context.variables,
                flow_history: this.context.flow_history,
            }, { onConflict: 'conversation_id' });
    }

    /**
     * Handle execution error
     */
    async handleError(error) {
        await this.whatsapp.sendText(
            this.conversation.contact_phone,
            'Sorry, something went wrong. Please try again later.'
        );

        await this.logMessage('outgoing', 'Error: ' + error.message, 'text');
    }
}
