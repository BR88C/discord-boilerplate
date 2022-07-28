"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClientManager = void 0;
const Metrics_1 = require("./Metrics");
const node_utils_1 = require("@br88c/node-utils");
const cmd_1 = require("@distype/cmd");
const v10_1 = require("discord-api-types/v10");
const distype_1 = require("distype");
/**
 * The client manager.
 */
class ClientManager extends distype_1.Client {
    /**
     * The client's command handler.
     */
    commandHandler;
    /**
     * The client's logger.
     */
    logger;
    /**
     * The client's metrics controller.
     */
    metrics;
    /**
     * Create the client manager.
     * @param token The bot's token.
     * @param tokenFilters Filters to apply to error messages and the logger.
     * @param metricsOptions Metrics options.
     * @param clientOptions Client options.
     */
    constructor(token, tokenFilters, metricsOptions, clientOptions) {
        const logger = new node_utils_1.Logger({
            enabledOutput: { log: [`DEBUG`, `INFO`, `WARN`, `ERROR`] },
            sanitizeTokens: tokenFilters
        });
        super(token, clientOptions, logger.log, logger);
        this.commandHandler = new cmd_1.CommandHandler(this, logger.log, logger);
        this.logger = logger;
        this.metrics = new Metrics_1.Metrics(this, metricsOptions);
    }
    /**
     * Sets the command handler's error methods.
     * @param supportServer The bot's support server.
     */
    setErrorCallbacks(supportServer) {
        this.commandHandler
            .setError(async (ctx, error, unexpected) => {
            if (ctx instanceof cmd_1.ChatCommandContext || ctx instanceof cmd_1.ContextMenuCommandContext) {
                this.metrics.incrementCommandError(ctx.command?.name ?? `Unknown`);
            }
            const errorId = `${Math.round(Math.random() * 1e6).toString(36).padStart(5, `0`)}${Date.now().toString(36)}`.toUpperCase();
            this.logger.log(`${unexpected ? `Unexpected ` : ``}${error.name} (ID: ${errorId}) when running interaction ${ctx.interaction.id}: ${error.message}`, {
                level: `ERROR`, system: `Command Handler`
            });
            if (unexpected) {
                console.error(`\n${node_utils_1.LoggerRawFormats.RED}${error.stack}${node_utils_1.LoggerRawFormats.RESET}\n`);
            }
            const tokenFilter = [
                ...[this.logger.options.sanitizeTokens].flat(),
                {
                    token: ctx.interaction.token,
                    replacement: `%interaction_token%`
                }
            ];
            await ctx.sendEphemeral(new cmd_1.Embed()
                .setColor(cmd_1.DiscordColors.BRANDING_RED)
                .setTitle(`Error`)
                .setDescription(`\`\`\`\n${(0, node_utils_1.sanitizeTokens)(error.message, tokenFilter)}\n\`\`\`${supportServer ? `\n*Support Server: ${supportServer}*` : ``}`)
                .setFooter(`Error ID: ${errorId}`)
                .setTimestamp());
        })
            .setExpireError((ctx, error, unexpected) => {
            this.logger.log(`${unexpected ? `Unexpected ` : ``}${error.name} when running expire callback for component "${ctx.component.customId}" (${v10_1.ComponentType[ctx.component.type]})`, {
                level: `ERROR`, system: `Command Handler`
            });
            if (unexpected) {
                console.error(`\n${node_utils_1.LoggerRawFormats.RED}${error.stack}${node_utils_1.LoggerRawFormats.RESET}\n`);
            }
        });
        return this;
    }
    /**
     * Initializes the client manager.
     * @param loadInteractions Interaction directories to load.
     */
    async init(...loadInteractions) {
        for (const dir of loadInteractions) {
            await this.commandHandler.load(dir);
        }
        await this.gateway.connect();
        await this.commandHandler.push();
    }
    /**
     * Makes a Top.gg API request.
     * @param method The request's method.
     * @param route The requests's route, relative to the base Top.gg API URL.
     * @param options Request options.
     * @param token Your Top.gg API token. Alternatively, if `process.env.TOPGG_TOKEN` is defined, it will be used.
     * @returns The response body.
     */
    async topggRequest(method, route, options, token) {
        if (!token?.length && !process.env.TOPGG_TOKEN?.length)
            throw new Error(`Top.gg API token is undefined`);
        return (await this.rest.make(method, route, {
            authHeader: token ?? process.env.TOPGG_TOKEN,
            customBaseURL: `https://top.gg/api`,
            forceHeaders: true,
            ...options
        })).body;
    }
}
exports.ClientManager = ClientManager;
