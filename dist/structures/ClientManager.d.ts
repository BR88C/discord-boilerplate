import { Metrics, MetricsOptions } from './Metrics';
import { Logger, TokenFilter } from '@br88c/node-utils';
import { CommandHandler } from '@distype/cmd';
import { Client, ClientOptions, RestMethod, RestRequestData, RestRoute } from 'distype';
/**
 * The client manager.
 */
export declare class ClientManager extends Client {
    /**
     * The client's command handler.
     */
    commandHandler: CommandHandler;
    /**
     * The client's logger.
     */
    logger: Logger;
    /**
     * The client's metrics controller.
     */
    metrics: Metrics;
    /**
     * Create the client manager.
     * @param token The bot's token.
     * @param tokenFilters Filters to apply to error messages and the logger.
     * @param metricsOptions Metrics options.
     * @param clientOptions Client options.
     */
    constructor(token: string, tokenFilters: TokenFilter[], metricsOptions: MetricsOptions, clientOptions: ClientOptions);
    /**
     * Sets the command handler's error methods.
     * @param supportServer The bot's support server.
     */
    setErrorCallbacks(supportServer?: string): this;
    /**
     * Initializes the client manager.
     * @param loadInteractions Interaction directories to load.
     */
    init(...loadInteractions: string[]): Promise<void>;
    /**
     * Makes a Top.gg API request.
     * @param method The request's method.
     * @param route The requests's route, relative to the base Top.gg API URL.
     * @param options Request options.
     * @param token Your Top.gg API token. Alternatively, if `process.env.TOPGG_TOKEN` is defined, it will be used.
     * @returns The response body.
     */
    topggRequest(method: RestMethod, route: RestRoute, options?: RestRequestData, token?: string): Promise<any>;
}
