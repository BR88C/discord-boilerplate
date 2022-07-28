import { ClientManager } from './ClientManager';

import { LoggerRawFormats } from '@br88c/node-utils';
import { InfluxDB, Point } from '@influxdata/influxdb-client';
import { InteractionType } from 'discord-api-types/v10';
import { GatewayShardState } from 'distype';

/**
 * {@link Metrics} options.
 */
export interface MetricsOptions {
    /**
     * InfluxDB metrics reporting options.
     */
    influxDB?: {
        /**
         * The application's name.
         */
        application: string
        /**
         * The InfluxDB bucket to use.
         */
        bucket: string
        /**
         * Extra default tags to use.
         */
        extraTags?: Record<string, any>
        /**
         * The InfluxDB organization to use.
         */
        org: string
        /**
         * The interval to automatically report metrics to InfluxDB at in milliseconds.
         * A value of `0` will not report any metrics automatically.
         * @default 0
         */
        reportInterval?: number
        /**
         * The token to access InfluxDB.
         */
        token: string
        /**
         * The URL to connect to.
         */
        url: string
    },
    /**
     * Top.gg metrics reporting options.
     */
    topgg?: {
        /**
         * The interval to automatically report metrics to Top.gg at in milliseconds.
         * A value of `0` will not report any metrics automatically.
         * @default 0
         */
        reportInterval?: number
        /**
         * If the shard count should be posted.
         * @default false
         */
        postShards?: boolean
        /**
         * Your Top.gg API token.
         * Alternatively, if `process.env.TOPGG_TOKEN` is defined, it will be used.
         */
        token?: string
    }
}

/**
 * The metrics controller.
 * Reports metrics to InfluxDB.
 */
export class Metrics {
    /**
     * The client the metrics controller is bound to.
     */
    public client: ClientManager;
    /**
     * The InfluxDB client.
     */
    public influxClient?: InfluxDB;

    /**
     * {@link MetricsOptions Options} for the metrics controller..
     */
    public readonly options: {
        influxDB: Required<MetricsOptions[`influxDB`]>
        topgg: Required<MetricsOptions[`topgg`]>
    };
    /**
     * The system string used for logging.
     */
    public readonly system = `Metrics`;

    /**
     * Command usage.
     */
    private _commands: Record<string, number> = {};
    /**
     * Command error occurrences.
     */
    private _commandErrors: Record<string, number> = {};
    /**
     * The callback to use to fetch extra points when reporting metrics to InfluxDB.
     */
    private _influxDBCallback: (() => Point[] | Promise<Point[]>) | null = null;
    /**
     * The last recorded CPU metrics.
     */
    private _lastCPUMetrics: {
        usage: NodeJS.CpuUsage,
        time: number
    } = {
            usage: process.cpuUsage(),
            time: Date.now()
        };

    /**
     * Create the metrics controller.
     * @param client The client to bind to.
     */
    constructor (client: ClientManager, options: MetricsOptions) {
        this.options = {
            influxDB: options.influxDB ? {
                application: options.influxDB.application,
                bucket: options.influxDB.bucket,
                extraTags: options.influxDB.extraTags ?? {},
                org: options.influxDB.org,
                reportInterval: options.influxDB.reportInterval ?? 0,
                token: options.influxDB.token,
                url: options.influxDB.url
            } : undefined,
            topgg: options.topgg ? {
                reportInterval: options.topgg.reportInterval ?? 0,
                postShards: options.topgg.postShards ?? false,
                token: options.topgg.token ?? process.env.TOPGG_TOKEN!
            } : undefined
        };

        this.client = client;

        if (this.options.influxDB) {
            this.influxClient = new InfluxDB({
                token: this.options.influxDB.token,
                url: this.options.influxDB.url
            });

            if (this.options.influxDB.reportInterval) {
                setInterval(() => {
                    this.reportInfluxDBMetrics().catch((error) => {
                        console.error(`\n${LoggerRawFormats.RED}${error.stack}${LoggerRawFormats.RESET}\n`);
                    });
                }, this.options.influxDB.reportInterval).unref();
            }
        }

        if (this.options.topgg) {
            if (!this.options.topgg.token) throw new Error(`Top.gg API token is undefined`);

            if (this.options.topgg.reportInterval) {
                setInterval(() => {
                    this.reportTopggMetrics().catch((error) => {
                        console.error(`\n${LoggerRawFormats.RED}${error.stack}${LoggerRawFormats.RESET}\n`);
                    });
                }, this.options.topgg.reportInterval).unref();
            }
        }

        this.client.gateway.on(`INTERACTION_CREATE`, ({ d }) => {
            if (d.type === InteractionType.ApplicationCommand && (this.client.commandHandler.commands.has(d.data.id))) {
                this._commands[d.data.name] ??= 0;
                this._commands[d.data.name]++;
            }
        });

        this.client.logger.log(`Initialized metrics controller`, {
            level: `DEBUG`, system: this.system
        });
    }

    /**
     * Increment error occurrences for a command.
     * Used internally.
     * @param command The command that encountered an error.
     * @internal
     */
    public incrementCommandError (command: string): void {
        this._commandErrors[command] ??= 0;
        this._commandErrors[command]++;
    }

    /**
     * Reports metrics to InfluxDB.
     */
    public async reportInfluxDBMetrics (): Promise<void> {
        if (!this.options.influxDB || !this.influxClient) throw new Error(`Cannot post to InfluxDB; options not defined`);

        const usage = process.cpuUsage();
        const time = Date.now();

        const stats = {
            commands: this._commands,
            commandErrors: this._commandErrors,
            cpu: 100 * ((usage.system - this._lastCPUMetrics.usage.system) + (usage.user - this._lastCPUMetrics.usage.user)) / ((time - this._lastCPUMetrics.time) * 1000),
            memory: process.memoryUsage.rss(),
            rest: this.client.rest.responseCodeTally,
            shardCount: this.client.gateway.shards.size,
            shardGuilds: this.client.gateway.guildCount,
            shardPing: this.client.gateway.averagePing,
            shards: this.client.gateway.shards.map((shard) => ({
                id: shard.id,
                guilds: shard.guilds.size,
                ping: shard.ping,
                state: GatewayShardState[shard.state]
            }))
        };

        this._lastCPUMetrics = {
            usage,
            time
        };

        const writeAPI = this.influxClient.getWriteApi(this.options.influxDB.org, this.options.influxDB.bucket);
        writeAPI.useDefaultTags({
            application: this.options.influxDB.application,
            ...this.options.influxDB.extraTags
        });

        const processPoint = new Point(`process`)
            .floatField(`cpu`, stats.cpu)
            .intField(`memory`, stats.memory)
            .intField(`shards`, stats.shardCount)
            .intField(`guilds`, stats.shardGuilds)
            .floatField(`ping`, stats.shardPing);

        const commandPoints: Point[] = [];
        Object.entries(stats.commands).forEach(([command, count]) => {
            commandPoints.push(
                new Point(`command`)
                    .tag(`name`, command)
                    .intField(`count`, count)
            );
        });

        const commandErrorPoints: Point[] = [];
        Object.entries(stats.commands).forEach(([command, count]) => {
            commandErrorPoints.push(
                new Point(`commandError`)
                    .tag(`name`, command)
                    .intField(`count`, count)
            );
        });

        const restPoints: Point[] = [];
        Object.entries(stats.rest).forEach(([code, count]) => {
            restPoints.push(
                new Point(`rest`)
                    .tag(`code`, code)
                    .intField(`count`, count)
            );
        });

        const shardPoints: Point[] = [];
        stats.shards.forEach((shard) => {
            shardPoints.push(
                new Point(`shard`)
                    .tag(`id`, `${shard.id}`)
                    .intField(`guilds`, shard.guilds)
                    .intField(`ping`, shard.ping)
                    .stringField(`state`, shard.state)
            );
        });

        const extraPoints = (await this._influxDBCallback?.()) ?? [];

        const points = [processPoint, ...commandPoints, ...commandErrorPoints, ...restPoints, ...shardPoints, ...extraPoints];
        writeAPI.writePoints(points);

        await writeAPI.close();

        this.client.logger.log(`Wrote ${points.length} points to InfluxDB`, {
            level: `DEBUG`, system: this.system
        });
    }

    /**
     * Reports metrics to Top.gg.
     */
    public async reportTopggMetrics (): Promise<void> {
        if (!this.options.topgg) throw new Error(`Cannot post to Top.gg; options not defined`);

        await this.client.topggRequest(`POST`, `/bots/stats`, { body: {
            server_count: this.client.gateway.guildCount,
            shard_count: this.options.topgg.postShards ? this.client.gateway.shards.size : undefined
        } }, this.options.topgg.token);

        this.client.logger.log(`Posted metrics to Top.gg`, {
            level: `DEBUG`, system: this.system
        });
    }

    /**
     * Set a callback to be used to fetch extra points when reporting metrics to InfluxDB.
     */
    public setInfluxDBCallback (callback: () => Point[] | Promise<Point[]>): void {
        this._influxDBCallback = callback;
    }
}
