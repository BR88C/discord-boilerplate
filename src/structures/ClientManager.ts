import { Metrics, MetricsOptions } from './Metrics';

import { Logger, LoggerRawFormats, sanitizeTokens, TokenFilter } from '@br88c/node-utils';
import { ChatCommandContext, CommandHandler, ContextMenuCommandContext, DiscordColors, Embed } from '@distype/cmd';
import { ComponentType } from 'discord-api-types/v10';
import { Client, ClientOptions, RestMethod, RestRequestData, RestRoute } from 'distype';

/**
 * The client manager.
 */
export class ClientManager extends Client {
    /**
     * The client's command handler.
     */
    public commandHandler: CommandHandler;
    /**
     * The client's logger.
     */
    public logger: Logger;
    /**
     * The client's metrics controller.
     */
    public metrics: Metrics;

    /**
     * Create the client manager.
     * @param token The bot's token.
     * @param tokenFilters Filters to apply to error messages and the logger.
     * @param metricsOptions Metrics options.
     * @param clientOptions Client options.
     */
    constructor (token: string, tokenFilters: TokenFilter[], metricsOptions: MetricsOptions, clientOptions: ClientOptions) {
        const logger = new Logger({
            enabledOutput: { log: [`DEBUG`, `INFO`, `WARN`, `ERROR`] },
            sanitizeTokens: tokenFilters
        });

        super(token, clientOptions, logger.log, logger);

        this.commandHandler = new CommandHandler(this, logger.log, logger);
        this.logger = logger;
        this.metrics = new Metrics(this, metricsOptions);
    }

    /**
     * Sets the command handler's error methods.
     * @param supportServer The bot's support server.
     */
    public setErrorCallbacks (supportServer?: string): this {
        this.commandHandler
            .setError(async (ctx, error, unexpected) => {
                if (ctx instanceof ChatCommandContext || ctx instanceof ContextMenuCommandContext) {
                    this.metrics.incrementCommandError(ctx.command?.name ?? `Unknown`);
                }

                const errorId = `${Math.round(Math.random() * 1e6).toString(36).padStart(5, `0`)}${Date.now().toString(36)}`.toUpperCase();

                this.logger.log(`${unexpected ? `Unexpected ` : ``}${error.name} (ID: ${errorId}) when running interaction ${ctx.interaction.id}: ${error.message}`, {
                    level: `ERROR`, system: `Command Handler`
                });

                if (unexpected) {
                    console.error(`\n${LoggerRawFormats.RED}${error.stack}${LoggerRawFormats.RESET}\n`);
                }

                const tokenFilter = [
                    ...[(this.logger.options.sanitizeTokens as TokenFilter | TokenFilter[])].flat(),
                    {
                        token: ctx.interaction.token,
                        replacement: `%interaction_token%`
                    }
                ];

                await ctx.sendEphemeral(
                    new Embed()
                        .setColor(DiscordColors.BRANDING_RED)
                        .setTitle(`Error`)
                        .setDescription(`\`\`\`\n${sanitizeTokens(error.message, tokenFilter)}\n\`\`\`${supportServer ? `\n*Support Server: ${supportServer}*` : ``}`)
                        .setFooter(`Error ID: ${errorId}`)
                        .setTimestamp()
                );
            })
            .setExpireError((ctx, error, unexpected) => {
                this.logger.log(`${unexpected ? `Unexpected ` : ``}${error.name} when running expire callback for component "${ctx.component.customId}" (${ComponentType[ctx.component.type]})`, {
                    level: `ERROR`, system: `Command Handler`
                });

                if (unexpected) {
                    console.error(`\n${LoggerRawFormats.RED}${error.stack}${LoggerRawFormats.RESET}\n`);
                }
            });

        return this;
    }

    /**
     * Initializes the client manager.
     * @param loadInteractions Interaction directories to load.
     */
    public async init (...loadInteractions: string[]): Promise<void> {
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
    public async topggRequest (method: RestMethod, route: RestRoute, options?: RestRequestData, token?: string): Promise<any> {
        if (!token?.length && !process.env.TOPGG_TOKEN?.length) throw new Error(`Top.gg API token is undefined`);

        return (await this.rest.make(method, route, {
            authHeader: token ?? process.env.TOPGG_TOKEN,
            customBaseURL: `https://top.gg/api`,
            forceHeaders: true,
            ...options
        })).body;
    }
}
